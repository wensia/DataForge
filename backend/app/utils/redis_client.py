"""Redis 客户端单例模块

提供两种 Redis 客户端:
- get_redis_client(): 字符串模式，用于 JSON 数据（如 API 密钥验证）
- get_redis_binary_client(): 二进制模式，用于音频等二进制数据
- get_async_redis(): 异步客户端，用于 SSE 等异步场景
- publish_log(): 同步发布日志到 Redis 频道
- subscribe_logs(): 异步订阅日志频道

任务日志相关（使用 Redis List 持久化存储）:
- rpush_log(): 追加日志到 Redis List
- get_logs() / get_logs_async(): 获取日志列表
- set_execution_status(): 设置执行状态
- get_execution_status() / get_execution_status_async(): 获取执行状态
- cleanup_execution_redis(): 清理 Redis 数据
"""

import redis
import redis.asyncio as aioredis
from loguru import logger

from app.config import settings

_redis_client: redis.Redis | None = None
_redis_binary_client: redis.Redis | None = None
_async_redis_client: aioredis.Redis | None = None

# 任务日志频道前缀
LOG_CHANNEL_PREFIX = "task_logs:"

# 任务日志 Redis Key 设计
# task_logs:{exec_id}:logs   - List 存储日志行
# task_logs:{exec_id}:status - String 存储状态 (running/completed/failed)
LOG_LIST_SUFFIX = ":logs"
STATUS_KEY_SUFFIX = ":status"
LOG_TTL_SECONDS = 3600  # 日志数据 TTL: 1 小时


def get_redis_client() -> redis.Redis | None:
    """获取 Redis 客户端（字符串模式，用于 JSON 数据）

    Returns:
        Redis 客户端实例，连接失败返回 None
    """
    global _redis_client
    if _redis_client is None and settings.redis_url:
        try:
            _redis_client = redis.from_url(
                settings.redis_url,
                decode_responses=True,  # 返回字符串
                socket_connect_timeout=2,
                socket_timeout=2,
            )
            _redis_client.ping()
            logger.info("Redis 字符串客户端连接成功")
        except Exception as e:
            logger.warning(f"Redis 连接失败: {e}")
            _redis_client = None
    return _redis_client


def get_redis_binary_client() -> redis.Redis | None:
    """获取 Redis 客户端（二进制模式，用于音频等二进制数据）

    Returns:
        Redis 客户端实例，连接失败返回 None
    """
    global _redis_binary_client
    if _redis_binary_client is None and settings.redis_url:
        try:
            _redis_binary_client = redis.from_url(
                settings.redis_url,
                decode_responses=False,  # 返回 bytes
                socket_connect_timeout=2,
                socket_timeout=2,
            )
            _redis_binary_client.ping()
            logger.info("Redis 二进制客户端连接成功")
        except Exception as e:
            logger.warning(f"Redis 连接失败: {e}")
            _redis_binary_client = None
    return _redis_binary_client


async def get_async_redis() -> aioredis.Redis | None:
    """获取异步 Redis 客户端

    用于 SSE 端点等异步场景的 Pub/Sub 订阅。

    Returns:
        异步 Redis 客户端实例，连接失败返回 None
    """
    global _async_redis_client
    if _async_redis_client is None and settings.redis_url:
        try:
            _async_redis_client = aioredis.from_url(
                settings.redis_url,
                decode_responses=True,
            )
            await _async_redis_client.ping()
            logger.info("Redis 异步客户端连接成功")
        except Exception as e:
            logger.warning(f"Redis 异步连接失败: {e}")
            _async_redis_client = None
    return _async_redis_client


def publish_log(execution_id: int, message: str) -> bool:
    """同步发布日志到 Redis 频道

    用于任务执行器（在独立线程中运行）发布日志。

    Args:
        execution_id: 任务执行 ID
        message: 日志消息

    Returns:
        是否发布成功
    """
    client = get_redis_client()
    if client is None:
        return False
    try:
        channel = f"{LOG_CHANNEL_PREFIX}{execution_id}"
        client.publish(channel, message)
        return True
    except Exception as e:
        logger.warning(f"发布日志失败: {e}")
        return False


def publish_log_end(execution_id: int) -> bool:
    """发布任务结束信号

    Args:
        execution_id: 任务执行 ID

    Returns:
        是否发布成功
    """
    return publish_log(execution_id, "__END__")


async def subscribe_logs(execution_id: int) -> aioredis.client.PubSub | None:
    """异步订阅日志频道

    用于 SSE 端点订阅实时日志。

    Args:
        execution_id: 任务执行 ID

    Returns:
        PubSub 对象，连接失败返回 None
    """
    client = await get_async_redis()
    if client is None:
        return None
    try:
        pubsub = client.pubsub()
        channel = f"{LOG_CHANNEL_PREFIX}{execution_id}"
        await pubsub.subscribe(channel)
        return pubsub
    except Exception as e:
        logger.warning(f"订阅日志频道失败: {e}")
        return None


