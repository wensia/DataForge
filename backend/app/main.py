"""FastAPI 应用入口"""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger

from app.api.v1 import router as api_v1_router
from app.config import settings
from app.database import init_db
from app.middleware import APIKeyMiddleware
from app.models import ApiKey, YunkeAccount, YunkeCompany  # noqa: F401 确保模型被导入
from app.schemas.response import ResponseModel


def setup_security_logging():
    """配置安全审计日志"""
    if not settings.enable_security_audit:
        return

    # 创建日志目录
    log_dir = Path(settings.security_log_file).parent
    log_dir.mkdir(parents=True, exist_ok=True)

    # 添加安全日志文件(独立于普通日志)
    logger.add(
        settings.security_log_file,
        rotation="10 MB",  # 日志轮转
        retention="30 days",  # 保留30天
        compression="zip",  # 压缩旧日志
        format="{time:YYYY-MM-DD HH:mm:ss} | {level} | {message}",
        filter=lambda record: "API密钥验证" in record["message"],  # 只记录安全相关日志
        level="INFO",
    )
    logger.info("安全审计日志配置完成")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时执行
    logger.info("正在初始化数据库...")
    init_db()
    logger.info("数据库初始化完成")

    # 配置安全审计日志
    setup_security_logging()

    # 显示API密钥验证状态
    key_count = len(settings.get_api_keys_list())
    if key_count > 0:
        logger.info(f"API密钥验证已启用,共加载 {key_count} 个密钥")
    else:
        logger.warning("未配置API密钥,所有需要验证的接口将无法访问!")
        logger.warning("请在.env文件中配置 API_KEYS=key1,key2,key3")

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

# 添加API密钥验证中间件
app.add_middleware(APIKeyMiddleware)


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

