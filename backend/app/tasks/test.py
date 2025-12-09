"""测试任务 - 用于验证实时日志功能"""

import asyncio

from app.scheduler import task_log
from app.scheduler.registry import register_handler


async def test_realtime_log(duration: int = 10, interval: float = 1.0) -> dict:
    """
    测试实时日志推送

    模拟一个运行时间较长的任务，每隔一段时间输出日志。
    用于测试 SSE 实时日志推送功能。

    Args:
        duration: 任务运行时长（秒），默认 10 秒
        interval: 日志输出间隔（秒），默认 1 秒

    Returns:
        dict: 任务执行结果
    """
    task_log(f"开始测试任务，预计运行 {duration} 秒")
    task_log(f"日志输出间隔: {interval} 秒")

    total_logs = int(duration / interval)
    for i in range(1, total_logs + 1):
        await asyncio.sleep(interval)
        progress = (i / total_logs) * 100
        task_log(f"进度: {progress:.1f}% ({i}/{total_logs})")

    task_log("任务执行完成！")
    return {
        "status": "success",
        "duration": duration,
        "logs_count": total_logs,
    }


# 注册处理函数
register_handler("app.tasks.test:test_realtime_log", test_realtime_log)
