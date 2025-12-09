"""任务管理服务"""

import asyncio
import json
from datetime import datetime
from functools import partial
from typing import Optional

from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.interval import IntervalTrigger
from loguru import logger
from sqlmodel import Session, select

from app.config import settings
from app.database import engine
from app.models.task import (
    ScheduledTask,
    ScheduledTaskCreate,
    ScheduledTaskUpdate,
    TaskStatus,
    TaskType,
)
from app.models.task_execution import (
    ExecutionStatus,
    TaskExecution,
    TaskExecutionDetailResponse,
)
from app.scheduler.core import get_scheduler
from app.scheduler.executor import execute_task
from app.scheduler.registry import get_handler


def get_all_tasks(
    status: Optional[str] = None,
    category: Optional[str] = None,
    page: int = 1,
    size: int = 20,
) -> list[ScheduledTask]:
    """获取所有任务"""
    with Session(engine) as session:
        statement = select(ScheduledTask)
        if status:
            statement = statement.where(ScheduledTask.status == status)
        if category:
            statement = statement.where(ScheduledTask.category == category)
        statement = statement.offset((page - 1) * size).limit(size)
        tasks = session.exec(statement).all()
        return list(tasks)


def get_all_categories() -> list[str]:
    """获取所有已使用的任务分类"""
    with Session(engine) as session:
        statement = (
            select(ScheduledTask.category)
            .where(ScheduledTask.category.isnot(None))
            .distinct()
        )
        categories = session.exec(statement).all()
        return [c for c in categories if c]


def get_task_by_id(task_id: int) -> Optional[ScheduledTask]:
    """根据 ID 获取任务"""
    with Session(engine) as session:
        return session.get(ScheduledTask, task_id)


def get_task_by_name(name: str) -> Optional[ScheduledTask]:
    """根据名称获取任务"""
    with Session(engine) as session:
        statement = select(ScheduledTask).where(ScheduledTask.name == name)
        return session.exec(statement).first()


def create_task(data: ScheduledTaskCreate) -> ScheduledTask:
    """创建任务"""
    with Session(engine) as session:
        task = ScheduledTask.model_validate(data)
        session.add(task)
        session.commit()
        session.refresh(task)

        # 添加到调度器
        _add_task_to_scheduler(task)

        logger.info(f"创建任务: {task.name} (#{task.id})")
        return task


def update_task(task_id: int, data: ScheduledTaskUpdate) -> Optional[ScheduledTask]:
    """更新任务"""
    with Session(engine) as session:
        task = session.get(ScheduledTask, task_id)
        if not task:
            return None

        # 更新字段
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(task, key, value)
        task.updated_at = datetime.now()

        session.add(task)
        session.commit()
        session.refresh(task)

        # 更新调度器中的任务
        _update_task_in_scheduler(task)

        logger.info(f"更新任务: {task.name} (#{task.id})")
        return task


def delete_task(task_id: int) -> bool:
    """删除任务"""
    with Session(engine) as session:
        task = session.get(ScheduledTask, task_id)
        if not task:
            return False

        # 系统任务不允许删除
        if task.is_system:
            logger.warning(f"尝试删除系统任务: {task.name}")
            return False

        # 从调度器移除
        _remove_task_from_scheduler(task_id)

        session.delete(task)
        session.commit()

        logger.info(f"删除任务: {task.name} (#{task_id})")
        return True


def pause_task(task_id: int) -> bool:
    """暂停任务"""
    with Session(engine) as session:
        task = session.get(ScheduledTask, task_id)
        if not task:
            return False

        task.status = TaskStatus.PAUSED
        task.updated_at = datetime.now()
        session.add(task)
        session.commit()

        # 从调度器移除
        _remove_task_from_scheduler(task_id)

        logger.info(f"暂停任务: {task.name} (#{task_id})")
        return True


