"""AI 工具定义模块

为 Function Calling 提供工具定义和执行函数。
"""

from app.clients.ai.tools.call_record_tools import (
    CALL_RECORD_TOOLS,
    execute_tool,
)

__all__ = [
    "CALL_RECORD_TOOLS",
    "execute_tool",
]
