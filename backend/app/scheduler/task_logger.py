"""任务执行日志模块

提供 task_log() 函数，在任务执行过程中记录日志。
日志会保存到 TaskExecution.log_output 字段。

日志存储策略：
1. 实时存储到 Redis List（持久化，支持跨进程访问）
2. 通过 Redis Pub/Sub 发送通知信号（通知 SSE 有新日志）
3. 任务结束时批量写入数据库（永久存储）

使用方式:
    from app.scheduler import task_log

    async def run(**kwargs):
        task_log("开始处理")
        task_log("调试信息", print_console=True)   # 强制打印
        task_log("静默记录", print_console=False)  # 只记录不打印
"""

import threading
from contextvars import ContextVar
from datetime import datetime
from typing import Any

from loguru import logger
from sqlmodel import Session

from app.config import settings
from app.database import engine

# 上下文变量 - 用于在异步任务中传递执行上下文
_execution_id: ContextVar[int | None] = ContextVar("execution_id", default=None)
_log_buffer: ContextVar[list[str]] = ContextVar("log_buffer")

# 数据库写入锁（避免并发写入冲突）
_db_write_lock = threading.Lock()

# 记录哪些执行正在运行（用于 SSE 判断）
_running_executions: set[int] = set()
_running_lock = threading.Lock()


def _persist_log_to_db(execution_id: int, log_line: str) -> None:
    """
    实时将日志追加到数据库

    Args:
        execution_id: 执行记录ID
        log_line: 日志行
    """
    # 延迟导入避免循环依赖
    from app.models.task_execution import TaskExecution

    with _db_write_lock:
        try:
            with Session(engine) as session:
                execution = session.get(TaskExecution, execution_id)
                if execution:
                    # 追加日志到现有内容
                    if execution.log_output:
                        execution.log_output = execution.log_output + "\n" + log_line
                    else:
                        execution.log_output = log_line
                    session.add(execution)
                    session.commit()
        except Exception as e:
            # 日志保存失败不应影响任务执行
            logger.warning(f"实时保存日志失败: {e}")


def task_log(*args: Any, print_console: bool | None = None) -> None:
    """
    任务日志函数，类似 print

    Args:
        *args: 要记录的内容，多个参数会用空格连接
        print_console: 是否打印到控制台
            - None: 跟随 DEBUG 模式设置
            - True: 强制打印到控制台
            - False: 只记录到数据库，不打印

    Example:
        task_log("开始处理")
        task_log("处理进度:", 50, "%")
        task_log("调试信息", print_console=True)
    """
    # 构建日志消息
    message = " ".join(str(arg) for arg in args)
    timestamp = datetime.now().strftime("%H:%M:%S")
    log_line = f"[{timestamp}] {message}"

    # 获取当前执行ID
    exec_id = get_execution_id()

    # 添加到缓冲区
    try:
        buffer = _log_buffer.get()
    except LookupError:
        # 如果上下文未初始化，创建新的缓冲区
        buffer = []
        _log_buffer.set(buffer)
    buffer.append(log_line)

    # 存储到 Redis List + 发送 Pub/Sub 通知
    if exec_id:
        from app.utils.redis_client import publish_log, rpush_log

        # 1. 持久化存储到 Redis List
        rpush_log(exec_id, log_line)
        # 2. 发送通知信号（不发送完整日志，只通知有新日志）
        publish_log(exec_id, "NEW_LOG")

    # 控制台输出
    should_print = print_console if print_console is not None else settings.debug
    if should_print:
        print(log_line)


def get_execution_id() -> int | None:
    """获取当前执行记录 ID"""
    try:
        return _execution_id.get()
    except LookupError:
        return None


def flush_logs_to_db(execution_id: int | None = None) -> None:
    """
    批量将缓冲区日志写入数据库

    Args:
        execution_id: 指定执行ID，None 则使用当前上下文
    """
    from app.models.task_execution import TaskExecution

    exec_id = execution_id or get_execution_id()
    if not exec_id:
        return

    # 获取当前缓冲区内容
    log_content = get_log_output()
    if not log_content:
        return

    with _db_write_lock:
        try:
            with Session(engine) as session:
                execution = session.get(TaskExecution, exec_id)
                if execution:
                    execution.log_output = log_content
                    session.add(execution)
                    session.commit()
        except Exception as e:
            logger.warning(f"批量保存日志失败: {e}")


def get_log_output() -> str:
    """获取所有日志内容"""
    try:
        buffer = _log_buffer.get()
        return "\n".join(buffer)
    except LookupError:
        return ""


def init_log_context(execution_id: int) -> None:
    """初始化日志上下文（由执行器调用）"""
    _execution_id.set(execution_id)
    _log_buffer.set([])

    # 标记任务正在运行（本地 + Redis）
    with _running_lock:
        _running_executions.add(execution_id)

    # 设置 Redis 状态为 running（跨进程可见）
    from app.utils.redis_client import set_execution_status

    set_execution_status(execution_id, "running")


def clear_log_context(status: str = "completed") -> None:
    """清空日志上下文（由执行器调用）

    Args:
        status: 任务结束状态 (completed/failed)
    """
    exec_id = get_execution_id()

    if exec_id:
        # 1. 批量将日志写入数据库（永久存储）
        flush_logs_to_db(exec_id)

        # 2. 更新 Redis 状态 + 发送结束信号
        from app.utils.redis_client import publish_log_end, set_execution_status

        set_execution_status(exec_id, status)
        publish_log_end(exec_id)

        # 3. 从本地运行中列表移除
        with _running_lock:
            _running_executions.discard(exec_id)

    _execution_id.set(None)
    _log_buffer.set([])


def is_execution_running(execution_id: int) -> bool:
    """检查执行是否仍在运行

    优先检查 Redis 状态（跨进程可靠），回退到本地检查。
    """
    # 1. 优先检查 Redis 状态（跨进程有效）
    from app.utils.redis_client import get_execution_status

    redis_status = get_execution_status(execution_id)
    if redis_status is not None:
        return redis_status == "running"

    # 2. 回退到本地检查（单进程场景）
    with _running_lock:
        return execution_id in _running_executions
