"""AI 客户端模块

支持 Kimi 和 DeepSeek 等 AI 服务。
"""

from app.clients.ai.base import AIClient, AIClientError, ChatMessage
from app.clients.ai.deepseek import DeepSeekClient
from app.clients.ai.kimi import KimiClient

__all__ = [
    "AIClient",
    "AIClientError",
    "ChatMessage",
    "KimiClient",
    "DeepSeekClient",
]


def get_ai_client(provider: str, api_key: str, base_url: str | None = None) -> AIClient:
    """获取 AI 客户端实例

    Args:
        provider: AI 服务提供商 (kimi / deepseek)
        api_key: API 密钥
        base_url: API 基础地址（可选）

    Returns:
        AIClient: AI 客户端实例

    Raises:
        ValueError: 不支持的提供商
    """
    if provider == "kimi":
        return KimiClient(api_key=api_key, base_url=base_url)
    elif provider == "deepseek":
        return DeepSeekClient(api_key=api_key, base_url=base_url)
    else:
        raise ValueError(f"不支持的 AI 服务提供商: {provider}")
