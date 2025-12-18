"""清理任务

包含执行历史清理、临时文件清理等维护任务。
"""

from datetime import datetime, timedelta

from loguru import logger
from sqlmodel import Session, select

from app.celery_app import celery_app
from app.config import settings
from app.database import engine
from app.models.task_execution import TaskExecution
from app.scheduler import task_log
from app.tasks.base import DataForgeTask


@celery_app.task(
    base=DataForgeTask,
    name="dataforge.cleanup_executions",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
)
def cleanup_executions(self, days: int | None = None, **kwargs) -> dict:
    """清理过期的任务执行历史记录

    Args:
        days: 保留天数，默认使用配置值

    Returns:
        dict: 清理结果统计
    """
    retention_days = days or settings.max_execution_history_days
    task_log("开始执行历史记录清理任务")
    task_log(f"保留天数: {retention_days}")
    logger.info(f"开始清理 {retention_days} 天前的执行历史")

    cutoff_date = datetime.now() - timedelta(days=retention_days)
    task_log(f"清理 {cutoff_date.strftime('%Y-%m-%d %H:%M:%S')} 之前的记录")

    with Session(engine) as session:
        # 查询过期记录
        statement = select(TaskExecution).where(TaskExecution.created_at < cutoff_date)
        old_records = session.exec(statement).all()
        count = len(old_records)

        task_log(f"找到 {count} 条过期记录")

        if count == 0:
            task_log("没有需要清理的记录")
            return {
                "deleted_count": 0,
                "cutoff_date": cutoff_date.isoformat(),
                "retention_days": retention_days,
            }

        # 分批删除避免长事务
        batch_size = 1000
        deleted = 0

        for record in old_records:
            session.delete(record)
            deleted += 1

            # 每批次提交
            if deleted % batch_size == 0:
                session.commit()
                task_log(f"已删除 {deleted}/{count} 条记录")
                self.extend_lock()

        session.commit()

    task_log(f"清理完成，共删除 {count} 条记录")
    logger.info(f"清理了 {count} 条过期执行记录")

    return {
        "deleted_count": count,
        "cutoff_date": cutoff_date.isoformat(),
        "retention_days": retention_days,
    }


@celery_app.task(
    base=DataForgeTask,
    name="dataforge.cleanup_stuck_tasks",
    bind=True,
    max_retries=1,
)
def cleanup_stuck_tasks(self, max_running_minutes: int = 60, **kwargs) -> dict:
    """清理卡住的任务

    将长时间处于 RUNNING 状态的任务标记为 FAILED。

    Args:
        max_running_minutes: 最大运行时间（分钟），超过此时间视为卡住

    Returns:
        dict: 清理结果
    """
    from app.models.task_execution import ExecutionStatus

    task_log("开始清理卡住的任务")
    task_log(f"最大运行时间: {max_running_minutes} 分钟")

    cutoff_time = datetime.now() - timedelta(minutes=max_running_minutes)

    with Session(engine) as session:
        # 查找卡住的任务
        statement = select(TaskExecution).where(
            TaskExecution.status == ExecutionStatus.RUNNING,
            TaskExecution.started_at < cutoff_time,
        )
        stuck_tasks = session.exec(statement).all()

        if not stuck_tasks:
            task_log("没有发现卡住的任务")
            return {"cleaned": 0}

        task_log(f"发现 {len(stuck_tasks)} 个卡住的任务")

        for execution in stuck_tasks:
            execution.status = ExecutionStatus.FAILED
            execution.finished_at = datetime.now()
            execution.error_message = f"[TIMEOUT] 任务执行超过 {max_running_minutes} 分钟"
            if execution.started_at:
                execution.duration_ms = int(
                    (datetime.now() - execution.started_at).total_seconds() * 1000
                )
            session.add(execution)
            task_log(f"  标记执行 #{execution.id} 为失败")

        session.commit()

    task_log(f"清理完成，处理了 {len(stuck_tasks)} 个卡住的任务")
    return {"cleaned": len(stuck_tasks)}
