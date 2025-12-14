"""Celery 任务定义

核心设计：使用一个通用任务包装器，通过 handler_path 动态路由到具体脚本。
保持与现有 scripts/*.py 的完全兼容。
"""

import asyncio
from typing import Any

from celery import Task
from loguru import logger
from sqlmodel import Session

from app.celery_app import celery_app
from app.database import engine
from app.models.task_execution import ExecutionStatus, TaskExecution


class DataForgeTask(Task):
    """自定义 Task 基类，确保处理函数已注册"""

    _handlers_discovered = False

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        # 确保处理函数已注册（Worker 启动时只执行一次）
        if not DataForgeTask._handlers_discovered:
            from app.scheduler.registry import discover_handlers

            discover_handlers()
            DataForgeTask._handlers_discovered = True
            logger.info("Celery Worker 已加载任务处理函数")
        return super().__call__(*args, **kwargs)


@celery_app.task(
    base=DataForgeTask,
    bind=True,
    name="dataforge.execute_task",
    max_retries=0,  # 不自动重试，由业务层控制
    acks_late=True,  # 任务完成后才确认
)
def execute_scheduled_task(
    self: Task,
    task_id: int,
    handler_path: str,
    handler_kwargs: dict[str, Any] | None = None,
    trigger_type: str = "scheduled",
    execution_id: int | None = None,
) -> dict[str, Any]:
    """
    通用任务执行器

    Args:
        task_id: ScheduledTask.id
        handler_path: 处理函数路径，如 "scripts:sync_accounts"
        handler_kwargs: 传递给处理函数的参数
        trigger_type: 触发类型 (scheduled/manual)
        execution_id: 可选的预创建执行记录 ID（手动触发时使用）

    Returns:
        执行结果字典
    """
    from app.scheduler.executor import execute_task_with_execution
    from app.scheduler.registry import get_handler

    kwargs = handler_kwargs or {}

    # 获取处理函数
    try:
        handler = get_handler(handler_path)
    except ValueError as e:
        logger.error(f"无法加载处理函数 {handler_path}: {e}")
        return {"success": False, "error": str(e)}

    # 如果没有预创建的 execution_id，创建一个
    if execution_id is None:
        with Session(engine) as session:
            execution = TaskExecution(
                task_id=task_id,
                status=ExecutionStatus.PENDING,
                trigger_type=trigger_type,
            )
            session.add(execution)
            session.commit()
            session.refresh(execution)
            execution_id = execution.id

    # 在 Celery Worker 中执行异步任务
    # 创建新的事件循环来运行异步代码
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    try:
        result = loop.run_until_complete(
            execute_task_with_execution(
                task_id=task_id,
                handler=handler,
                execution_id=execution_id,
                trigger_type=trigger_type,
                **kwargs,
            )
        )
        return {
            "success": True,
            "execution_id": execution_id,
            "status": result.status.value if result else "unknown",
        }
    except Exception as e:
        logger.error(f"任务 #{task_id} 执行失败: {e}")
        return {"success": False, "error": str(e), "execution_id": execution_id}
    finally:
        loop.close()


@celery_app.task(name="dataforge.cleanup_old_executions")
def cleanup_old_executions() -> dict[str, Any]:
    """
    清理旧的执行记录（系统任务）

    直接执行清理逻辑，不需要通过 handler_path 路由。
    """
    from datetime import datetime, timedelta

    from sqlmodel import delete

    from app.config import settings
    from app.models.task_execution import TaskExecution

    cutoff_date = datetime.now() - timedelta(days=settings.max_execution_history_days)

    with Session(engine) as session:
        statement = delete(TaskExecution).where(TaskExecution.created_at < cutoff_date)
        result = session.exec(statement)  # type: ignore
        deleted_count = result.rowcount
        session.commit()

    logger.info(f"清理了 {deleted_count} 条过期执行记录")
    return {"success": True, "deleted_count": deleted_count}
