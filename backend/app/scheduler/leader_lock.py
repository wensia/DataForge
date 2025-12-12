"""调度器 leader 锁（Redis）

用于在多进程/多实例部署时保证只有一个实例启动 APScheduler，
避免重复调度造成的幂等/吞吐问题。

实现要点：
1. 使用 Redis SET NX EX 获取锁
2. 通过 Lua 脚本续租/释放（仅在 value 匹配时生效）
3. 锁丢失时自动关闭本地调度器
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Optional

from loguru import logger

from app.config import settings
from app.utils.redis_client import get_redis_client

_lock_value: Optional[str] = None
_renew_task: Optional[asyncio.Task] = None


def _lua_extend_script() -> str:
    # KEYS[1]=key, ARGV[1]=value, ARGV[2]=ttl
    return (
        "if redis.call('get', KEYS[1]) == ARGV[1] then "
        "return redis.call('expire', KEYS[1], ARGV[2]) "
        "else return 0 end"
    )


def _lua_release_script() -> str:
    # KEYS[1]=key, ARGV[1]=value
    return (
        "if redis.call('get', KEYS[1]) == ARGV[1] then "
        "return redis.call('del', KEYS[1]) "
        "else return 0 end"
    )


def acquire_leader_lock() -> bool:
    """尝试获取 leader 锁。

    Returns:
        True 表示当前实例应启动调度器；False 表示已有 leader。
        Redis 不可用时默认返回 True（保持单实例可用性）。
    """
    if not settings.scheduler_leader_lock_enabled:
        return True

    if not settings.redis_url:
        logger.warning("未配置 Redis，跳过 leader 锁")
        return True

    client = get_redis_client()
    if client is None:
        logger.warning("Redis 不可用，跳过 leader 锁")
        return True

    value = uuid.uuid4().hex
    ttl = max(5, settings.scheduler_leader_lock_ttl)
    try:
        ok = client.set(settings.scheduler_leader_lock_key, value, nx=True, ex=ttl)
        if ok:
            global _lock_value
            _lock_value = value
            logger.info("已获取调度器 leader 锁")
            return True

        logger.info("调度器 leader 锁已被其他实例持有，当前实例不启动调度器")
        return False
    except Exception as e:
        logger.warning(f"获取 leader 锁失败: {e}，继续启动调度器")
        return True


async def _renew_loop() -> None:
    """后台续租 leader 锁。"""
    if _lock_value is None:
        return

    client = get_redis_client()
    if client is None:
        return

    key = settings.scheduler_leader_lock_key
    ttl = max(5, settings.scheduler_leader_lock_ttl)
    interval = max(1, settings.scheduler_leader_lock_refresh_interval)

    script = _lua_extend_script()
    while True:
        try:
            await asyncio.sleep(interval)
            if _lock_value is None:
                return

            # 仅在 value 匹配时续租
            ok = client.eval(script, 1, key, _lock_value, ttl)
            if ok == 0:
                logger.error("调度器 leader 锁已丢失，关闭本地调度器")
                from app.scheduler.core import shutdown_scheduler

                shutdown_scheduler()
                return
        except asyncio.CancelledError:
            return
        except Exception as e:
            # 续租失败不立即停止，下一轮重试
            logger.warning(f"leader 锁续租失败: {e}")


def start_renewal_task() -> None:
    """启动续租任务（需先成功获取锁）。"""
    global _renew_task
    if not settings.scheduler_leader_lock_enabled or _lock_value is None:
        return
    if _renew_task is None or _renew_task.done():
        _renew_task = asyncio.create_task(_renew_loop())


async def stop_renewal_task() -> None:
    """停止续租任务。"""
    global _renew_task
    if _renew_task and not _renew_task.done():
        _renew_task.cancel()
        try:
            await _renew_task
        except Exception:
            pass
    _renew_task = None


def release_leader_lock() -> None:
    """释放 leader 锁（仅当当前实例持有）。"""
    global _lock_value
    if not settings.scheduler_leader_lock_enabled or _lock_value is None:
        return

    client = get_redis_client()
    if client is None:
        _lock_value = None
        return

    key = settings.scheduler_leader_lock_key
    script = _lua_release_script()
    try:
        client.eval(script, 1, key, _lock_value)
    except Exception as e:
        logger.warning(f"释放 leader 锁失败: {e}")
    finally:
        _lock_value = None

