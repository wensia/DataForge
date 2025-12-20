"""中间件模块"""

from app.middleware.api_key import APIKeyMiddleware
from app.middleware.page_api_permission import PageAPIPermissionMiddleware

__all__ = ["APIKeyMiddleware", "PageAPIPermissionMiddleware"]
