"""任务分布式锁模块

使用 Redis 实现分布式锁，防止同一任务并发执行。

设计原则:
1. 使用 SET NX EX 原子操作获取锁
2. 使用 Lua 脚本原子释放锁（防止误删）
3. 锁自动过期，防止死锁
4. 降级策略：Redis 不可用时允许执行
"""

import uuid

from loguru import logger

from app.utils.redis_client import get_redis_client

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
        if current_holder == _worker_id:
            client.expire(lock_key, timeout)
            logger.debug(f"锁已延期: {lock_key}")
            return True
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
