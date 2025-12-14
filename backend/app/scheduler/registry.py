"""任务处理函数注册表"""

import importlib
import importlib.util
import inspect
from collections.abc import Callable
from pathlib import Path
from typing import Any, get_type_hints

from loguru import logger

from app.config import settings

_handlers: dict[str, Callable] = {}
_handler_info: dict[str, dict[str, Any]] = {}  # 存储脚本元信息


def get_handler_params(handler: Callable) -> list[dict]:
    """
    获取处理函数的参数信息

    Args:
        handler: 处理函数

    Returns:
        参数信息列表，每个参数包含 name, type, default, required
    """
    sig = inspect.signature(handler)

    # 尝试获取类型注解
    try:
        hints = get_type_hints(handler)
    except Exception:
        hints = {}

    params = []
    for name, param in sig.parameters.items():
        # 跳过 **kwargs
        if param.kind == inspect.Parameter.VAR_KEYWORD:
            continue

        # 获取类型名称
        type_hint = hints.get(name)
        type_name = (
            type_hint.__name__
            if type_hint and hasattr(type_hint, "__name__")
            else "any"
        )

        # 获取默认值
        has_default = param.default != inspect.Parameter.empty
        default = param.default if has_default else None

        params.append(
            {
                "name": name,
                "type": type_name,
                "default": repr(default) if has_default else None,
                "required": not has_default,
            }
        )

    return params


def register_handler(
    path: str, handler: Callable, info: dict[str, Any] | None = None
) -> None:
    """
    注册任务处理函数

    Args:
        path: 处理函数路径，如 'app.tasks.sync:sync_accounts' 或 'scripts:example_task'
        handler: 处理函数
        info: 可选的元信息（如 name, description）
    """
    _handlers[path] = handler
    if info:
        _handler_info[path] = info
    logger.debug(f"注册任务处理函数: {path}")


def get_handler(path: str) -> Callable:
    """
    获取任务处理函数

    Args:
        path: 处理函数路径，如 'app.tasks.sync:sync_accounts'

    Returns:
        处理函数

    Raises:
        ValueError: 处理函数不存在
    """
    if path in _handlers:
        return _handlers[path]

    # 动态导入
    try:
        module_path, func_name = path.rsplit(":", 1)
        module = importlib.import_module(module_path)
        handler = getattr(module, func_name)
        _handlers[path] = handler
        return handler
    except (ValueError, ModuleNotFoundError, AttributeError) as e:
        raise ValueError(f"无法加载处理函数 {path}: {e}") from e


def get_registered_handlers() -> list[dict]:
    """
    获取所有已注册的处理函数

    Returns:
        处理函数列表
    """
    handlers = []
    for path, handler in _handlers.items():
        info = _handler_info.get(path, {})
        handlers.append(
            {
                "path": path,
                "name": info.get("name", handler.__name__),
                "description": info.get("description", handler.__doc__ or ""),
                "doc": handler.__doc__ or "",
                "params": get_handler_params(handler),
            }
        )
    return handlers


def discover_scripts() -> None:
    """扫描 scripts 文件夹并注册所有任务脚本"""
    scripts_dir = Path(settings.scripts_path)

    if not scripts_dir.exists():
        logger.warning(f"脚本目录不存在: {scripts_dir.absolute()}")
        return

    script_count = 0
    for script_file in scripts_dir.glob("*.py"):
        # 跳过 __init__.py 和以 _ 开头的文件
        if script_file.name.startswith("_"):
            continue

        module_name = script_file.stem
        handler_path = f"scripts:{module_name}"

        try:
            # 动态加载脚本模块
            spec = importlib.util.spec_from_file_location(
                f"scripts.{module_name}", script_file
            )
            if spec is None or spec.loader is None:
                logger.warning(f"无法加载脚本规格: {script_file}")
                continue

            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            # 检查是否有 run 函数
            if not hasattr(module, "run"):
                logger.warning(f"脚本缺少 run 函数: {script_file}")
                continue

            run_func = getattr(module, "run")

            # 获取可选的元信息
            info = getattr(module, "TASK_INFO", {})

            # 注册处理函数
            register_handler(handler_path, run_func, info)
            script_count += 1
            logger.info(f"已注册脚本: {handler_path}")

        except Exception as e:
            logger.error(f"加载脚本失败 {script_file}: {e}")

    logger.info(f"从 scripts 文件夹加载了 {script_count} 个脚本")


def discover_handlers() -> None:
    """自动发现并注册所有任务处理函数"""
    # 1. 扫描 scripts 文件夹
    discover_scripts()

    # 2. 保留对 app.tasks 的支持（向后兼容）
    try:
        from app import tasks  # noqa: F401
    except ImportError as e:
        logger.warning(f"任务模块导入失败: {e}")

    logger.info(f"共发现 {len(_handlers)} 个任务处理函数")
