"""任务管理服务"""

import asyncio
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from functools import partial

from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.interval import IntervalTrigger
from loguru import logger
from sqlmodel import Session, select

from app.config import settings
from app.database import engine

# 数据库操作线程池（避免同步操作阻塞事件循环）
_db_executor = ThreadPoolExecutor(max_workers=5, thread_name_prefix="db_task_")
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
    status: str | None = None,
    category: str | None = None,
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


def get_task_by_id(task_id: int) -> ScheduledTask | None:
    """根据 ID 获取任务"""
    with Session(engine) as session:
        return session.get(ScheduledTask, task_id)


def get_task_by_name(name: str) -> ScheduledTask | None:
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


def update_task(task_id: int, data: ScheduledTaskUpdate) -> ScheduledTask | None:
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

        # 先删除关联的执行记录（避免外键约束错误）
        statement = select(TaskExecution).where(TaskExecution.task_id == task_id)
        executions = session.exec(statement).all()
        for execution in executions:
            session.delete(execution)

        session.delete(task)
        session.commit()

        logger.info(f"删除任务: {task.name} (#{task_id})")
        return True


async def delete_task_async(task_id: int) -> bool:
    """异步删除任务"""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        _db_executor,
        partial(delete_task, task_id),
    )


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


def validate_task_for_run(task_id: int) -> dict:
    """验证任务是否可以执行（仅读取，不写入数据库）

    用于 API 端点快速验证，不阻塞事件循环
    """
    with Session(engine) as session:
        task = session.get(ScheduledTask, task_id)
        if not task:
            return {"success": False, "message": "任务不存在"}

        try:
            # 验证处理函数存在
            get_handler(task.handler_path)
            kwargs = json.loads(task.handler_kwargs) if task.handler_kwargs else {}

            return {
                "success": True,
                "handler_path": task.handler_path,
                "handler_kwargs": kwargs,
            }
        except Exception as e:
            return {"success": False, "message": str(e)}


def run_task_in_background(
    task_id: int,
    handler_path: str,
    handler_kwargs: dict,
) -> None:
    """在后台执行任务（由 FastAPI BackgroundTasks 调用）

    注意：这是同步函数，在独立线程中执行，不会阻塞事件循环
    """
    # 创建新的事件循环执行异步任务
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    try:
        loop.run_until_complete(
            _execute_task_async(task_id, handler_path, handler_kwargs)
        )
    except Exception as e:
        # 捕获所有异常并记录，防止静默失败
        logger.error(f"后台任务 #{task_id} 执行异常: {e}")
        import traceback

        logger.error(f"调用栈: {traceback.format_exc()}")
    finally:
        loop.close()


async def _execute_task_async(
    task_id: int,
    handler_path: str,
    handler_kwargs: dict,
) -> None:
    """实际执行任务的异步函数（在后台线程的事件循环中运行）"""
    from app.scheduler.executor import execute_task_with_execution

    # 在后台线程中创建执行记录
    with Session(engine) as session:
        execution = TaskExecution(
            task_id=task_id,
            status=ExecutionStatus.PENDING,
            trigger_type="manual",
        )
        session.add(execution)
        session.commit()
        session.refresh(execution)
        execution_id = execution.id

    # 获取处理函数并执行
    handler = get_handler(handler_path)

    try:
        await execute_task_with_execution(
            task_id=task_id,
            handler=handler,
            execution_id=execution_id,
            trigger_type="manual",
            **handler_kwargs,
        )
    except Exception as e:
        logger.error(f"后台执行任务 #{task_id} 失败: {e}")


# ============================================================================
# 旧版函数（保留以兼容定时调度器调用）
# ============================================================================


async def run_task_now(task_id: int) -> dict:
    """立即执行任务（旧版，用于定时调度器）

    注意：此函数包含同步数据库操作，不适合在 API 端点中使用。
    API 端点应使用 validate_task_for_run + run_task_in_background 组合。
    """
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

            # 让出控制权，确保 API 立即返回
            await asyncio.sleep(0)

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
    """后台执行任务的辅助函数（旧版）"""
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


def get_execution_by_id(execution_id: int) -> TaskExecutionDetailResponse | None:
    """获取执行详情"""
    with Session(engine) as session:
        execution = session.get(TaskExecution, execution_id)
        if not execution:
            return None
        return TaskExecutionDetailResponse.model_validate(execution)


