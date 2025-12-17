"""任务分布式锁模块

使用 Redis 实现分布式锁，防止同一任务并发执行。

设计原则（参考 Celery Task Cookbook）:
1. 使用 SET NX EX 原子操作获取锁
2. 使用 Lua 脚本原子释放锁（防止误删）
3. 锁自动过期，防止死锁
4. 降级策略：Redis 不可用时允许执行
5. 提供上下文管理器确保锁一定被释放

参考文档:
- https://docs.celeryq.dev/en/latest/tutorials/task-cookbook.html
- https://redis.io/docs/manual/patterns/distributed-locks/
"""

import uuid
from contextlib import contextmanager
from typing import Generator

from loguru import logger

from app.utils.redis_client import get_redis_client


# ============================================================================
# 异常定义
# ============================================================================


class TaskLockError(Exception):
    """任务锁相关异常"""

    pass


class TaskLockAcquireError(TaskLockError):
    """无法获取任务锁"""

    pass

# 当前 worker 的唯一标识
_worker_id = str(uuid.uuid4())

# Lua 脚本：原子释放锁（只有持有者才能释放）
RELEASE_LOCK_SCRIPT = """
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
"""


def acquire_task_lock(lock_key: str, timeout: int = 3600) -> bool:
    """获取任务锁

    使用 Redis SET NX EX 命令原子获取锁。

    Args:
        lock_key: 锁的 Redis key
        timeout: 锁的过期时间（秒），默认 1 小时

    Returns:
        bool: 是否成功获取锁
    """
    client = get_redis_client()
    if client is None:
        # Redis 不可用时允许执行（降级策略）
        logger.warning(f"Redis 不可用，跳过锁检查: {lock_key}")
        return True

    try:
        # SET key value NX EX timeout
        # NX: 只在 key 不存在时设置
        # EX: 设置过期时间
        result = client.set(lock_key, _worker_id, nx=True, ex=timeout)
        if result:
            logger.debug(f"获取锁成功: {lock_key}")
            return True
        else:
            logger.debug(f"锁已被占用: {lock_key}")
            return False
    except Exception as e:
        logger.warning(f"获取锁失败: {e}")
        return True  # 降级策略：允许执行


def release_task_lock(lock_key: str) -> bool:
    """释放任务锁

    使用 Lua 脚本原子释放锁，只有锁的持有者才能释放。

    Args:
        lock_key: 锁的 Redis key

    Returns:
        bool: 是否成功释放锁
    """
    client = get_redis_client()
    if client is None:
        return True

    try:
        # 使用 Lua 脚本原子释放锁
        result = client.eval(RELEASE_LOCK_SCRIPT, 1, lock_key, _worker_id)
        if result:
            logger.debug(f"释放锁成功: {lock_key}")
        return bool(result)
    except Exception as e:
        logger.warning(f"释放锁失败: {e}")
        return False


def extend_task_lock(lock_key: str, timeout: int = 3600) -> bool:
    """延长锁的过期时间

    用于长时间运行的任务定期续期。
    借鉴 celery-once 的设计，确保长任务不会因锁过期而被重复执行。

    Args:
        lock_key: 锁的 Redis key
        timeout: 新的过期时间（秒）

    Returns:
        bool: 是否成功延期
    """
    client = get_redis_client()
    if client is None:
        return True

    try:
        # 只有锁的持有者才能延期
        current_holder = client.get(lock_key)
        # 处理 bytes/str 类型兼容
        if isinstance(current_holder, bytes):
            current_holder = current_holder.decode("utf-8")
        if current_holder == _worker_id:
            client.expire(lock_key, timeout)
            logger.debug(f"锁已延期: {lock_key}, TTL={timeout}s")
            return True
        logger.debug(f"锁延期失败，非当前持有者: {lock_key}")
        return False
    except Exception as e:
        logger.warning(f"延期锁失败: {e}")
        return False


def is_task_locked(lock_key: str) -> bool:
    """检查任务是否被锁定

    Args:
        lock_key: 锁的 Redis key

    Returns:
        bool: 是否被锁定
    """
    client = get_redis_client()
    if client is None:
        return False

    try:
        return client.exists(lock_key) > 0
    except Exception as e:
        logger.warning(f"检查锁状态失败: {e}")
        return False


