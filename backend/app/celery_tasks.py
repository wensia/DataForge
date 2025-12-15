"""Celery 任务定义

核心设计：
1. 使用一个通用任务包装器，通过 handler_path 动态路由到具体脚本
2. 支持自动重试（网络错误、临时故障）
3. 使用 gevent.Timeout 控制任务超时（soft_time_limit 在 gevent 下不生效）
4. 使用 Redis 分布式锁防止同一任务并发执行

官方最佳实践参考:
- https://docs.celeryq.dev/en/stable/userguide/tasks.html#retrying
- https://docs.celeryq.dev/en/stable/userguide/tasks.html#bound-tasks
"""

import asyncio
from typing import Any

import gevent
import nest_asyncio
from celery import Task
from loguru import logger
from sqlmodel import Session

# 允许嵌套事件循环（解决 gevent + asyncio 冲突）
nest_asyncio.apply()

from app.celery_app import celery_app
from app.config import settings
from app.database import engine
from app.models.task_execution import ExecutionStatus, TaskExecution

# ============================================================================
# 可重试异常定义
# ============================================================================

# 这些异常会触发自动重试
RETRYABLE_EXCEPTIONS = (
    ConnectionError,
    TimeoutError,
    OSError,  # 包含网络相关错误
)


def is_retryable_exception(exc: Exception) -> bool:
    """判断异常是否应该触发重试

    Args:
        exc: 异常实例

    Returns:
        bool: 是否应该重试
    """
    # 直接类型匹配
    if isinstance(exc, RETRYABLE_EXCEPTIONS):
        return True

    # 检查异常消息中的关键词（兜底）
    error_msg = str(exc).lower()
    retryable_keywords = [
        "connection",
        "timeout",
        "network",
        "temporary",
        "unavailable",
        "reset by peer",
        "broken pipe",
    ]
    return any(keyword in error_msg for keyword in retryable_keywords)


# ============================================================================
# 自定义 Task 基类
# ============================================================================


class DataForgeTask(Task):
    """自定义 Task 基类

    功能:
    1. 确保处理函数已注册
    2. 提供统一的错误处理
    """

    _handlers_discovered = False

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        # 确保处理函数已注册（Worker 启动时只执行一次）
        if not DataForgeTask._handlers_discovered:
            from app.scheduler.registry import discover_handlers

            discover_handlers()
            DataForgeTask._handlers_discovered = True
            logger.info("Celery Worker 已加载任务处理函数")
        return super().__call__(*args, **kwargs)

    def on_retry(
        self, exc: Exception, task_id: str, args: tuple, kwargs: dict, einfo: Any
    ) -> None:
        """任务重试时的回调"""
        logger.warning(
            f"任务 {task_id} 将重试, "
            f"原因: {exc.__class__.__name__}: {exc}, "
            f"当前重试次数: {self.request.retries}"
        )

    def on_failure(
        self,
        exc: Exception,
        task_id: str,
        args: tuple,
        kwargs: dict,
        einfo: Any,
    ) -> None:
        """任务最终失败时的回调"""
        logger.error(f"任务 {task_id} 最终失败: {exc.__class__.__name__}: {exc}")


# ============================================================================
# 任务超时异常
# ============================================================================


class TaskTimeoutError(Exception):
    """任务执行超时"""

    pass


# ============================================================================
# 核心任务执行器
# ============================================================================