def resume_task(task_id: int) -> bool:
    """恢复任务"""
    with Session(engine) as session:
        task = session.get(ScheduledTask, task_id)
        if not task:
            return False

        task.status = TaskStatus.ACTIVE
        task.updated_at = datetime.now()
        session.add(task)
        session.commit()
        session.refresh(task)

        # 重新添加到调度器
        _add_task_to_scheduler(task)

        logger.info(f"恢复任务: {task.name} (#{task_id})")
        return True


async def run_task_now(task_id: int) -> dict:
    """立即执行任务（后台异步执行，立即返回）"""
    with Session(engine) as session:
        task = session.get(ScheduledTask, task_id)
        if not task:
            return {"success": False, "message": "任务不存在"}

        try:
            handler = get_handler(task.handler_path)
            kwargs = json.loads(task.handler_kwargs) if task.handler_kwargs else {}

            # 先创建执行记录（状态为 pending）
            execution = TaskExecution(
                task_id=task_id,
                status=ExecutionStatus.PENDING,
                trigger_type="manual",
            )
            session.add(execution)
            session.commit()
            session.refresh(execution)
            execution_id = execution.id

            # 在后台异步执行任务，不等待完成
            asyncio.create_task(
                _run_task_background(task_id, handler, execution_id, kwargs)
            )

            return {
                "success": True,
                "message": "任务已触发",
                "execution_id": execution_id,
            }
        except Exception as e:
            logger.error(f"执行任务失败: {e}")
            return {"success": False, "message": str(e)}


async def _run_task_background(
    task_id: int,
    handler,
    execution_id: int,
    kwargs: dict,
) -> None:
    """后台执行任务的辅助函数"""
    from app.scheduler.executor import execute_task_with_execution

    try:
        await execute_task_with_execution(
            task_id=task_id,
            handler=handler,
            execution_id=execution_id,
            trigger_type="manual",
            **kwargs,
        )
    except Exception as e:
        logger.error(f"后台执行任务 #{task_id} 失败: {e}")


def get_task_executions(
    task_id: int,
    page: int = 1,
    size: int = 20,
) -> list[TaskExecution]:
    """获取任务执行历史"""
    with Session(engine) as session:
        statement = (
            select(TaskExecution)
            .where(TaskExecution.task_id == task_id)
            .order_by(TaskExecution.created_at.desc())
            .offset((page - 1) * size)
            .limit(size)
        )
        executions = session.exec(statement).all()
        return list(executions)


def get_execution_by_id(execution_id: int) -> Optional[TaskExecutionDetailResponse]:
    """获取执行详情"""
    with Session(engine) as session:
        execution = session.get(TaskExecution, execution_id)
        if not execution:
            return None
        return TaskExecutionDetailResponse.model_validate(execution)


def get_all_executions(
    task_id: Optional[int] = None,
    status: Optional[str] = None,
    page: int = 1,
    size: int = 20,
) -> tuple[list[dict], int]:
    """获取所有任务的执行记录（带任务名称）"""
    with Session(engine) as session:
        # 构建查询
        statement = select(TaskExecution, ScheduledTask.name.label("task_name")).join(
            ScheduledTask, TaskExecution.task_id == ScheduledTask.id
        )

        # 筛选条件
        if task_id:
            statement = statement.where(TaskExecution.task_id == task_id)
        if status:
            statement = statement.where(TaskExecution.status == status)

        # 计算总数
        from sqlmodel import func

        count_statement = select(func.count()).select_from(TaskExecution)
        if task_id:
            count_statement = count_statement.where(TaskExecution.task_id == task_id)
        if status:
            count_statement = count_statement.where(TaskExecution.status == status)
        total = session.exec(count_statement).one()

        # 分页和排序
        statement = (
            statement.order_by(TaskExecution.created_at.desc())
            .offset((page - 1) * size)
            .limit(size)
        )

        results = session.exec(statement).all()

        # 转换为字典列表
        executions = []
        for execution, task_name in results:
            exec_dict = {
                "id": execution.id,
                "task_id": execution.task_id,
                "task_name": task_name,
                "status": execution.status.value if hasattr(execution.status, "value") else execution.status,
                "trigger_type": execution.trigger_type,
                "started_at": execution.started_at.isoformat() if execution.started_at else None,
                "finished_at": execution.finished_at.isoformat() if execution.finished_at else None,
                "duration_ms": execution.duration_ms,
                "result": execution.result,
                "error_message": execution.error_message,
                "created_at": execution.created_at.isoformat() if execution.created_at else None,
            }
            executions.append(exec_dict)

        return executions, total


