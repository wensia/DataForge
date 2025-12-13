"""Kimi (月之暗面) AI 客户端

文档: https://platform.moonshot.cn/docs
"""

import json
from collections.abc import AsyncGenerator
from typing import Any

import httpx
from loguru import logger

from app.clients.ai.base import (
    AIClient,
    AIClientError,
    ChatMessage,
    ChatResponse,
    StreamChunk,
)

# Kimi API 配置
KIMI_API_BASE = "https://api.moonshot.cn/v1"


class KimiClient(AIClient):
    """Kimi AI 客户端

    支持超长上下文（最高 200K tokens）。

    模型列表:
        - moonshot-v1-8k: 8K 上下文
        - moonshot-v1-32k: 32K 上下文
        - moonshot-v1-128k: 128K 上下文
    """

    def __init__(self, api_key: str, base_url: str | None = None):
        super().__init__(api_key, base_url or KIMI_API_BASE)

    @property
    def provider_name(self) -> str:
        return "kimi"

    @property
    def default_model(self) -> str:
        return "moonshot-v1-32k"

    async def chat(
        self,
        messages: list[ChatMessage],
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        **kwargs: Any,
    ) -> ChatResponse:
        """发送聊天请求到 Kimi API

        Args:
            messages: 消息列表
            model: 模型名称
            temperature: 温度参数 (0-1)
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
                    logger.error(f"Kimi API 错误: {error_msg} (code={error_code})")
                    raise AIClientError(error_msg, error_code)

                result = response.json()

                # 解析响应
                choice = result.get("choices", [{}])[0]
                content = choice.get("message", {}).get("content", "")
                finish_reason = choice.get("finish_reason")

                usage = result.get("usage", {})
                tokens_used = usage.get("total_tokens")

                logger.debug(
                    f"Kimi 响应: model={model}, tokens={tokens_used}, "
                    f"finish_reason={finish_reason}"
                )

                return ChatResponse(
                    content=content,
                    model=model,
                    tokens_used=tokens_used,
                    finish_reason=finish_reason,
                )

        except httpx.TimeoutException as e:
            logger.error(f"Kimi API 超时: {e}")
            raise AIClientError("API 请求超时，请重试") from e
        except httpx.RequestError as e:
            logger.error(f"Kimi API 请求错误: {e}")
            raise AIClientError(f"API 请求失败: {e}") from e

    async def count_tokens(self, messages: list[ChatMessage]) -> int:
        """估算消息的 token 数量

        Kimi 提供了专门的 token 计数 API。

        Args:
            messages: 消息列表

        Returns:
            int: 估算的 token 数量
        """
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"{self.base_url}/tokenizers/estimate-token-count",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.default_model,
                        "messages": [msg.to_dict() for msg in messages],
                    },
                )

                if response.status_code == 200:
                    result = response.json()
                    return result.get("data", {}).get("total_tokens", 0)

        except Exception as e:
            logger.warning(f"估算 token 数量失败: {e}")

        # 简单估算：约 2 字符 = 1 token
        total_chars = sum(len(msg.content) for msg in messages)
        return total_chars // 2

    def select_model_by_context(self, estimated_tokens: int) -> str:
        """根据上下文长度选择合适的模型

        Args:
            estimated_tokens: 预估的 token 数量

        Returns:
            str: 推荐的模型名称
        """
        if estimated_tokens < 6000:
            return "moonshot-v1-8k"
        elif estimated_tokens < 28000:
            return "moonshot-v1-32k"
        else:
            return "moonshot-v1-128k"

    async def chat_stream(
        self,
        messages: list[ChatMessage],
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        **kwargs: Any,
    ) -> AsyncGenerator[StreamChunk, None]:
        """流式聊天 - 返回 AsyncGenerator

        文档: https://platform.moonshot.cn/docs/api/chat#%E6%B5%81%E5%BC%8F%E8%BE%93%E5%87%BA

        Args:
            messages: 消息列表
            model: 模型名称
            temperature: 温度参数 (0-1)
            max_tokens: 最大生成 token 数
            **kwargs: 其他参数

        Yields:
            StreamChunk: 流式响应块
        """
        model = model or self.default_model

        # 构建请求体
        body: dict[str, Any] = {
            "model": model,
            "messages": [msg.to_dict() for msg in messages],
            "temperature": temperature,
            "stream": True,
        }

        if max_tokens:
            body["max_tokens"] = max_tokens

        # 合并其他参数
        body.update(kwargs)

        logger.debug(f"Kimi 流式请求: model={model}")

        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                async with client.stream(
                    "POST",
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=body,
                ) as response:
                    if response.status_code != 200:
                        # 读取错误响应
                        error_text = await response.aread()
                        try:
                            error_data = json.loads(error_text)
                            error_msg = error_data.get("error", {}).get(
                                "message", "未知错误"
                            )
                            error_code = error_data.get("error", {}).get(
                                "code", "unknown"
                            )
                        except json.JSONDecodeError:
                            error_msg = error_text.decode() if error_text else "未知错误"
                            error_code = "unknown"
                        logger.error(
                            f"Kimi 流式 API 错误: {error_msg} (code={error_code})"
                        )
                        raise AIClientError(error_msg, error_code)

                    # 逐行读取 SSE 响应
                    async for line in response.aiter_lines():
                        line = line.strip()
                        if not line:
                            continue

                        # SSE 格式: data: {...}
                        if line.startswith("data: "):
                            data_str = line[6:]  # 去掉 "data: " 前缀

                            # 检查结束标记
                            if data_str == "[DONE]":
                                logger.debug("Kimi 流式响应完成")
                                break

                            try:
                                data = json.loads(data_str)
                                choice = data.get("choices", [{}])[0]
                                delta = choice.get("delta", {})
                                finish_reason = choice.get("finish_reason")

                                # 提取增量内容
                                content = delta.get("content", "")

                                # 提取 usage (仅最后一块可能包含)
                                usage = data.get("usage")
                                tokens_used = (
                                    usage.get("total_tokens") if usage else None
                                )

                                # 只有有内容时才 yield
                                if content or finish_reason:
                                    yield StreamChunk(
                                        content=content or "",
                                        finish_reason=finish_reason,
                                        tokens_used=tokens_used,
                                        model=model,
                                    )

                            except json.JSONDecodeError as e:
                                logger.warning(
                                    f"Kimi 流式响应解析失败: {e}, line={line}"
                                )
                                continue

        except httpx.TimeoutException as e:
            logger.error(f"Kimi 流式 API 超时: {e}")
            raise AIClientError("API 请求超时，请重试") from e
        except httpx.RequestError as e:
            logger.error(f"Kimi 流式 API 请求错误: {e}")
            raise AIClientError(f"API 请求失败: {e}") from e
