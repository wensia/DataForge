"""清理任务

清理过期的任务执行历史记录。
"""

from datetime import datetime, timedelta

from loguru import logger
from sqlmodel import Session, select

from app.config import settings
from app.database import engine
from app.models.task_execution import TaskExecution

# 任务元信息
TASK_INFO = {
    "name": "清理执行历史",
    "description": "清理过期的任务执行历史记录",
}


async def run(**kwargs) -> dict:
    """
    清理过期的任务执行历史记录

    Returns:
        dict: 清理结果统计
    """
    logger.info("开始执行历史记录清理任务")

    cutoff_date = datetime.now() - timedelta(days=settings.max_execution_history_days)

    with Session(engine) as session:
        # 查询过期记录
        statement = select(TaskExecution).where(TaskExecution.created_at < cutoff_date)
        old_records = session.exec(statement).all()
        count = len(old_records)

        # 删除过期记录
        for record in old_records:
            session.delete(record)

        session.commit()

    logger.info(f"清理了 {count} 条过期执行记录")
    return {"deleted_count": count, "cutoff_date": cutoff_date.isoformat()}
