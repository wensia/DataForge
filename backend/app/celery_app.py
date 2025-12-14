"""Celery 应用配置

配置 Celery 实例，使用 Redis 作为 broker 和 result backend。
使用自定义 DatabaseScheduler 从数据库动态加载定时任务。
"""

from celery import Celery

from app.config import settings

# 创建 Celery 应用
celery_app = Celery(
    "dataforge",
    broker=settings.celery_broker,
    backend=settings.celery_backend,
    include=["app.celery_tasks"],
)

# 配置
celery_app.conf.update(
    # 序列化配置
    task_serializer=settings.celery_task_serializer,
    result_serializer=settings.celery_result_serializer,
    accept_content=["json"],
    # 时区
    timezone=settings.celery_timezone,
    enable_utc=False,
    # 任务追踪
    task_track_started=settings.celery_task_track_started,
    # 任务结果过期时间（1小时）
    result_expires=3600,
    # Worker 配置
    worker_prefetch_multiplier=1,  # 每次只取一个任务，避免长任务阻塞
    task_acks_late=True,  # 任务完成后才确认，防止任务丢失
    # Beat 配置 - 使用自定义 DatabaseScheduler
    beat_scheduler="app.celery_scheduler:DatabaseScheduler",
    # 软关闭机制（Celery 5.5+）- Worker 收到 SIGTERM 后优雅关闭
    worker_soft_shutdown_timeout=settings.celery_worker_soft_shutdown_timeout,
)