def sync_tasks_to_scheduler() -> None:
    """同步数据库中的任务到调度器"""
    if not settings.scheduler_enabled:
        logger.info("调度器已禁用，跳过任务同步")
        return

    with Session(engine) as session:
        statement = select(ScheduledTask).where(
            ScheduledTask.status == TaskStatus.ACTIVE
        )
        tasks = session.exec(statement).all()

        for task in tasks:
            try:
                _add_task_to_scheduler(task)
            except Exception as e:
                logger.error(f"同步任务 {task.name} 失败: {e}")

        logger.info(f"已同步 {len(tasks)} 个任务到调度器")


def init_default_tasks() -> None:
    """初始化默认系统任务"""
    from app.tasks import DEFAULT_TASKS

    for task_data in DEFAULT_TASKS:
        existing = get_task_by_name(task_data["name"])
        if not existing:
            create_task(ScheduledTaskCreate(**task_data))
            logger.info(f"创建默认任务: {task_data['name']}")


# 内部函数


def _add_task_to_scheduler(task: ScheduledTask) -> None:
    """将任务添加到调度器"""
    if task.status != TaskStatus.ACTIVE:
        return

    scheduler = get_scheduler()
    job_id = f"task_{task.id}"

    # 如果任务已存在，先移除
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)

    # 获取处理函数
    try:
        handler = get_handler(task.handler_path)
    except ValueError as e:
        logger.error(f"无法加载任务处理函数: {e}")
        return

    # 解析参数
    kwargs = json.loads(task.handler_kwargs) if task.handler_kwargs else {}

    # 创建触发器
    trigger = _create_trigger(task)
    if not trigger:
        logger.error(f"无法创建任务触发器: {task.name}")
        return

    # 包装执行函数
    async def job_func():
        await execute_task(task_id=task.id, handler=handler, **kwargs)

    # 添加任务
    job = scheduler.add_job(
        job_func,
        trigger=trigger,
        id=job_id,
        name=task.name,
        replace_existing=True,
    )

    # 更新下次执行时间
    if job.next_run_time:
        with Session(engine) as session:
            db_task = session.get(ScheduledTask, task.id)
            if db_task:
                db_task.next_run_at = job.next_run_time
                session.add(db_task)
                session.commit()

    logger.debug(f"任务 {task.name} 已添加到调度器")


def _update_task_in_scheduler(task: ScheduledTask) -> None:
    """更新调度器中的任务"""
    _remove_task_from_scheduler(task.id)
    if task.status == TaskStatus.ACTIVE:
        _add_task_to_scheduler(task)


def _remove_task_from_scheduler(task_id: int) -> None:
    """从调度器移除任务"""
    scheduler = get_scheduler()
    job_id = f"task_{task_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.debug(f"任务 #{task_id} 已从调度器移除")


def _create_trigger(task: ScheduledTask):
    """根据任务类型创建触发器"""
    if task.task_type == TaskType.CRON and task.cron_expression:
        return CronTrigger.from_crontab(task.cron_expression)
    elif task.task_type == TaskType.INTERVAL and task.interval_seconds:
        return IntervalTrigger(seconds=task.interval_seconds)
    elif task.task_type == TaskType.DATE and task.run_date:
        return DateTrigger(run_date=task.run_date)
    return None
