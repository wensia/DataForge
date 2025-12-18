"""Celery 应用配置

配置 Celery 实例，使用 Redis 作为 broker 和 result backend。
使用自定义 DatabaseScheduler 从数据库动态加载定时任务。

架构说明：
1. 任务定义在 app/tasks/ 目录下，使用 @celery_app.task 装饰器
2. DatabaseScheduler 根据 ScheduledTask 表的 task_name 字段调度任务
3. 信号处理器在 celery_signals.py 中统一管理

参考文档:
- https://docs.celeryq.dev/en/stable/userguide/configuration.html
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
    # 任务模块：
    # - app.tasks: 业务任务（使用 DataForgeTask 基类）
    # - app.celery_tasks: 系统维护任务
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
    enable_utc=False,  # 使用本地时间
    # ---------- 任务追踪 ----------
    task_track_started=settings.celery_task_track_started,
    # ---------- 任务结果配置 ----------
    result_expires=settings.celery_result_expires,
    # ---------- Worker 配置 ----------
    worker_prefetch_multiplier=settings.celery_worker_prefetch_multiplier,
    worker_concurrency=settings.celery_worker_concurrency,
    # ---------- 任务确认模式 ----------
    task_acks_late=True,  # 任务完成后才确认
    task_reject_on_worker_lost=True,  # Worker 丢失时重新入队
    # ---------- Redis Broker 配置 ----------
    broker_transport_options={
        "visibility_timeout": settings.celery_broker_visibility_timeout,
    },
    result_backend_transport_options={
        "visibility_timeout": settings.celery_broker_visibility_timeout,
    },
    # ---------- Worker 软关闭 ----------
    worker_soft_shutdown_timeout=settings.celery_worker_soft_shutdown_timeout,
    # ---------- Beat 配置 ----------
    beat_scheduler="app.celery_scheduler:DatabaseScheduler",
    beat_max_loop_interval=5,  # 每 5 秒检查一次调度
)


# ============================================================================
# Worker 信号处理
# ============================================================================


@worker_init.connect
def on_worker_init(sender=None, **kwargs):
    """Worker 启动时初始化资源

    - 预热数据库连接池
    - 初始化 Redis 连接
    - 清理孤立任务
    """
    logger.info("Celery Worker 正在初始化...")

    # 1. 初始化数据库连接
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

    # 3. 清理孤立任务
    try:
        from app.services.task_service import cleanup_stuck_tasks

        cleaned = cleanup_stuck_tasks(max_running_minutes=10)
        if cleaned > 0:
            logger.warning(f"启动清理: 发现并处理了 {cleaned} 个孤立任务")
    except Exception as e:
        logger.error(f"启动清理失败: {e}")

    logger.info("Celery Worker 初始化完成")


@worker_shutdown.connect
def on_worker_shutdown(sender=None, **kwargs):
    """Worker 关闭时清理资源"""
    logger.info("Celery Worker 正在关闭...")

    try:
        from app.database import engine

        engine.dispose()
        logger.info("数据库连接池已关闭")
    except Exception as e:
        logger.warning(f"关闭数据库连接失败: {e}")

    logger.info("Celery Worker 已关闭")
