"""任务执行器 - 包装任务执行，记录日志和错误"""

import json
import traceback
from datetime import datetime
from typing import Any, Callable

from loguru import logger
from sqlmodel import Session

from app.database import engine
from app.models.task import ScheduledTask
from app.models.task_execution import ExecutionStatus, TaskExecution
from app.scheduler.task_logger import clear_log_context, get_log_output, init_log_context
from app.utils.safe_eval import safe_eval


def resolve_kwargs(kwargs: dict[str, Any]) -> dict[str, Any]:
    """
    解析参数表达式

    将字符串类型的参数值通过 safe_eval 转换为实际 Python 对象

    Args:
        kwargs: 原始参数字典

    Returns:
        解析后的参数字典
    """
    resolved = {}
    for key, value in kwargs.items():
        if isinstance(value, str) and value.strip():
            try:
                resolved[key] = safe_eval(value)
                logger.debug(f"参数 {key} 解析成功: {value!r} -> {resolved[key]!r}")
            except Exception as e:
                # 解析失败，保持原值
                resolved[key] = value
                logger.warning(f"参数 {key} 解析失败，保持原值: {e}")
        else:
            resolved[key] = value
    return resolved


async def execute_task(
    task_id: int,
    handler: Callable,
    trigger_type: str = "scheduled",
    **kwargs: Any,
) -> TaskExecution:
    """
    执行任务，记录执行历史

    Args:
        task_id: 任务 ID
        handler: 处理函数
        trigger_type: 触发类型 (scheduled/manual)
        **kwargs: 传递给处理函数的参数（字符串值会通过 safe_eval 解析）

    Returns:
        TaskExecution: 执行记录
    """
    # 解析参数表达式
    resolved_kwargs = resolve_kwargs(kwargs)

    execution_id: int | None = None
    start_time = datetime.now()

    # 创建执行记录
    with Session(engine) as session:
        execution = TaskExecution(
            task_id=task_id,
            status=ExecutionStatus.RUNNING,
            trigger_type=trigger_type,
            started_at=start_time,
        )
        session.add(execution)
        session.commit()
        session.refresh(execution)
        execution_id = execution.id

    logger.info(f"开始执行任务 #{task_id}, 执行记录 #{execution_id}")

    # 初始化日志上下文
    init_log_context(execution_id)

    try:
        # 执行处理函数（使用解析后的参数）
        result = await handler(**resolved_kwargs)

        # 获取任务日志
        log_output = get_log_output()

        # 更新执行记录为成功
        end_time = datetime.now()
        duration_ms = int((end_time - start_time).total_seconds() * 1000)

        with Session(engine) as session:
            execution = session.get(TaskExecution, execution_id)
            if execution:
                execution.status = ExecutionStatus.SUCCESS
                execution.finished_at = end_time
                execution.duration_ms = duration_ms
                execution.result = (
                    json.dumps(result, ensure_ascii=False) if result else None
                )
                execution.log_output = log_output if log_output else None
                session.add(execution)

            # 更新任务统计
            task = session.get(ScheduledTask, task_id)
            if task:
                task.last_run_at = end_time
                task.run_count += 1
                task.success_count += 1
                task.updated_at = datetime.now()
                session.add(task)

            session.commit()
            session.refresh(execution)

        logger.info(f"任务 #{task_id} 执行成功, 耗时 {duration_ms}ms")
        return execution

    except Exception as e:
        # 获取任务日志
        log_output = get_log_output()

        # 更新执行记录为失败
        end_time = datetime.now()
        duration_ms = int((end_time - start_time).total_seconds() * 1000)
        error_tb = traceback.format_exc()

        with Session(engine) as session:
            execution = session.get(TaskExecution, execution_id)
            if execution:
                execution.status = ExecutionStatus.FAILED
                execution.finished_at = end_time
                execution.duration_ms = duration_ms
                execution.error_message = str(e)
                execution.error_traceback = error_tb
                execution.log_output = log_output if log_output else None
                session.add(execution)

            # 更新任务统计
            task = session.get(ScheduledTask, task_id)
            if task:
                task.last_run_at = end_time
                task.run_count += 1
                task.fail_count += 1
                task.updated_at = datetime.now()
                session.add(task)

            session.commit()
            session.refresh(execution)

        logger.error(f"任务 #{task_id} 执行失败: {e}")
        return execution

    finally:
        # 清理日志上下文
        clear_log_context()
