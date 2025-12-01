"""API密钥测试和管理接口"""

from fastapi import APIRouter, Request

from app.schemas.response import ResponseModel
from app.utils.auth import generate_api_key

router = APIRouter(prefix="/auth", tags=["认证管理"])


@router.get("/test", response_model=ResponseModel[dict])
async def test_api_key(request: Request):
    """测试API密钥

    验证当前请求的API密钥是否有效,并返回客户端信息

    Returns:
        ResponseModel: 包含客户端信息的响应
    """
    # 从请求状态获取客户端信息(由中间件设置)
    client_id = getattr(request.state, "client_id", "unknown")
    client_metadata = getattr(request.state, "client_metadata", {})

    return ResponseModel.success(
        data={
            "client_id": client_id,
            "description": client_metadata.get("description", ""),
            "created_at": client_metadata.get("created_at", ""),
            "message": "API密钥有效",
        },
        message="验证成功",
    )


@router.post("/generate-key", response_model=ResponseModel[dict])
async def generate_new_api_key():
    """生成新的API密钥(仅供开发使用)

    注意: 生产环境应禁用此接口或添加管理员权限验证

    Returns:
        ResponseModel: 包含新生成密钥的响应
    """
    new_key = generate_api_key()

    return ResponseModel.success(
        data={
            "api_key": new_key,
            "length": len(new_key),
            "usage": f"在查询参数中添加: ?api_key={new_key}",
            "example": "curl 'http://localhost:8847/api/v1/accounts?api_key="
            + new_key
            + "'",
        },
        message="密钥生成成功",
    )
