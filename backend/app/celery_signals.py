"""Celery 任务信号处理

统一的信号处理入口，管理任务执行记录。
所有 dataforge.* 命名空间的任务都会经过这里。

参考文档:
- https://docs.celeryq.dev/en/stable/userguide/signals.html
"""

from datetime import datetime, timedelta
from typing import Any

from celery.signals import task_failure, task_postrun, task_prerun, task_success
from loguru import logger
from sqlmodel import Session

from app.database import engine
from app.models.task import ScheduledTask, TaskType
from app.models.task_execution import ExecutionStatus, TaskExecution
from app.scheduler.task_logger import clear_log_context, init_log_context


# ============================================================================
# 辅助函数
# ============================================================================


def _is_dataforge_task(task_name: str) -> bool:
    """检查是否是 dataforge 任务"""
    return task_name.startswith("dataforge.")


def _get_scheduled_task_id(kwargs: dict[str, Any] | None) -> int | None:
    """从任务参数中获取 scheduled_task_id"""
    if kwargs is None:
        return None
    return kwargs.get("scheduled_task_id")


# ============================================================================
# 任务信号处理器
# ============================================================================


@task_prerun.connect
def on_task_prerun(
    task_id: str | None = None,
    task: Any = None,
    args: tuple = (),
    kwargs: dict | None = None,
    **extra: Any,
) -> None:
    """任务开始前创建执行记录

    只处理 dataforge.* 命名空间的任务。
    """
    if task is None or kwargs is None:
        return

    if not _is_dataforge_task(task.name):
        return

    scheduled_task_id = _get_scheduled_task_id(kwargs)
    if not scheduled_task_id:
        logger.debug(f"任务 {task.name} 没有 scheduled_task_id，跳过执行记录")
        return

    try:
        with Session(engine) as session:
            # 创建执行记录
            execution = TaskExecution(
                task_id=scheduled_task_id,
                status=ExecutionStatus.RUNNING,
                trigger_type="scheduled",
                started_at=datetime.now(),
            )
            session.add(execution)
            session.commit()
            session.refresh(execution)

            # 将 execution_id 存储到任务请求中
            task.request.execution_id = execution.id

            # 初始化日志上下文（使 task_log 能正确写入 Redis）
            init_log_context(execution.id)

            logger.debug(
                f"任务 {task.name} 开始执行, "
                f"scheduled_task_id={scheduled_task_id}, execution_id={execution.id}"
            )
    except Exception as e:
        logger.warning(f"创建执行记录失败: {e}")


@task_success.connect
def on_task_success(
    sender: Any = None,
    result: Any = None,
    **extra: Any,
) -> None:
    """任务成功时更新执行记录"""
    if sender is None:
        return

    if not _is_dataforge_task(sender.name):
        return

    execution_id = getattr(sender.request, "execution_id", None)
    if not execution_id:
        return

    try:
        with Session(engine) as session:
            execution = session.get(TaskExecution, execution_id)
            if execution:
                now = datetime.now()
                execution.status = ExecutionStatus.SUCCESS
                execution.finished_at = now
                if execution.started_at:
                    execution.duration_ms = int(
                        (now - execution.started_at).total_seconds() * 1000
                    )

                # 存储结果摘要
                if result:
                    import json

                    try:
                        result_str = json.dumps(result, ensure_ascii=False, default=str)
                        if len(result_str) > 10000:
                            result_str = result_str[:10000] + "... (truncated)"
                        execution.result = result_str
                    except Exception:
                        pass

                session.add(execution)
                session.commit()

                # 更新 ScheduledTask 统计
                scheduled_task = session.get(ScheduledTask, execution.task_id)
                if scheduled_task:
                    scheduled_task.run_count += 1
                    scheduled_task.success_count += 1
                    scheduled_task.last_run_at = now
                    session.add(scheduled_task)
                    session.commit()

            logger.debug(f"任务 {sender.name} 执行成功, execution_id={execution_id}")

            # 清理日志上下文并刷新日志到数据库
            clear_log_context("completed")
    except Exception as e:
        logger.warning(f"更新执行记录失败: {e}")


@task_failure.connect
def on_task_failure(
    task_id: str | None = None,
    exception: Exception | None = None,
    traceback: Any = None,
    sender: Any = None,
    **extra: Any,
) -> None:
    """任务失败时更新执行记录"""
    if sender is None:
        return

    if not _is_dataforge_task(sender.name):
        return

    execution_id = getattr(sender.request, "execution_id", None)
    if not execution_id:
        return

    try:
        with Session(engine) as session:
            execution = session.get(TaskExecution, execution_id)
            if execution:
                now = datetime.now()
                execution.status = ExecutionStatus.FAILED
                execution.finished_at = now
                if execution.started_at:
                    execution.duration_ms = int(
                        (now - execution.started_at).total_seconds() * 1000
                    )
                execution.error_message = str(exception) if exception else "Unknown error"

                # 存储完整堆栈
                if traceback:
                    try:
                        execution.error_traceback = str(traceback)
                    except Exception:
                        pass

                session.add(execution)
                session.commit()

                # 更新 ScheduledTask 统计
                scheduled_task = session.get(ScheduledTask, execution.task_id)
                if scheduled_task:
                    scheduled_task.run_count += 1
                    scheduled_task.fail_count += 1
                    scheduled_task.last_run_at = now
                    session.add(scheduled_task)
                    session.commit()

            logger.debug(f"任务 {sender.name} 执行失败, execution_id={execution_id}")

            # 清理日志上下文并刷新日志到数据库
            clear_log_context("failed")
    except Exception as e:
        logger.warning(f"更新执行记录失败: {e}")


@task_postrun.connect
def on_task_postrun(
    sender: Any = None,
    task_id: str | None = None,
    task: Any = None,
    args: tuple = (),
    kwargs: dict | None = None,
    retval: Any = None,
    state: str | None = None,
    **extra: Any,
) -> None:
    """任务执行后更新下次执行时间

    此信号在任务完成后触发（无论成功失败），
    用于更新 INTERVAL 类型任务的 next_run_at。
    """
    if task is None or kwargs is None:
        return

    if not _is_dataforge_task(task.name):
        return

    scheduled_task_id = _get_scheduled_task_id(kwargs)
    if not scheduled_task_id:
        return

    try:
        with Session(engine) as session:
            scheduled_task = session.get(ScheduledTask, scheduled_task_id)
            if scheduled_task:
                now = datetime.now()

                # 计算下次执行时间（仅 INTERVAL 类型）
                if (
                    scheduled_task.task_type == TaskType.INTERVAL
                    and scheduled_task.interval_seconds
                ):
                    scheduled_task.next_run_at = now + timedelta(
                        seconds=scheduled_task.interval_seconds
                    )
                    logger.debug(
                        f"任务 #{scheduled_task_id} 下次执行时间: {scheduled_task.next_run_at}"
                    )

                session.add(scheduled_task)
                session.commit()
    except Exception as e:
        logger.warning(f"更新任务 #{scheduled_task_id} 执行时间失败: {e}")
