"""脚本共享工具函数"""

from datetime import datetime


def normalize_time_param(value, default_time: str = "00:00") -> str | None:
    """
    统一处理时间参数，返回 'YYYY-MM-DD HH:mm' 格式字符串

    支持输入：
    - datetime.datetime 对象
    - 字符串 "YYYY-MM-DD"
    - 字符串 "YYYY-MM-DD HH:mm"
    - 字符串 "datetime.now()" 或 "now" - 返回当前时间
    - None

    Args:
        value: 时间参数值
        default_time: 当输入只有日期时，补充的默认时间（如 "00:00" 或 "23:59"）

    Returns:
        格式化后的时间字符串，或 None
    """
    if value is None:
        return None

    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M")

    if isinstance(value, str):
        value = value.strip()
        # 支持 datetime.now() 或 now 特殊值
        if value.lower() in ("datetime.now()", "now"):
            return datetime.now().strftime("%Y-%m-%d %H:%M")
        if len(value) == 10:  # YYYY-MM-DD
            return f"{value} {default_time}"
        return value

    raise ValueError(f"不支持的时间格式: {type(value)}")
