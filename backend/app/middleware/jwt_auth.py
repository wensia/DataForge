"""JWT 认证中间件"""

from collections.abc import Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from loguru import logger
from starlette.middleware.base import BaseHTTPMiddleware

from app.schemas.response import ResponseModel
from app.utils.auth import api_key_validator
from app.utils.jwt_auth import decode_token


class JWTAuthMiddleware(BaseHTTPMiddleware):
    """JWT 认证中间件

    用于保护需要登录的后台管理路由
    """

    # 需要 JWT 认证的路由前缀
    PROTECTED_PREFIXES = [
        "/api/v1/users",  # 用户管理
        "/api/v1/organization",  # 组织架构
        "/api/v1/robot",  # 机器人配置
        "/api/v1/tasks",  # 定时任务管理
    ]

    # 豁免 JWT 认证的路由(即使匹配 PROTECTED_PREFIXES)
    EXEMPT_PATHS = [
        "/api/v1/auth/login",
        "/api/v1/auth/test",
        "/api/v1/auth/generate-key",
    ]

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path

        # 检查是否豁免
        if path in self.EXEMPT_PATHS:
            return await call_next(request)

        # 检查是否需要 JWT 认证
        needs_jwt = any(path.startswith(prefix) for prefix in self.PROTECTED_PREFIXES)

        if not needs_jwt:
            # 不需要 JWT 认证的路由，但如果携带了 token 也解析
            auth_header = request.headers.get("Authorization")
            if auth_header and auth_header.startswith("Bearer "):
                token = auth_header.split(" ")[1]
                payload = decode_token(token)
                if payload:
                    request.state.user_id = payload.sub
                    request.state.user_email = payload.email
                    request.state.user_role = payload.role
            return await call_next(request)

        # 需要 JWT 认证
        auth_header = request.headers.get("Authorization")

        # 尝试 JWT 认证
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            payload = decode_token(token)

            if payload:
                # JWT 验证成功
                request.state.user_id = payload.sub
                request.state.user_email = payload.email
                request.state.user_role = payload.role
                return await call_next(request)
            else:
                logger.warning(f"JWT认证失败: token无效或已过期 - {path}")

        # JWT 验证失败，尝试 API Key 验证
        api_key = request.query_params.get("api_key")
        if api_key:
            is_valid, error_message, client_metadata = api_key_validator.validate(
                api_key
            )
            if is_valid and client_metadata:
                # API Key 验证成功
                request.state.client_id = client_metadata.get("client_id")
                request.state.client_metadata = client_metadata
                request.state.key_type = client_metadata.get("key_type", "client")
                logger.info(f"API Key认证成功 - {path}")
                return await call_next(request)
            else:
                logger.warning(f"API Key认证失败: {error_message} - {path}")

        # 两者都失败，返回 401
        logger.warning(f"认证失败: 缺少有效的JWT或API Key - {path}")
        return JSONResponse(
            status_code=401,
            content=ResponseModel.error(
                code=401, message="未登录，请先登录或提供有效的API密钥"
            ).model_dump(),
        )
