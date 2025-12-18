"""异步辅助工具

在 Celery Worker（gevent 池）中安全运行异步代码。

问题背景：
- Celery Worker 使用 gevent 池执行任务
- gevent 使用 greenlet 实现协程，与 asyncio 不兼容
- 直接使用 asyncio.run() 会导致 CancelScope 错误
- nest_asyncio 也有兼容性问题

解决方案：
- 在独立线程中创建新的事件循环运行异步代码
- 线程隔离避免 gevent greenlet 与 asyncio 的冲突

参考:
- https://github.com/gevent/gevent/issues/1857
- https://docs.celeryq.dev/en/stable/userguide/workers.html#concurrency
"""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Coroutine, TypeVar

from loguru import logger

# 类型变量
T = TypeVar("T")

# 全局线程池（复用线程避免创建开销）
# max_workers 设置为 None 让 Python 自动选择合适数量
_executor: ThreadPoolExecutor | None = None


def _get_executor() -> ThreadPoolExecutor:
    """获取线程池执行器（懒加载单例）"""
    global _executor
    if _executor is None:
        # 使用较小的线程池，因为每个线程都会创建事件循环
        _executor = ThreadPoolExecutor(
            max_workers=10,
            thread_name_prefix="async_runner_",
        )
    return _executor


def _run_in_new_loop(coro: Coroutine[Any, Any, T]) -> T:
    """在新的事件循环中运行协程

    此函数在线程池的线程中执行，创建独立的事件循环。

    Args:
        coro: 要执行的协程

    Returns:
        协程的返回值
    """
    # 创建新的事件循环
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    try:
        return loop.run_until_complete(coro)
    finally:
        # 清理事件循环
        try:
            # 取消所有待处理的任务
            pending = asyncio.all_tasks(loop)
            for task in pending:
                task.cancel()
            # 等待任务取消完成
            if pending:
                loop.run_until_complete(
                    asyncio.gather(*pending, return_exceptions=True)
                )
            loop.run_until_complete(loop.shutdown_asyncgens())
        finally:
            loop.close()
            asyncio.set_event_loop(None)


def run_async(coro: Coroutine[Any, Any, T], timeout: float | None = None) -> T:
    """在独立线程中运行异步代码

    解决 gevent + asyncio 冲突问题。适用于在 Celery Worker 中
    调用异步函数（如 httpx、aiohttp 等）。

    Args:
        coro: 要执行的协程
        timeout: 超时时间（秒），None 表示无限等待

    Returns:
        协程的返回值

    Raises:
        TimeoutError: 执行超时
        Exception: 协程抛出的异常

    Usage:
        # 在 Celery 任务中调用异步函数
        result = run_async(async_function(arg1, arg2))

        # 带超时
        result = run_async(slow_async_function(), timeout=30)
    """
    executor = _get_executor()

    try:
        future = executor.submit(_run_in_new_loop, coro)
        return future.result(timeout=timeout)
    except TimeoutError:
        logger.error(f"异步操作超时: {coro}")
        raise
    except Exception as e:
        logger.error(f"异步操作失败: {e}")
        raise


async def run_async_batch(
    coros: list[Coroutine[Any, Any, T]],
    concurrency: int = 10,
    return_exceptions: bool = True,
) -> list[T | Exception]:
    """并发运行多个协程

    在当前事件循环中并发执行多个协程，使用信号量控制并发数。

    注意：此函数本身是异步的，适用于在已有事件循环的环境中使用。
    如果需要在同步代码中调用，请使用 run_async(run_async_batch(...))。

    Args:
        coros: 协程列表
        concurrency: 最大并发数
        return_exceptions: 是否返回异常而不是抛出

    Returns:
        结果列表（与输入顺序对应）
    """
    semaphore = asyncio.Semaphore(concurrency)

    async def run_with_semaphore(coro: Coroutine[Any, Any, T]) -> T:
        async with semaphore:
            return await coro

    tasks = [run_with_semaphore(coro) for coro in coros]
    return await asyncio.gather(*tasks, return_exceptions=return_exceptions)


def shutdown_executor() -> None:
    """关闭线程池执行器

    在应用关闭时调用，清理资源。
    """
    global _executor
    if _executor is not None:
        _executor.shutdown(wait=True)
        _executor = None
        logger.debug("异步执行器线程池已关闭")