# ========== 任务日志 Redis List 相关函数 ==========


def _get_log_list_key(execution_id: int) -> str:
    """获取日志 List 的 Redis Key"""
    return f"{LOG_CHANNEL_PREFIX}{execution_id}{LOG_LIST_SUFFIX}"


def _get_status_key(execution_id: int) -> str:
    """获取状态的 Redis Key"""
    return f"{LOG_CHANNEL_PREFIX}{execution_id}{STATUS_KEY_SUFFIX}"


def rpush_log(execution_id: int, log_line: str) -> bool:
    """追加日志到 Redis List

    Args:
        execution_id: 任务执行 ID
        log_line: 日志行

    Returns:
        是否成功
    """
    client = get_redis_client()
    if client is None:
        return False
    try:
        key = _get_log_list_key(execution_id)
        # 使用 pipeline 合并 rpush + expire，减少 RTT
        pipe = client.pipeline()
        pipe.rpush(key, log_line)
        pipe.expire(key, LOG_TTL_SECONDS)
        pipe.execute()
        return True
    except Exception as e:
        logger.warning(f"追加日志到 Redis List 失败: {e}")
        return False


def get_logs(execution_id: int, start: int = 0, end: int = -1) -> list[str]:
    """获取日志列表（同步）

    Args:
        execution_id: 任务执行 ID
        start: 起始索引（默认 0）
        end: 结束索引（默认 -1 表示全部）

    Returns:
        日志行列表
    """
    client = get_redis_client()
    if client is None:
        return []
    try:
        key = _get_log_list_key(execution_id)
        return client.lrange(key, start, end)
    except Exception as e:
        logger.warning(f"获取 Redis 日志列表失败: {e}")
        return []


async def get_logs_async(execution_id: int, start: int = 0, end: int = -1) -> list[str]:
    """获取日志列表（异步）

    Args:
        execution_id: 任务执行 ID
        start: 起始索引（默认 0）
        end: 结束索引（默认 -1 表示全部）

    Returns:
        日志行列表
    """
    client = await get_async_redis()
    if client is None:
        return []
    try:
        key = _get_log_list_key(execution_id)
        return await client.lrange(key, start, end)
    except Exception as e:
        logger.warning(f"获取 Redis 日志列表失败: {e}")
        return []


def get_logs_count(execution_id: int) -> int:
    """获取日志行数（同步）

    Args:
        execution_id: 任务执行 ID

    Returns:
        日志行数
    """
    client = get_redis_client()
    if client is None:
        return 0
    try:
        key = _get_log_list_key(execution_id)
        return client.llen(key)
    except Exception as e:
        logger.warning(f"获取 Redis 日志行数失败: {e}")
        return 0


async def get_logs_count_async(execution_id: int) -> int:
    """获取日志行数（异步）

    Args:
        execution_id: 任务执行 ID

    Returns:
        日志行数
    """
    client = await get_async_redis()
    if client is None:
        return 0
    try:
        key = _get_log_list_key(execution_id)
        return await client.llen(key)
    except Exception as e:
        logger.warning(f"获取 Redis 日志行数失败: {e}")
        return 0


def set_execution_status(execution_id: int, status: str) -> bool:
    """设置执行状态

    Args:
        execution_id: 任务执行 ID
        status: 状态 (running/completed/failed)

    Returns:
        是否成功
    """
    client = get_redis_client()
    if client is None:
        return False
    try:
        key = _get_status_key(execution_id)
        client.set(key, status, ex=LOG_TTL_SECONDS)
        return True
    except Exception as e:
        logger.warning(f"设置执行状态失败: {e}")
        return False


def get_execution_status(execution_id: int) -> str | None:
    """获取执行状态（同步）

    Args:
        execution_id: 任务执行 ID

    Returns:
        状态字符串，不存在返回 None
    """
    client = get_redis_client()
    if client is None:
        return None
    try:
        key = _get_status_key(execution_id)
        return client.get(key)
    except Exception as e:
        logger.warning(f"获取执行状态失败: {e}")
        return None


async def get_execution_status_async(execution_id: int) -> str | None:
    """获取执行状态（异步）

    Args:
        execution_id: 任务执行 ID

    Returns:
        状态字符串，不存在返回 None
    """
    client = await get_async_redis()
    if client is None:
        return None
    try:
        key = _get_status_key(execution_id)
        return await client.get(key)
    except Exception as e:
        logger.warning(f"获取执行状态失败: {e}")
        return None


def cleanup_execution_redis(execution_id: int) -> bool:
    """清理执行相关的 Redis 数据

    Args:
        execution_id: 任务执行 ID

    Returns:
        是否成功
    """
    client = get_redis_client()
    if client is None:
        return False
    try:
        log_key = _get_log_list_key(execution_id)
        status_key = _get_status_key(execution_id)
        client.delete(log_key, status_key)
        return True
    except Exception as e:
        logger.warning(f"清理 Redis 数据失败: {e}")
        return False
