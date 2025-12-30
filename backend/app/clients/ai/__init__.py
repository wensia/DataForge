"""AI 客户端模块

支持 Kimi 和 DeepSeek 等 AI 服务。
"""

from app.clients.ai.base import (
    AIClient,
    AIClientError,
    ChatMessage,
    ChatResponse,
    FunctionCall,
    StreamChunk,
    ToolCall,
)
from app.clients.ai.doubao import DoubaoClient
from app.clients.ai.deepseek import DeepSeekClient
from app.clients.ai.kimi import KimiClient

__all__ = [
    "AIClient",
    "AIClientError",
    "ChatMessage",
    "ChatResponse",
    "FunctionCall",
    "StreamChunk",
    "ToolCall",
    "KimiClient",
    "DeepSeekClient",
    "DoubaoClient",
]


def get_ai_client(
    provider: str, api_key: str, base_url: str | None = None, **kwargs
) -> AIClient:
    """获取 AI 客户端实例

    Args:
        provider: AI 服务提供商 (kimi / deepseek / doubao)
        api_key: API 密钥
        base_url: API 基础地址（可选）
        **kwargs: 其他参数 (如 endpoint_id)

    Returns:
        AIClient: AI 客户端实例

    Raises:
        ValueError: 不支持的提供商
    """
    if provider == "kimi":
        return KimiClient(api_key=api_key, base_url=base_url)
    elif provider == "deepseek":
        return DeepSeekClient(api_key=api_key, base_url=base_url)
    elif provider == "doubao":
        endpoint_id = kwargs.get("endpoint_id", "")
        return DoubaoClient(
            api_key=api_key, endpoint_id=endpoint_id, base_url=base_url
        )
    else:
        raise ValueError(f"不支持的 AI 服务提供商: {provider}")
