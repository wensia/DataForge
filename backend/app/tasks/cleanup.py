"""清理任务"""

from datetime import datetime, timedelta

from loguru import logger
from sqlmodel import Session, select

from app.config import settings
from app.database import engine
from app.models.task_execution import TaskExecution
from app.scheduler import task_log
from app.scheduler.registry import register_handler


async def cleanup_old_executions() -> dict:
    """
    清理过期的任务执行历史记录

    Returns:
        dict: 清理结果统计
    """
    task_log("开始执行历史记录清理任务")
    logger.info("开始执行历史记录清理任务")

    cutoff_date = datetime.now() - timedelta(days=settings.max_execution_history_days)
    task_log(f"清理 {cutoff_date.strftime('%Y-%m-%d %H:%M:%S')} 之前的记录")

    with Session(engine) as session:
        # 查询过期记录
        statement = select(TaskExecution).where(TaskExecution.created_at < cutoff_date)
        old_records = session.exec(statement).all()
        count = len(old_records)
        task_log(f"找到 {count} 条过期记录")

        # 删除过期记录
        for record in old_records:
            session.delete(record)

        session.commit()

    task_log(f"清理完成，共删除 {count} 条记录")
    logger.info(f"清理了 {count} 条过期执行记录")
    return {"deleted_count": count, "cutoff_date": cutoff_date.isoformat()}


# 注册处理函数
register_handler("app.tasks.cleanup:cleanup_old_executions", cleanup_old_executions)
