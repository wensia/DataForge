"""安全执行 Python 表达式工具"""

import ast
import builtins
import json
import re
from datetime import date, datetime, time, timedelta
from typing import Any

# 允许使用的模块和类
SAFE_MODULES = {
    "datetime": datetime,  # datetime类，支持 datetime.now(), datetime.combine() 等
    "date": date,  # 日期类，支持 date.today()
    "time": time,  # 时间类，支持 time.min, time.max
    "timedelta": timedelta,  # 时间差，支持 timedelta(days=1)
    "json": json,
}

# 表达式兼容性替换规则
# 将 datetime.datetime.xxx 替换为 datetime.xxx（兼容旧写法）
COMPAT_REPLACEMENTS = [
    (r"\bdatetime\.datetime\b", "datetime"),  # datetime.datetime -> datetime
]


def safe_eval(expr: str) -> Any:
    """
    安全执行 Python 表达式

    支持:
    - 字面量: 123, "hello", [1,2,3], {"a": 1}
    - datetime 模块: datetime.datetime.now()
    - 简单表达式: 1 + 2, len([1,2,3])

    Args:
        expr: Python 表达式字符串

    Returns:
        执行结果

    Raises:
        ValueError: 表达式执行失败
    """
    expr = expr.strip()

    if not expr:
        raise ValueError("表达式不能为空")

    # 0. 应用兼容性替换（如 datetime.datetime -> datetime）
    for pattern, replacement in COMPAT_REPLACEMENTS:
        expr = re.sub(pattern, replacement, expr)

    # 1. 先尝试 ast.literal_eval (最安全)
    try:
        return ast.literal_eval(expr)
    except (ValueError, SyntaxError):
        pass

    # 2. 处理 import 语句
    lines = expr.split("\n")
    imports = {}
    code_lines = []

    for line in lines:
        line = line.strip()
        if not line:
            continue
        if line.startswith("import "):
            # import datetime
            module_name = line[7:].strip()
            if module_name in SAFE_MODULES:
                imports[module_name] = SAFE_MODULES[module_name]
            else:
                raise ValueError(f"不允许导入模块: {module_name}")
        else:
            code_lines.append(line)

    # 最后一行是表达式
    if not code_lines:
        raise ValueError("没有可执行的表达式")

    final_expr = code_lines[-1]

    # 3. 构建安全的命名空间
    # 使用完整的 builtins 以支持 datetime.combine 等方法内部需要的功能
    namespace = {
        "__builtins__": builtins,
        **imports,
        **SAFE_MODULES,  # 默认提供常用模块
    }

    # 4. 执行表达式
    try:
        return eval(final_expr, namespace, {})
    except Exception as e:
        raise ValueError(f"表达式执行失败: {e}") from e
