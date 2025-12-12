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
from app.middleware.jwt_auth import JWTAuthMiddleware
from app.models import (  # noqa: F401 确保模型被导入
    ApiKey,
    ScheduledTask,
    TaskExecution,
    User,
    YunkeAccount,
    YunkeCompany,
)
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
    renewal_started = False
    # 启动时执行
    logger.info("正在初始化数据库...")
    init_db()
    logger.info("数据库初始化完成")

    # 配置安全审计日志
    setup_security_logging()

    # 初始化调度器
    if settings.scheduler_enabled:
        from app.scheduler import (
            discover_handlers,
            init_scheduler,
            shutdown_scheduler,
            start_scheduler,
        )
        from app.scheduler.leader_lock import (
            acquire_leader_lock,
            release_leader_lock,
            start_renewal_task,
            stop_renewal_task,
        )
        from app.services.task_service import init_default_tasks, sync_tasks_to_scheduler

        if acquire_leader_lock():
            logger.info("正在初始化任务调度器...")
            init_scheduler()
            discover_handlers()
            start_scheduler()
            start_renewal_task()
            renewal_started = True
            init_default_tasks()
            sync_tasks_to_scheduler()
            logger.info("任务调度器启动完成")
        else:
            logger.info("当前实例非 leader，跳过调度器启动")

    yield

    # 关闭时执行
    if settings.scheduler_enabled:
        from app.scheduler import shutdown_scheduler
        from app.scheduler.leader_lock import (
            release_leader_lock,
            stop_renewal_task,
        )

        logger.info("正在关闭任务调度器...")
        shutdown_scheduler()
        if renewal_started:
            await stop_renewal_task()
            release_leader_lock()

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

# 添加中间件 (注意顺序: 后添加的先执行)
# JWT 中间件在 API 密钥中间件之前执行
app.add_middleware(APIKeyMiddleware)
app.add_middleware(JWTAuthMiddleware)


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
