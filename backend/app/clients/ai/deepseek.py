"""DeepSeek AI 客户端

文档: https://platform.deepseek.com/api-docs
"""

from typing import Any

import httpx
from loguru import logger

from app.clients.ai.base import AIClient, AIClientError, ChatMessage, ChatResponse

# DeepSeek API 配置
DEEPSEEK_API_BASE = "https://api.deepseek.com/v1"


class DeepSeekClient(AIClient):
    """DeepSeek AI 客户端

    性价比高，推理能力强。

    模型列表:
        - deepseek-chat: 通用对话模型
        - deepseek-coder: 代码生成模型
    """

    def __init__(self, api_key: str, base_url: str | None = None):
        super().__init__(api_key, base_url or DEEPSEEK_API_BASE)

    @property
    def provider_name(self) -> str:
        return "deepseek"

    @property
    def default_model(self) -> str:
        return "deepseek-chat"

    async def chat(
        self,
        messages: list[ChatMessage],
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        **kwargs: Any,
    ) -> ChatResponse:
        """发送聊天请求到 DeepSeek API

        Args:
            messages: 消息列表
            model: 模型名称
            temperature: 温度参数 (0-2)
            max_tokens: 最大生成 token 数
            **kwargs: 其他参数

        Returns:
            ChatResponse: 聊天响应
        """
        model = model or self.default_model

        # 构建请求体
        body: dict[str, Any] = {
            "model": model,
            "messages": [msg.to_dict() for msg in messages],
            "temperature": temperature,
        }

        if max_tokens:
            body["max_tokens"] = max_tokens

        # 合并其他参数
        body.update(kwargs)

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=body,
                )

                if response.status_code != 200:
                    error_data = response.json()
                    error_msg = error_data.get("error", {}).get("message", "未知错误")
                    error_code = error_data.get("error", {}).get("code", "unknown")
                    logger.error(f"DeepSeek API 错误: {error_msg} (code={error_code})")
                    raise AIClientError(error_msg, error_code)

                result = response.json()

                # 解析响应
                choice = result.get("choices", [{}])[0]
                content = choice.get("message", {}).get("content", "")
                finish_reason = choice.get("finish_reason")

                usage = result.get("usage", {})
                tokens_used = usage.get("total_tokens")

                logger.debug(
                    f"DeepSeek 响应: model={model}, tokens={tokens_used}, "
                    f"finish_reason={finish_reason}"
                )

                return ChatResponse(
                    content=content,
                    model=model,
                    tokens_used=tokens_used,
                    finish_reason=finish_reason,
                )

        except httpx.TimeoutException as e:
            logger.error(f"DeepSeek API 超时: {e}")
            raise AIClientError("API 请求超时，请重试") from e
        except httpx.RequestError as e:
            logger.error(f"DeepSeek API 请求错误: {e}")
            raise AIClientError(f"API 请求失败: {e}") from e

    async def chat_with_coder(
        self,
        messages: list[ChatMessage],
        temperature: float = 0.0,
        **kwargs: Any,
    ) -> ChatResponse:
        """使用代码模型聊天

        Args:
            messages: 消息列表
            temperature: 温度参数（代码生成建议使用较低值）
            **kwargs: 其他参数

        Returns:
            ChatResponse: 聊天响应
        """
        return await self.chat(
            messages=messages,
            model="deepseek-coder",
            temperature=temperature,
            **kwargs,
        )
