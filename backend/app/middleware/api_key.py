"""API密钥验证中间件"""

from typing import Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.schemas.response import ResponseModel
from app.utils.auth import api_key_validator


class APIKeyMiddleware(BaseHTTPMiddleware):
    """API密钥验证中间件

    在请求处理前验证API密钥,确保只有授权客户端可以访问API

    验证流程:
    1. 检查路径是否在豁免列表中
    2. 从查询参数提取api_key
    3. 验证密钥有效性
    4. 记录验证日志
    5. 验证失败返回401/403错误
    """

    # 豁免验证的路径列表
    EXEMPT_PATHS = [
        "/",  # 根路径
        "/api/v1/health",  # 健康检查
    ]

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """处理请求

        Args:
            request: 请求对象
            call_next: 下一个处理器

        Returns:
            Response: 响应对象
        """
        # 检查路径是否豁免验证
        request_path = request.url.path
        if request_path in self.EXEMPT_PATHS:
            return await call_next(request)

        # 从查询参数提取API密钥
        api_key = request.query_params.get("api_key")

        # 验证密钥
        is_valid, error_message, client_metadata = api_key_validator.validate(api_key)

        # 准备请求信息用于日志
        request_info = {
            "ip": request.client.host if request.client else "unknown",
            "path": request_path,
            "method": request.method,
            "user_agent": request.headers.get("user-agent", "unknown"),
        }

        if is_valid and client_metadata:
            # 获取密钥类型
            key_type = client_metadata.get("key_type", "client")

            # 权限检查: 客户端密钥不能访问密钥管理接口
            if key_type == "client" and request_path.startswith("/api/v1/api-keys"):
                # 记录权限拒绝日志
                request_info["client_id"] = client_metadata.get("client_id", "unknown")
                api_key_validator.log_validation_attempt(api_key, False, {
                    **request_info,
                    "reason": "客户端密钥无权访问密钥管理接口"
                })

                # 返回 403 Forbidden
                error_response = ResponseModel.error(
                    code=403,
                    message="权限不足: 客户端密钥无法访问密钥管理接口,请使用管理员密钥"
                )
                return JSONResponse(
                    status_code=403,
                    content=error_response.model_dump(),
                    headers={
                        "WWW-Authenticate": "ApiKey",
                        "X-API-Key-Status": "insufficient-permissions",
                    },
                )

            # 验证成功,将客户端信息添加到请求状态中
            request.state.client_id = client_metadata.get("client_id")
            request.state.client_metadata = client_metadata
            request.state.key_type = key_type  # 新增: 存储密钥类型
            request_info["client_id"] = client_metadata.get("client_id", "unknown")

            # 记录成功日志
            api_key_validator.log_validation_attempt(api_key, True, request_info)

            # 继续处理请求
            response = await call_next(request)

            # 在响应头中添加客户端标识和密钥类型(便于调试)
            response.headers["X-Client-ID"] = client_metadata.get("client_id", "unknown")
            response.headers["X-Key-Type"] = key_type  # 新增
            return response
        else:
            # 验证失败,记录日志
            api_key_validator.log_validation_attempt(api_key, False, request_info)

            # 确定错误码
            error_code = 401 if not api_key else 403

            # 返回错误响应(使用统一响应格式)
            error_response = ResponseModel.error(
                code=error_code, message=error_message or "身份验证失败"
            )

            return JSONResponse(
                status_code=error_code,
                content=error_response.model_dump(),
                headers={
                    "WWW-Authenticate": "ApiKey",
                    "X-API-Key-Status": "invalid",
                },
            )
