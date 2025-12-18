"""Celery 应用配置

配置 Celery 实例，使用 Redis 作为 broker 和 result backend。
使用自定义 DatabaseScheduler 从数据库动态加载定时任务。

官方最佳实践参考:
- https://docs.celeryq.dev/en/stable/userguide/configuration.html
- https://docs.celeryq.dev/en/stable/userguide/tasks.html#retrying
"""

from celery import Celery
from celery.signals import worker_init, worker_shutdown
from loguru import logger

from app.config import settings

# 导入信号处理器模块（触发信号注册）
import app.celery_signals  # noqa: F401

# 创建 Celery 应用
celery_app = Celery(
    "dataforge",
    broker=settings.celery_broker,
    backend=settings.celery_backend,
    # 包含任务模块
    # app.tasks 包含新的装饰器任务
    # app.celery_tasks 保留用于向后兼容
    include=["app.tasks", "app.celery_tasks"],
)

# ============================================================================
# Celery 配置
# ============================================================================
celery_app.conf.update(
    # ---------- 序列化配置 ----------
    task_serializer=settings.celery_task_serializer,
    result_serializer=settings.celery_result_serializer,
    accept_content=["json"],
    # ---------- 时区配置 ----------
    timezone=settings.celery_timezone,
    enable_utc=False,
    # ---------- 任务追踪 ----------
    task_track_started=settings.celery_task_track_started,
    # ---------- 任务结果配置 ----------
    result_expires=settings.celery_result_expires,
    # ---------- Worker 配置 ----------
    worker_prefetch_multiplier=settings.celery_worker_prefetch_multiplier,
    worker_concurrency=settings.celery_worker_concurrency,
    # ---------- 任务确认模式（重要！）----------
    # 任务完成后才确认，防止 worker 崩溃导致任务丢失
    task_acks_late=True,
    # 任务被拒绝时重新入队（配合 acks_late）
    task_reject_on_worker_lost=True,
    # ---------- Redis Broker 配置（关键！）----------
    # visibility_timeout: 任务被取出后未确认的最长时间
    # 必须大于最长任务的执行时间，否则任务会被重复投递
    broker_transport_options={
        "visibility_timeout": settings.celery_broker_visibility_timeout,
    },
    # ---------- Redis Backend 配置 ----------
    # 同样需要设置 visibility_timeout
    result_backend_transport_options={
        "visibility_timeout": settings.celery_broker_visibility_timeout,
    },
    # ---------- 软关闭机制（Celery 5.5+）----------
    # Worker 收到 SIGTERM 后的优雅关闭超时
    worker_soft_shutdown_timeout=settings.celery_worker_soft_shutdown_timeout,
    # ---------- Beat 配置 ----------
    beat_scheduler="app.celery_scheduler:DatabaseScheduler",
    # 数据库调度器需要更频繁检查任务（默认 300 秒太长）
    # 官方文档: django-celery-beat 推荐 5 秒
    beat_max_loop_interval=5,
)


# ============================================================================
# Worker 信号处理
# ============================================================================


@worker_init.connect
def on_worker_init(sender=None, **kwargs):
    """Worker 启动时初始化资源

    - 预热数据库连接池
    - 初始化 Redis 连接
    - 加载任务处理函数
    """
    logger.info("Celery Worker 正在初始化...")

    # 1. 初始化数据库连接（预热连接池）
    try:
        from sqlalchemy import text

        from app.database import engine

        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("数据库连接池已预热")
    except Exception as e:
        logger.error(f"数据库连接初始化失败: {e}")

    # 2. 初始化 Redis 连接
    try:
        from app.utils.redis_client import get_redis_client

        client = get_redis_client()
        if client:
            client.ping()
            logger.info("Redis 连接已建立")
    except Exception as e:
        logger.warning(f"Redis 连接初始化失败: {e}")

    # 3. 发现并注册任务处理函数
    try:
        from app.scheduler.registry import discover_handlers

        discover_handlers()
        logger.info("任务处理函数已加载")
    except Exception as e:
        logger.error(f"任务处理函数加载失败: {e}")

    # 4. 清理孤立任务（Worker 重启后可能存在）
    try:
        from app.services.task_service import cleanup_stuck_tasks

        # 启动时使用较短的阈值（10分钟），快速清理可能因容器重启而中断的任务
        cleaned = cleanup_stuck_tasks(max_running_minutes=10)
        if cleaned > 0:
            logger.warning(f"启动清理: 发现并处理了 {cleaned} 个孤立任务")
        else:
            logger.debug("启动清理: 没有发现孤立任务")
    except Exception as e:
        logger.error(f"启动清理失败: {e}")

    logger.info("Celery Worker 初始化完成")


@worker_shutdown.connect
def on_worker_shutdown(sender=None, **kwargs):
    """Worker 关闭时清理资源

    - 关闭数据库连接
    - 清理临时文件
    """
    logger.info("Celery Worker 正在关闭...")

    # 1. 关闭数据库连接池
    try:
        from app.database import engine

        engine.dispose()
        logger.info("数据库连接池已关闭")
    except Exception as e:
        logger.warning(f"关闭数据库连接失败: {e}")

    # 2. Redis 连接会自动关闭（由 redis-py 管理）

    logger.info("Celery Worker 已关闭")