@celery_app.task(
    base=DataForgeTask,
    bind=True,
    name="dataforge.execute_task",
    # ---------- 重试配置 ----------
    max_retries=settings.celery_task_default_max_retries,
    default_retry_delay=settings.celery_task_retry_delay,
    retry_backoff=settings.celery_task_retry_backoff,
    retry_jitter=settings.celery_task_retry_jitter,
    # ---------- 确认模式 ----------
    acks_late=True,  # 任务完成后才确认
    reject_on_worker_lost=True,  # Worker 丢失时重新入队
)
def execute_scheduled_task(
    self: Task,
    task_id: int,
    handler_path: str,
    handler_kwargs: dict[str, Any] | None = None,
    trigger_type: str = "scheduled",
    execution_id: int | None = None,
    timeout: int | None = None,
) -> dict[str, Any]:
    """
    通用任务执行器

    Args:
        task_id: ScheduledTask.id
        handler_path: 处理函数路径，如 "scripts:sync_accounts"
        handler_kwargs: 传递给处理函数的参数
        trigger_type: 触发类型 (scheduled/manual)
        execution_id: 可选的预创建执行记录 ID（手动触发时使用）
        timeout: 任务超时时间（秒），默认使用配置值

    Returns:
        执行结果字典
    """
    from app.scheduler.executor import execute_task_with_execution
    from app.scheduler.registry import get_handler
    from app.utils.task_lock import acquire_task_lock, release_task_lock

    kwargs = handler_kwargs or {}
    task_timeout = timeout or settings.celery_task_default_timeout
    lock_key = f"task_lock:{task_id}"
    lock_acquired = False

    # ========== 1. 获取分布式锁 ==========
    lock_acquired = acquire_task_lock(lock_key, timeout=task_timeout)
    if not lock_acquired:
        logger.info(f"任务 #{task_id} 正在执行中，跳过本次调度")
        return {
            "success": False,
            "skipped": True,
            "reason": "任务正在执行中",
            "task_id": task_id,
        }

    try:
        # ========== 2. 获取处理函数 ==========
        try:
            handler = get_handler(handler_path)
        except ValueError as e:
            logger.error(f"无法加载处理函数 {handler_path}: {e}")
            return {"success": False, "error": str(e)}

        # ========== 3. 创建/获取执行记录 ==========
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

        # ========== 4. 使用 gevent 超时控制执行任务 ==========
        try:
            # 使用 gevent.Timeout 实现超时控制
            # 因为 soft_time_limit 在 gevent 池中不生效
            with gevent.Timeout(
                task_timeout, TaskTimeoutError(f"任务执行超过 {task_timeout} 秒")
            ):
                # 使用 asyncio.run() 来正确管理事件循环
                # nest_asyncio.apply() 在模块加载时已调用，允许嵌套
                result = asyncio.run(
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

        except TaskTimeoutError as e:
            # 超时处理：标记执行记录为超时失败
            logger.error(f"任务 #{task_id} 执行超时: {e}")
            _mark_execution_timeout(execution_id, str(e))
            return {
                "success": False,
                "timeout": True,
                "error": str(e),
                "execution_id": execution_id,
            }

    except Exception as e:
        # ========== 5. 异常处理与重试 ==========
        logger.error(f"任务 #{task_id} 执行异常: {e}")

        # 判断是否应该重试
        if is_retryable_exception(e) and self.request.retries < self.max_retries:
            logger.info(
                f"任务 #{task_id} 将触发重试 "
                f"({self.request.retries + 1}/{self.max_retries})"
            )
            # 释放锁，让重试可以重新获取
            release_task_lock(lock_key)
            lock_acquired = False
            raise self.retry(exc=e)

        # 不可重试的异常，标记失败
        if execution_id:
            _mark_execution_failed(execution_id, str(e))

        return {
            "success": False,
            "error": str(e),
            "execution_id": execution_id,
        }

    finally:
        # ========== 6. 释放锁 ==========
        if lock_acquired:
            release_task_lock(lock_key)


# ============================================================================
# 辅助函数
# ============================================================================


def _mark_execution_timeout(execution_id: int, error_message: str) -> None:
    """标记执行记录为超时"""
    from datetime import datetime

    with Session(engine) as session:
        execution = session.get(TaskExecution, execution_id)
        if execution:
            execution.status = ExecutionStatus.FAILED
            execution.finished_at = datetime.now()
            execution.error_message = f"[TIMEOUT] {error_message}"
            if execution.started_at:
                execution.duration_ms = int(
                    (execution.finished_at - execution.started_at).total_seconds()
                    * 1000
                )
            session.add(execution)
            session.commit()


def _mark_execution_failed(execution_id: int, error_message: str) -> None:
    """标记执行记录为失败"""
    from datetime import datetime

    with Session(engine) as session:
        execution = session.get(TaskExecution, execution_id)
        if execution and execution.status == ExecutionStatus.PENDING:
            execution.status = ExecutionStatus.FAILED
            execution.finished_at = datetime.now()
            execution.error_message = error_message
            session.add(execution)
            session.commit()


# ============================================================================
# 系统任务
# ============================================================================


@celery_app.task(
    name="dataforge.cleanup_old_executions",
    max_retries=2,
    default_retry_delay=60,
)
def cleanup_old_executions() -> dict[str, Any]:
    """
    清理旧的执行记录（系统任务）

    直接执行清理逻辑，不需要通过 handler_path 路由。
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
