"""调度器模块（Celery 版本）

任务调度由 Celery Worker 和 Beat 处理，本模块提供：
- 处理函数注册和发现
- 任务执行器
- 任务日志功能
"""

from app.scheduler.executor import execute_task, execute_task_with_execution
from app.scheduler.registry import (
    discover_handlers,
    get_handler,
    get_registered_handlers,
    register_handler,
)
from app.scheduler.task_logger import (
    is_execution_running,
    task_log,
)

__all__ = [
    "discover_handlers",
    "execute_task",
    "execute_task_with_execution",
    "get_handler",
    "get_registered_handlers",
    "is_execution_running",
    "register_handler",
    "task_log",
]
