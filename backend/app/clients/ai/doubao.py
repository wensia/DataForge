"""Doubao (火山引擎 Ark) AI 客户端

文档: https://www.volcengine.com/docs/82379/1099475
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
    ToolCall,
)

# Volcengine Ark API 配置
# 注意：Volcengine 使用 endpoint_id 作为 model 参数
ARK_API_BASE = "https://ark.cn-beijing.volces.com/api/v3"


class DoubaoClient(AIClient):
    """Doubao (火山引擎) AI 客户端
    
    兼容 OpenAI 接口格式。
    需要同时提供 API Key 和 Endpoint ID (作为默认模型)。
    """

    def __init__(self, api_key: str, endpoint_id: str, base_url: str | None = None):
        """初始化 Doubao 客户端

        Args:
            api_key: 火山引擎 API Key
            endpoint_id: 推理接入点 ID (例如 ep-20240604123456-abcde)
            base_url: API 基础地址 (可选)
        """
        super().__init__(api_key, base_url or ARK_API_BASE)
        self.endpoint_id = endpoint_id

    @property
    def provider_name(self) -> str:
        return "doubao"

    @property
    def default_model(self) -> str:
        # 在 Ark 中，通常使用 endpoint_id 作为 model 参数
        return self.endpoint_id

    async def chat(
        self,
        messages: list[ChatMessage],
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        **kwargs: Any,
    ) -> ChatResponse:
        """发送聊天请求到 Ark API

        Args:
            messages: 消息列表
            model: 模型名称 (通常是 endpoint_id)
            temperature: 温度参数
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
                    logger.error(f"Doubao API 错误: {error_msg} (code={error_code})")
                    raise AIClientError(error_msg, error_code)

                result = response.json()

                # 解析响应
                choice = result.get("choices", [{}])[0]
                message = choice.get("message", {})
                content = message.get("content", "") or ""
                finish_reason = choice.get("finish_reason")

                # 解析思考内容 (reasoning_content)
                reasoning_content = message.get("reasoning_content")

                # 解析工具调用
                tool_calls_data = message.get("tool_calls")
                tool_calls = None
                if tool_calls_data:
                    tool_calls = [ToolCall.from_dict(tc) for tc in tool_calls_data]

                usage = result.get("usage", {})
                tokens_used = usage.get("total_tokens")

                logger.debug(
                    f"Doubao 响应: model={model}, tokens={tokens_used}, "
                    f"finish_reason={finish_reason}, "
                    f"has_reasoning={reasoning_content is not None}"
                )

                return ChatResponse(
                    content=content,
                    model=model,
                    tokens_used=tokens_used,
                    finish_reason=finish_reason,
                    reasoning_content=reasoning_content,
                    tool_calls=tool_calls,
                )

        except httpx.TimeoutException as e:
            logger.error(f"Doubao API 超时: {e}")
            raise AIClientError("API 请求超时，请重试") from e
        except httpx.RequestError as e:
            logger.error(f"Doubao API 请求错误: {e}")
            raise AIClientError(f"API 请求失败: {e}") from e

    async def chat_stream(
        self,
        messages: list[ChatMessage],
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        **kwargs: Any,
    ) -> AsyncGenerator[StreamChunk, None]:
        """流式聊天

        Args:
            messages: 消息列表
            model: 模型名称 (endpoint_id)
            temperature: 温度参数
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

        logger.debug(f"Doubao 流式请求: model={model}")

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
                            error_msg = (
                                error_text.decode() if error_text else "未知错误"
                            )
                            error_code = "unknown"
                        logger.error(
                            f"Doubao 流式 API 错误: {error_msg} (code={error_code})"
                        )
                        raise AIClientError(error_msg, error_code)

                    async for line in response.aiter_lines():
                        line = line.strip()
                        if not line:
                            continue

                        if line.startswith("data: "):
                            data_str = line[6:]

                            if data_str == "[DONE]":
                                logger.debug("Doubao 流式响应完成")
                                break

                            try:
                                data = json.loads(data_str)
                                choice = data.get("choices", [{}])[0]
                                delta = choice.get("delta", {})
                                finish_reason = choice.get("finish_reason")

                                content = delta.get("content", "")
                                reasoning_content = delta.get("reasoning_content")
                                
                                usage = data.get("usage")
                                tokens_used = (
                                    usage.get("total_tokens") if usage else None
                                )

                                if content or reasoning_content or finish_reason:
                                    yield StreamChunk(
                                        content=content or "",
                                        finish_reason=finish_reason,
                                        reasoning_content=reasoning_content,
                                        tokens_used=tokens_used,
                                        model=model,
                                    )

                            except json.JSONDecodeError as e:
                                logger.warning(
                                    f"Doubao 流式响应解析失败: {e}, line={line}"
                                )
                                continue

        except httpx.TimeoutException as e:
            logger.error(f"Doubao 流式 API 超时: {e}")
            raise AIClientError("API 请求超时，请重试") from e
        except httpx.RequestError as e:
            logger.error(f"Doubao 流式 API 请求错误: {e}")
            raise AIClientError(f"API 请求失败: {e}") from e