def get_all_executions(
    task_id: int | None = None,
    status: str | None = None,
    page: int = 1,
    size: int = 20,
) -> tuple[list[dict], int]:
    """获取所有任务的执行记录（带任务名称）

    优化：只选择列表视图需要的字段，不包含 log_output 和 error_traceback 等大文本字段
    """
    from sqlmodel import func

    with Session(engine) as session:
        # 构建查询 - 只选择需要的列（不包含大文本字段）
        statement = select(
            TaskExecution.id,
            TaskExecution.task_id,
            TaskExecution.status,
            TaskExecution.trigger_type,
            TaskExecution.started_at,
            TaskExecution.finished_at,
            TaskExecution.duration_ms,
            TaskExecution.result,
            TaskExecution.error_message,
            TaskExecution.created_at,
            ScheduledTask.name.label("task_name"),
        ).join(ScheduledTask, TaskExecution.task_id == ScheduledTask.id)

        # 筛选条件
        if task_id:
            statement = statement.where(TaskExecution.task_id == task_id)
        if status:
            statement = statement.where(TaskExecution.status == status)

        # 计算总数
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
        for row in results:
            exec_dict = {
                "id": row.id,
                "task_id": row.task_id,
                "task_name": row.task_name,
                "status": (
                    row.status.value if hasattr(row.status, "value") else row.status
                ),
                "trigger_type": row.trigger_type,
                "started_at": row.started_at.isoformat() if row.started_at else None,
                "finished_at": row.finished_at.isoformat() if row.finished_at else None,
                "duration_ms": row.duration_ms,
                "result": row.result,
                "error_message": row.error_message,
                "created_at": row.created_at.isoformat() if row.created_at else None,
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


def cancel_execution(execution_id: int) -> dict:
    """取消执行中的任务

    将运行中或等待中的任务标记为已取消状态。
    注意：这只是标记状态变更，无法真正终止已在运行的后台任务。

    Args:
        execution_id: 执行记录 ID

    Returns:
        dict: {"success": bool, "message": str}
    """
    from app.utils.redis_client import cleanup_execution_redis, get_logs

    with Session(engine) as session:
        execution = session.get(TaskExecution, execution_id)
        if not execution:
            return {"success": False, "message": "执行记录不存在"}

        # 只能取消运行中或等待中的任务
        if execution.status not in [ExecutionStatus.RUNNING, ExecutionStatus.PENDING]:
            return {
                "success": False,
                "message": f"无法取消状态为 {execution.status.value} 的任务",
            }

        # 从 Redis 获取已有日志并保存到数据库
        redis_logs = get_logs(execution_id)
        if redis_logs:
            execution.log_output = "\n".join(redis_logs)
            logger.info(f"任务 #{execution_id} 取消时保存了 {len(redis_logs)} 行日志")

        # 更新状态
        execution.status = ExecutionStatus.CANCELLED
        execution.finished_at = datetime.now()
        execution.error_message = "任务被手动取消"

        # 计算执行时长
        if execution.started_at:
            execution.duration_ms = int(
                (execution.finished_at - execution.started_at).total_seconds() * 1000
            )

        session.add(execution)
        session.commit()

        # 清理 Redis 中的日志数据
        cleanup_execution_redis(execution_id)

        logger.info(f"任务执行 #{execution_id} 已被取消")
        return {"success": True, "message": "任务已取消"}


# ============================================================================
# 异步版本函数（使用线程池避免阻塞事件循环）
# ============================================================================


async def get_all_tasks_async(
    status: str | None = None,
    category: str | None = None,
    page: int = 1,
    size: int = 20,
) -> list[ScheduledTask]:
    """异步获取所有任务"""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        _db_executor,
        partial(get_all_tasks, status=status, category=category, page=page, size=size),
    )


async def get_all_categories_async() -> list[str]:
    """异步获取所有任务分类"""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_db_executor, get_all_categories)


async def get_task_by_id_async(task_id: int) -> ScheduledTask | None:
    """异步根据 ID 获取任务"""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        _db_executor,
        partial(get_task_by_id, task_id),
    )


async def get_all_executions_async(
    task_id: int | None = None,
    status: str | None = None,
    page: int = 1,
    size: int = 20,
) -> tuple[list[dict], int]:
    """异步获取所有执行记录"""
    loop = asyncio.get_event_loop()
    func = partial(
        get_all_executions, task_id=task_id, status=status, page=page, size=size
    )
    return await loop.run_in_executor(_db_executor, func)


async def get_task_executions_async(
    task_id: int,
    page: int = 1,
    size: int = 20,
) -> list[TaskExecution]:
    """异步获取任务执行历史"""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        _db_executor,
        partial(get_task_executions, task_id, page=page, size=size),
    )


async def get_execution_by_id_async(
    execution_id: int,
) -> TaskExecutionDetailResponse | None:
    """异步获取执行详情"""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        _db_executor,
        partial(get_execution_by_id, execution_id),
    )


async def cancel_execution_async(execution_id: int) -> dict:
    """异步取消执行"""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        _db_executor,
        partial(cancel_execution, execution_id),
    )