def get_lock_holder(lock_key: str) -> str | None:
    """获取锁的持有者

    Args:
        lock_key: 锁的 Redis key

    Returns:
        str | None: 持有者 ID，不存在返回 None
    """
    client = get_redis_client()
    if client is None:
        return None

    try:
        return client.get(lock_key)
    except Exception as e:
        logger.warning(f"获取锁持有者失败: {e}")
        return None


def get_lock_ttl(lock_key: str) -> int:
    """获取锁的剩余过期时间

    Args:
        lock_key: 锁的 Redis key

    Returns:
        int: 剩余秒数，-1 表示永不过期，-2 表示不存在
    """
    client = get_redis_client()
    if client is None:
        return -2

    try:
        return client.ttl(lock_key)
    except Exception as e:
        logger.warning(f"获取锁 TTL 失败: {e}")
        return -2


def force_release_task_lock(lock_key: str) -> bool:
    """强制释放任务锁（管理员操作）

    注意：此操作会直接删除锁，不验证持有者。
    仅用于管理员手动清理卡住的锁。

    Args:
        lock_key: 锁的 Redis key

    Returns:
        bool: 是否成功释放
    """
    client = get_redis_client()
    if client is None:
        return False

    try:
        result = client.delete(lock_key)
        if result:
            logger.warning(f"强制释放锁: {lock_key}")
        return bool(result)
    except Exception as e:
        logger.error(f"强制释放锁失败: {e}")
        return False


def get_lock_info(lock_key: str) -> dict | None:
    """获取锁的详细信息

    Args:
        lock_key: 锁的 Redis key

    Returns:
        dict | None: 锁信息，包含 holder, ttl, exists
    """
    client = get_redis_client()
    if client is None:
        return None

    try:
        holder = client.get(lock_key)
        if holder is None:
            return {"exists": False, "holder": None, "ttl": -2}

        ttl = client.ttl(lock_key)
        return {
            "exists": True,
            "holder": holder,
            "ttl": ttl,
            "is_current_worker": holder == _worker_id,
        }
    except Exception as e:
        logger.warning(f"获取锁信息失败: {e}")
        return None


def list_all_task_locks() -> list[dict]:
    """列出所有任务锁

    Returns:
        list[dict]: 锁列表，每个元素包含 key, holder, ttl
    """
    client = get_redis_client()
    if client is None:
        return []

    try:
        keys = client.keys("task_lock:*")
        locks = []
        for key in keys:
            # Redis keys() 返回的可能是 bytes
            key_str = key.decode() if isinstance(key, bytes) else key
            holder = client.get(key_str)
            ttl = client.ttl(key_str)
            locks.append(
                {
                    "key": key_str,
                    "task_id": key_str.replace("task_lock:", ""),
                    "holder": holder,
                    "ttl": ttl,
                }
            )
        return locks
    except Exception as e:
        logger.warning(f"列出任务锁失败: {e}")
        return []


# ============================================================================
# 上下文管理器
# ============================================================================


@contextmanager
def task_lock_context(
    lock_key: str, timeout: int = 3600, raise_on_fail: bool = True
) -> Generator[bool, None, None]:
    """任务锁上下文管理器

    确保锁在退出时一定被释放，避免手动 try/finally。

    用法:
        with task_lock_context("task_lock:123") as acquired:
            if acquired:
                # 执行任务
                pass

    或者（失败时抛异常）:
        with task_lock_context("task_lock:123", raise_on_fail=True):
            # 执行任务，获取锁失败会抛出 TaskLockAcquireError
            pass

    Args:
        lock_key: 锁的 Redis key
        timeout: 锁的过期时间（秒）
        raise_on_fail: 获取锁失败时是否抛出异常

    Yields:
        bool: 是否成功获取锁

    Raises:
        TaskLockAcquireError: 当 raise_on_fail=True 且获取锁失败时
    """
    acquired = acquire_task_lock(lock_key, timeout)

    if not acquired and raise_on_fail:
        raise TaskLockAcquireError(f"无法获取锁: {lock_key}")

    try:
        yield acquired
    finally:
        if acquired:
            release_task_lock(lock_key)
