"""TTL 内存缓存工具"""

from datetime import datetime


class TTLCache:
    """简单的 TTL 内存缓存"""

    def __init__(self, ttl_seconds: int = 180):
        self._cache: dict[str, tuple[bytes, float]] = {}
        self._ttl = ttl_seconds

    def get(self, key: str) -> bytes | None:
        """获取缓存值，过期返回 None"""
        if key not in self._cache:
            return None
        content, timestamp = self._cache[key]
        if datetime.now().timestamp() - timestamp > self._ttl:
            del self._cache[key]
            return None
        return content

    def set(self, key: str, content: bytes) -> None:
        """设置缓存值"""
        # 清理过期缓存
        self._cleanup()
        self._cache[key] = (content, datetime.now().timestamp())

    def _cleanup(self) -> None:
        """清理过期的缓存条目"""
        now = datetime.now().timestamp()
        expired = [k for k, (_, ts) in self._cache.items() if now - ts > self._ttl]
        for k in expired:
            del self._cache[k]

    def size(self) -> int:
        """返回缓存条目数量"""
        return len(self._cache)

    def clear(self) -> None:
        """清空缓存"""
        self._cache.clear()


# 全局录音缓存实例（3分钟过期）
record_cache = TTLCache(ttl_seconds=180)
