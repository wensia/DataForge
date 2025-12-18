"""任务注册表

提供获取已注册 Celery 任务信息的接口。
任务通过 @celery_app.task 装饰器在 app/tasks/ 目录下定义。
"""

from typing import Any

from loguru import logger


def get_registered_tasks() -> list[dict[str, Any]]:
    """获取所有已注册的 Celery 任务

    从 app/tasks/__init__.py 的 REGISTERED_TASKS 获取任务信息。

    Returns:
        list: 任务信息列表，每个任务包含:
            - path: Celery 任务名称（前端使用此字段匹配 handler_path）
            - name: 显示名称
            - description: 任务描述
            - doc: 文档（可选）
            - category: 任务分类
            - params: 参数列表
    """
    try:
        from app.tasks import REGISTERED_TASKS

        tasks = []
        for task_name, info in REGISTERED_TASKS.items():
            tasks.append(
                {
                    "path": task_name,  # 前端使用 path 字段
                    "name": info.get("name", task_name),
                    "description": info.get("description", ""),
                    "doc": info.get("doc", ""),
                    "category": info.get("category", "default"),
                    "params": info.get("params", []),
                }
            )
        return tasks
    except ImportError as e:
        logger.error(f"无法导入任务模块: {e}")
        return []


def get_task_info(task_name: str) -> dict[str, Any] | None:
    """获取指定任务的信息

    Args:
        task_name: Celery 任务名称

    Returns:
        dict | None: 任务信息，不存在返回 None
    """
    try:
        from app.tasks import REGISTERED_TASKS

        info = REGISTERED_TASKS.get(task_name)
        if info:
            return {
                "task_name": task_name,
                "name": info.get("name", task_name),
                "description": info.get("description", ""),
                "category": info.get("category", "default"),
                "params": info.get("params", []),
            }
        return None
    except ImportError:
        return None


def is_task_registered(task_name: str) -> bool:
    """检查任务是否已注册

    Args:
        task_name: Celery 任务名称

    Returns:
        bool: 是否已注册
    """
    try:
        from app.celery_app import celery_app

        return task_name in celery_app.tasks
    except Exception:
        return False
