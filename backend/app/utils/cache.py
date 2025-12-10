"""Redis 缓存工具（支持降级到内存缓存）"""

from datetime import datetime

from loguru import logger

from app.config import settings
from app.utils.redis_client import get_redis_binary_client


class RedisCache:
    """基于 Redis 的 TTL 缓存（Redis 不可用时降级到内存）"""

    def __init__(self, prefix: str, ttl_seconds: int = 180):
        """初始化缓存

        Args:
            prefix: Redis 键前缀，用于隔离不同用途的缓存
            ttl_seconds: 缓存过期时间（秒）
        """
        self._prefix = prefix
        self._ttl = ttl_seconds
        # 内存降级缓存
        self._fallback: dict[str, tuple[bytes, float]] = {}

    def _key(self, key: str) -> str:
        """生成带前缀的 Redis 键"""
        return f"{self._prefix}:{key}"

    def get(self, key: str) -> bytes | None:
        """获取缓存值

        优先从 Redis 获取，Redis 不可用时从内存缓存获取
        """
        redis_client = get_redis_binary_client()
        if redis_client:
            try:
                data = redis_client.get(self._key(key))
                if data:
                    logger.debug(f"Redis 缓存命中: {self._prefix}:{key[:8]}...")
                return data
            except Exception as e:
                logger.warning(f"Redis get 失败，降级到内存: {e}")
        # 降级到内存
        return self._get_fallback(key)

    def set(self, key: str, content: bytes) -> None:
        """设置缓存值

        优先写入 Redis，Redis 不可用时写入内存缓存
        """
        redis_client = get_redis_binary_client()
        if redis_client:
            try:
                redis_client.setex(self._key(key), self._ttl, content)
                logger.debug(f"Redis写入: {self._prefix}:{key[:8]}...({len(content)}B)")
                return
            except Exception as e:
                logger.warning(f"Redis set 失败，降级到内存: {e}")
        # 降级到内存
        self._set_fallback(key, content)

    def _get_fallback(self, key: str) -> bytes | None:
        """从内存降级缓存获取"""
        if key not in self._fallback:
            return None
        content, ts = self._fallback[key]
        if datetime.now().timestamp() - ts > self._ttl:
            del self._fallback[key]
            return None
        logger.debug(f"内存缓存命中: {self._prefix}:{key[:8]}...")
        return content

    def _set_fallback(self, key: str, content: bytes) -> None:
        """写入内存降级缓存"""
        # 清理过期条目
        self._cleanup_fallback()
        self._fallback[key] = (content, datetime.now().timestamp())
        logger.debug(
            f"内存缓存写入: {self._prefix}:{key[:8]}... ({len(content)} bytes)"
        )

    def _cleanup_fallback(self) -> None:
        """清理过期的内存缓存条目"""
        now = datetime.now().timestamp()
        expired = [k for k, (_, ts) in self._fallback.items() if now - ts > self._ttl]
        for k in expired:
            del self._fallback[k]

    def size(self) -> int:
        """返回内存缓存条目数量（仅用于调试）"""
        return len(self._fallback)

    def clear(self) -> None:
        """清空内存缓存（Redis 缓存会自动过期）"""
        self._fallback.clear()


# 全局录音缓存实例
record_cache = RedisCache(prefix="record", ttl_seconds=settings.record_cache_ttl)
