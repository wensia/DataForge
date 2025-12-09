"""调度器模块"""

from app.scheduler.core import (
    get_scheduler,
    init_scheduler,
    shutdown_scheduler,
    start_scheduler,
)
from app.scheduler.executor import execute_task
from app.scheduler.registry import (
    discover_handlers,
    get_handler,
    get_registered_handlers,
    register_handler,
)
from app.scheduler.task_logger import (
    subscribe_log,
    task_log,
    unsubscribe_log,
)

__all__ = [
    "discover_handlers",
    "execute_task",
    "get_handler",
    "get_registered_handlers",
    "get_scheduler",
    "init_scheduler",
    "register_handler",
    "shutdown_scheduler",
    "start_scheduler",
    "subscribe_log",
    "task_log",
    "unsubscribe_log",
]
