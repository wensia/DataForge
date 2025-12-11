"""Redis 客户端单例模块

提供两种 Redis 客户端:
- get_redis_client(): 字符串模式，用于 JSON 数据（如 API 密钥验证）
- get_redis_binary_client(): 二进制模式，用于音频等二进制数据
- get_async_redis(): 异步客户端，用于 SSE 等异步场景
- publish_log(): 同步发布日志到 Redis 频道
- subscribe_logs(): 异步订阅日志频道
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
