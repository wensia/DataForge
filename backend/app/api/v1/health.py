"""健康检查接口"""

from fastapi import APIRouter

from app.schemas.response import ResponseModel

router = APIRouter()


@router.get("/health", response_model=ResponseModel[dict])
async def health_check():
    """健康检查接口

    Returns:
        ResponseModel: 健康状态
    """
    return ResponseModel.success(
        data={"status": "healthy"},
        message="服务运行正常",
    )






