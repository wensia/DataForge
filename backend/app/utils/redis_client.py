"""Redis 客户端单例模块

提供两种 Redis 客户端:
- get_redis_client(): 字符串模式，用于 JSON 数据（如 API 密钥验证）
- get_redis_binary_client(): 二进制模式，用于音频等二进制数据
"""

import redis
from loguru import logger

from app.config import settings

_redis_client: redis.Redis | None = None
_redis_binary_client: redis.Redis | None = None


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
