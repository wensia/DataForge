"""任务执行日志模块

提供 task_log() 函数，在任务执行过程中记录日志。
日志会保存到 TaskExecution.log_output 字段。
支持实时日志推送给 SSE 订阅者。

使用方式:
    from app.scheduler import task_log

    async def run(**kwargs):
        task_log("开始处理")
        task_log("调试信息", print_console=True)   # 强制打印
        task_log("静默记录", print_console=False)  # 只记录不打印
"""

import asyncio
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

# 实时日志订阅者管理（线程安全）
# key: execution_id, value: list of asyncio.Queue
_log_subscribers: dict[int, list[asyncio.Queue]] = {}
_subscribers_lock = threading.Lock()

# 数据库写入锁（避免并发写入冲突）
_db_write_lock = threading.Lock()


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

    # 推送给实时订阅者（线程安全）
    if exec_id:
        with _subscribers_lock:
            if exec_id in _log_subscribers:
                for queue in _log_subscribers[exec_id]:
                    try:
                        queue.put_nowait(log_line)
                    except asyncio.QueueFull:
                        pass  # 队列满则跳过

        # 【已移除】实时保存到数据库 - 改为任务结束时批量写入
        # _persist_log_to_db(exec_id, log_line)

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


def clear_log_context() -> None:
    """清空日志上下文（由执行器调用）"""
    exec_id = get_execution_id()

    # 任务结束时，批量将日志写入数据库
    if exec_id:
        flush_logs_to_db(exec_id)

    # 通知所有订阅者任务已结束（线程安全）
    if exec_id:
        with _subscribers_lock:
            if exec_id in _log_subscribers:
                for queue in _log_subscribers[exec_id]:
                    try:
                        queue.put_nowait(None)  # None 表示结束信号
                    except asyncio.QueueFull:
                        pass
                del _log_subscribers[exec_id]
    _execution_id.set(None)
    _log_buffer.set([])


def subscribe_log(execution_id: int) -> asyncio.Queue:
    """
    订阅执行日志

    Args:
        execution_id: 执行记录ID

    Returns:
        asyncio.Queue: 用于接收日志的队列
    """
    queue: asyncio.Queue = asyncio.Queue(maxsize=1000)
    with _subscribers_lock:
        if execution_id not in _log_subscribers:
            _log_subscribers[execution_id] = []
        _log_subscribers[execution_id].append(queue)
    return queue


def unsubscribe_log(execution_id: int, queue: asyncio.Queue) -> None:
    """
    取消订阅执行日志

    Args:
        execution_id: 执行记录ID
        queue: 订阅时返回的队列
    """
    with _subscribers_lock:
        if execution_id in _log_subscribers:
            try:
                _log_subscribers[execution_id].remove(queue)
                if not _log_subscribers[execution_id]:
                    del _log_subscribers[execution_id]
            except ValueError:
                pass


def get_current_log_buffer(execution_id: int) -> str:
    """
    获取执行中任务的当前日志缓冲区

    注意：这只在当前上下文中的执行ID匹配时有效
    """
    current_id = get_execution_id()
    if current_id == execution_id:
        return get_log_output()
    return ""


def is_execution_running(execution_id: int) -> bool:
    """检查执行是否仍在运行（是否有订阅者注册）"""
    with _subscribers_lock:
        return execution_id in _log_subscribers
