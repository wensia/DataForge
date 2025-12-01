"""FastAPI 应用入口"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger

from app.api.v1 import router as api_v1_router
from app.config import settings
from app.database import init_db
from app.models import YunkeAccount, YunkeCompany  # noqa: F401 确保模型被导入
from app.schemas.response import ResponseModel


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时执行
    logger.info("正在初始化数据库...")
    init_db()
    logger.info("数据库初始化完成")
    yield
    # 关闭时执行
    logger.info("应用正在关闭...")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="云客中转后端 API",
    lifespan=lifespan,
)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 全局异常处理
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """全局异常处理器"""
    logger.error(f"全局异常: {exc}")
    return JSONResponse(
        status_code=500,
        content=ResponseModel.error(code=500, message=str(exc)).model_dump(),
    )


# 注册 API 路由
app.include_router(api_v1_router, prefix=settings.api_prefix)


@app.get("/")
async def root():
    """根路径"""
    return ResponseModel.success(
        data={"name": settings.app_name, "version": settings.app_version},
        message="欢迎使用云客中转 API",
    )

