"""页面-API 权限控制中间件

根据页面配置的 api_paths 字段，检查用户是否有权访问特定 API。
用户没有页面访问权限时，也不能调用该页面关联的 API。
"""

from collections.abc import Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from loguru import logger
from starlette.middleware.base import BaseHTTPMiddleware

from app.schemas.response import ResponseModel
from app.utils.page_api_cache import page_api_cache


class PageAPIPermissionMiddleware(BaseHTTPMiddleware):
    """页面-API 权限控制中间件

    根据页面的 api_paths 配置，控制 API 访问权限。
    """

    # 豁免路径（无需检查页面权限）
    EXEMPT_PATHS = [
        "/",
        "/docs",
        "/redoc",
        "/openapi.json",
        "/api/v1/health",
        "/api/v1/auth/login",
        "/api/v1/auth/me",
        "/api/v1/auth/test",
        "/api/v1/pages",  # 导航配置需要放行
    ]

    # 豁免路径前缀
    EXEMPT_PREFIXES = [
        "/uploads/",  # 静态文件
    ]

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path

        # 1. 豁免路径直接放行
        if self._is_exempt(path):
            return await call_next(request)

        # 2. 管理员直接放行
        user_role = getattr(request.state, "user_role", None)
        if user_role == "ADMIN":
            return await call_next(request)

        # 3. 获取 API→页面 映射
        try:
            api_page_mapping = await page_api_cache.get_api_page_mapping()
        except Exception as e:
            logger.error(f"获取 API-页面映射失败: {e}")
            # 缓存获取失败时放行，避免阻塞正常请求
            return await call_next(request)

        # 4. 查找此 API 关联的页面
        page_id = self._find_page_for_api(path, api_page_mapping)

        if page_id is None:
            # 未关联任何页面的 API，根据策略放行
            return await call_next(request)

        # 5. 检查用户是否有该页面权限
        user_id = getattr(request.state, "user_id", None)

        if user_id is None:
            # 未登录用户，检查是否需要登录
            logger.warning(f"未登录用户尝试访问受限 API: {path}")
            return JSONResponse(
                status_code=401,
                content=ResponseModel.error(
                    code=401, message="请先登录"
                ).model_dump(),
            )

        try:
            accessible_pages = await page_api_cache.get_user_accessible_pages(user_id)
        except Exception as e:
            logger.error(f"获取用户可访问页面失败: {e}")
            # 缓存获取失败时放行
            return await call_next(request)

        if page_id not in accessible_pages:
            logger.warning(
                f"用户 {user_id} 无权访问 API: {path} (需要页面 {page_id} 权限)"
            )
            return JSONResponse(
                status_code=403,
                content=ResponseModel.error(
                    code=403, message="无权访问此功能"
                ).model_dump(),
            )

        return await call_next(request)

    def _is_exempt(self, path: str) -> bool:
        """检查路径是否豁免权限检查"""
        if path in self.EXEMPT_PATHS:
            return True

        for prefix in self.EXEMPT_PREFIXES:
            if path.startswith(prefix):
                return True

        return False

    def _find_page_for_api(
        self, path: str, api_page_mapping: dict[str, int]
    ) -> int | None:
        """查找 API 路径对应的页面 ID

        支持:
        - 精确匹配: /api/v1/users
        - 前缀匹配: /api/v1/users/* 匹配 /api/v1/users/1, /api/v1/users/1/roles 等

        Args:
            path: 请求的 API 路径
            api_page_mapping: API路径→页面ID 的映射

        Returns:
            页面 ID，未找到返回 None
        """
        # 先尝试精确匹配
        if path in api_page_mapping:
            return api_page_mapping[path]

        # 尝试前缀匹配（以 /* 结尾的规则）
        for api_pattern, page_id in api_page_mapping.items():
            if api_pattern.endswith("/*"):
                prefix = api_pattern[:-1]  # 去掉末尾的 *，保留 /
                if path.startswith(prefix):
                    return page_id

        return None
