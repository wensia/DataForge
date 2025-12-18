"""Celery 任务定义（已简化）

此模块现在只包含系统级别的维护任务。
业务任务已迁移到 app/tasks/ 目录下使用装饰器定义。

旧的 execute_scheduled_task 通用执行器已被移除，
改为直接使用 task_name 调用已注册的 Celery 任务。
"""

from typing import Any

from celery import Task
from loguru import logger
from sqlmodel import Session

from app.celery_app import celery_app
from app.config import settings
from app.database import engine


# ============================================================================
# 自定义 Task 基类（仅用于系统任务）
# ============================================================================


class SystemTask(Task):
    """系统维护任务基类

    用于不需要分布式锁的简单系统任务。
    业务任务应使用 app.tasks.base.DataForgeTask。
    """

    def on_failure(
        self,
        exc: Exception,
        task_id: str,
        args: tuple,
        kwargs: dict,
        einfo: Any,
    ) -> None:
        """任务最终失败时的回调"""
        logger.error(f"系统任务 {self.name} 失败: {exc.__class__.__name__}: {exc}")


# ============================================================================
# 系统维护任务
# ============================================================================


@celery_app.task(
    base=SystemTask,
    name="dataforge.cleanup_old_executions",
    max_retries=2,
    default_retry_delay=60,
)
def cleanup_old_executions() -> dict[str, Any]:
    """
    清理旧的执行记录（系统任务）

    直接执行清理逻辑，不需要分布式锁。
    """
    from datetime import datetime, timedelta

    from sqlmodel import delete

    from app.models.task_execution import TaskExecution

    cutoff_date = datetime.now() - timedelta(days=settings.max_execution_history_days)

    with Session(engine) as session:
        statement = delete(TaskExecution).where(TaskExecution.created_at < cutoff_date)
        result = session.exec(statement)  # type: ignore
        deleted_count = result.rowcount
        session.commit()

    logger.info(f"清理了 {deleted_count} 条过期执行记录")
    return {"success": True, "deleted_count": deleted_count}
