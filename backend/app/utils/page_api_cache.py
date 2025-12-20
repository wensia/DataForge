"""页面-API 权限缓存

提供 API 路径到页面的映射缓存，以及用户可访问页面的缓存。
支持 Redis 缓存，不可用时降级到内存缓存。

缓存键设计:
- page_api:mapping - Hash: API路径 → 页面ID
- page_api:user:{user_id}:pages - Set: 用户可访问的页面ID集合
"""

import json
from datetime import datetime

from loguru import logger

from app.utils.redis_client import get_redis_client

# 缓存键前缀
CACHE_PREFIX = "page_api"
MAPPING_KEY = f"{CACHE_PREFIX}:mapping"
USER_PAGES_KEY_PREFIX = f"{CACHE_PREFIX}:user:"

# 缓存 TTL（秒）
CACHE_TTL = 300  # 5 分钟


class PageAPICache:
    """页面-API 权限缓存管理器"""

    def __init__(self):
        # 内存降级缓存
        self._mapping_cache: dict[str, int] | None = None
        self._mapping_cache_time: float = 0
        self._user_pages_cache: dict[int, set[int]] = {}
        self._user_pages_cache_time: dict[int, float] = {}

    def _is_cache_valid(self, cache_time: float) -> bool:
        """检查缓存是否在 TTL 内"""
        return datetime.now().timestamp() - cache_time < CACHE_TTL

    # ========== API → Page 映射缓存 ==========

    async def get_api_page_mapping(self) -> dict[str, int]:
        """获取 API 路径到页面 ID 的映射

        Returns:
            {api_path: page_id} 的映射字典
        """
        redis_client = get_redis_client()

        if redis_client:
            try:
                data = redis_client.get(MAPPING_KEY)
                if data:
                    logger.debug("Redis 缓存命中: page_api:mapping")
                    return json.loads(data)
            except Exception as e:
                logger.warning(f"Redis get 失败: {e}")

        # 检查内存缓存
        if self._mapping_cache and self._is_cache_valid(self._mapping_cache_time):
            logger.debug("内存缓存命中: page_api:mapping")
            return self._mapping_cache

        # 缓存未命中，从数据库加载
        return await self._load_api_page_mapping()

    async def _load_api_page_mapping(self) -> dict[str, int]:
        """从数据库加载 API→页面 映射"""
        from sqlmodel import select

        from app.database import get_session
        from app.models.page import Page

        mapping: dict[str, int] = {}

        async for session in get_session():
            stmt = select(Page).where(Page.is_active == True)  # noqa: E712
            result = await session.execute(stmt)
            pages = result.scalars().all()

            for page in pages:
                if page.api_paths:
                    for api_path in page.api_paths:
                        mapping[api_path] = page.id

        # 存入缓存
        self._set_mapping_cache(mapping)
        return mapping

    def _set_mapping_cache(self, mapping: dict[str, int]) -> None:
        """设置映射缓存"""
        redis_client = get_redis_client()

        if redis_client:
            try:
                redis_client.setex(MAPPING_KEY, CACHE_TTL, json.dumps(mapping))
                logger.debug(f"Redis 写入: page_api:mapping ({len(mapping)} 条)")
                return
            except Exception as e:
                logger.warning(f"Redis set 失败: {e}")

        # 降级到内存
        self._mapping_cache = mapping
        self._mapping_cache_time = datetime.now().timestamp()
        logger.debug(f"内存缓存写入: page_api:mapping ({len(mapping)} 条)")

    def invalidate_mapping(self) -> None:
        """使映射缓存失效"""
        redis_client = get_redis_client()

        if redis_client:
            try:
                redis_client.delete(MAPPING_KEY)
                logger.debug("Redis 缓存清除: page_api:mapping")
            except Exception as e:
                logger.warning(f"Redis delete 失败: {e}")

        # 同时清除内存缓存
        self._mapping_cache = None
        self._mapping_cache_time = 0

    # ========== 用户可访问页面缓存 ==========

    async def get_user_accessible_pages(self, user_id: int) -> set[int]:
        """获取用户可访问的页面 ID 集合

        Args:
            user_id: 用户 ID

        Returns:
            可访问的页面 ID 集合
        """
        redis_client = get_redis_client()
        cache_key = f"{USER_PAGES_KEY_PREFIX}{user_id}:pages"

        if redis_client:
            try:
                data = redis_client.get(cache_key)
                if data:
                    logger.debug(f"Redis 缓存命中: {cache_key}")
                    return set(json.loads(data))
            except Exception as e:
                logger.warning(f"Redis get 失败: {e}")

        # 检查内存缓存
        if (
            user_id in self._user_pages_cache
            and user_id in self._user_pages_cache_time
            and self._is_cache_valid(self._user_pages_cache_time[user_id])
        ):
            logger.debug(f"内存缓存命中: user:{user_id}:pages")
            return self._user_pages_cache[user_id]

        # 缓存未命中，从数据库加载
        return await self._load_user_accessible_pages(user_id)

    async def _load_user_accessible_pages(self, user_id: int) -> set[int]:
        """从数据库加载用户可访问的页面"""
        from sqlmodel import or_, select

        from app.database import get_session
        from app.models.page import Page
        from app.models.user import User

        accessible_pages: set[int] = set()

        async for session in get_session():
            # 获取用户角色
            user = await session.get(User, user_id)
            if not user:
                return accessible_pages

            is_admin = user.role == "ADMIN"

            # 管理员可访问所有页面
            if is_admin:
                stmt = select(Page.id).where(Page.is_active == True)  # noqa: E712
                result = await session.execute(stmt)
                accessible_pages = set(result.scalars().all())
            else:
                # 普通用户：公开页面 + 指定用户列表中包含该用户的页面
                stmt = select(Page).where(
                    Page.is_active == True,  # noqa: E712
                    Page.is_admin_only == False,  # noqa: E712
                    or_(
                        Page.is_public == True,  # noqa: E712
                        Page.allowed_user_ids.contains([user_id]),
                    ),
                )
                result = await session.execute(stmt)
                pages = result.scalars().all()
                accessible_pages = {page.id for page in pages}

        # 存入缓存
        self._set_user_pages_cache(user_id, accessible_pages)
        return accessible_pages

    def _set_user_pages_cache(self, user_id: int, page_ids: set[int]) -> None:
        """设置用户页面缓存"""
        redis_client = get_redis_client()
        cache_key = f"{USER_PAGES_KEY_PREFIX}{user_id}:pages"

        if redis_client:
            try:
                redis_client.setex(cache_key, CACHE_TTL, json.dumps(list(page_ids)))
                logger.debug(f"Redis 写入: {cache_key} ({len(page_ids)} 个页面)")
                return
            except Exception as e:
                logger.warning(f"Redis set 失败: {e}")

        # 降级到内存
        self._user_pages_cache[user_id] = page_ids
        self._user_pages_cache_time[user_id] = datetime.now().timestamp()
        logger.debug(f"内存缓存写入: user:{user_id}:pages ({len(page_ids)} 个页面)")

    def invalidate_user_pages(self, user_id: int | None = None) -> None:
        """使用户页面缓存失效

        Args:
            user_id: 指定用户 ID，为 None 时清除所有用户缓存
        """
        redis_client = get_redis_client()

        if user_id is not None:
            cache_key = f"{USER_PAGES_KEY_PREFIX}{user_id}:pages"
            if redis_client:
                try:
                    redis_client.delete(cache_key)
                    logger.debug(f"Redis 缓存清除: {cache_key}")
                except Exception as e:
                    logger.warning(f"Redis delete 失败: {e}")

            # 清除内存缓存
            self._user_pages_cache.pop(user_id, None)
            self._user_pages_cache_time.pop(user_id, None)
        else:
            # 清除所有用户缓存
            if redis_client:
                try:
                    # 使用 SCAN 查找所有用户缓存键
                    cursor = 0
                    while True:
                        cursor, keys = redis_client.scan(
                            cursor, match=f"{USER_PAGES_KEY_PREFIX}*", count=100
                        )
                        if keys:
                            redis_client.delete(*keys)
                        if cursor == 0:
                            break
                    logger.debug("Redis 缓存清除: 所有用户页面缓存")
                except Exception as e:
                    logger.warning(f"Redis scan/delete 失败: {e}")

            # 清除所有内存缓存
            self._user_pages_cache.clear()
            self._user_pages_cache_time.clear()

    # ========== 辅助方法 ==========

    def invalidate_all(self) -> None:
        """使所有缓存失效（页面变更时调用）"""
        self.invalidate_mapping()
        self.invalidate_user_pages()
        logger.info("页面-API 权限缓存已全部清除")


# 全局缓存实例
page_api_cache = PageAPICache()
