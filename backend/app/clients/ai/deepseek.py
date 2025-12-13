"""DeepSeek AI 客户端

文档: https://platform.deepseek.com/api-docs
      https://api-docs.deepseek.com/zh-cn/guides/function_calling
      https://api-docs.deepseek.com/zh-cn/guides/reasoning_model
"""

from typing import Any

import httpx
from loguru import logger

from app.clients.ai.base import (
    AIClient,
    AIClientError,
    ChatMessage,
    ChatResponse,
    ToolCall,
)

# DeepSeek API 配置
DEEPSEEK_API_BASE = "https://api.deepseek.com/v1"


class DeepSeekClient(AIClient):
    """DeepSeek AI 客户端

    性价比高，推理能力强。

    模型列表:
        - deepseek-chat: 通用对话模型，支持 Function Calling
        - deepseek-coder: 代码生成模型
        - deepseek-reasoner: 推理模型，支持思考模式 (reasoning_content)

    功能:
        - chat(): 标准对话
        - chat_with_tools(): 带工具调用的对话 (Function Calling)
        - chat_with_thinking(): 思考模式对话
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
                message = choice.get("message", {})
                content = message.get("content", "") or ""
                finish_reason = choice.get("finish_reason")

                # 解析思考内容 (reasoning_content)
                reasoning_content = message.get("reasoning_content")

                # 解析工具调用 (tool_calls)
                tool_calls_data = message.get("tool_calls")
                tool_calls = None
                if tool_calls_data:
                    tool_calls = [ToolCall.from_dict(tc) for tc in tool_calls_data]

                usage = result.get("usage", {})
                tokens_used = usage.get("total_tokens")

                logger.debug(
                    f"DeepSeek 响应: model={model}, tokens={tokens_used}, "
                    f"finish_reason={finish_reason}, "
                    f"has_reasoning={reasoning_content is not None}, "
                    f"tool_calls={len(tool_calls) if tool_calls else 0}"
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

    async def chat_with_tools(
        self,
        messages: list[ChatMessage],
        tools: list[dict[str, Any]],
        tool_choice: str = "auto",
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        **kwargs: Any,
    ) -> ChatResponse:
        """带工具调用的聊天 (Function Calling)

        文档: https://api-docs.deepseek.com/zh-cn/guides/function_calling

        Args:
            messages: 消息列表
            tools: 工具定义列表，格式:
                [{"type": "function", "function": {"name": "...", "description": "...", "parameters": {...}}}]
            tool_choice: 工具选择策略 ("auto" | "none" | {"type": "function", "function": {"name": "..."}})
            model: 模型名称 (默认 deepseek-chat)
            temperature: 温度参数
            max_tokens: 最大生成 token 数
            **kwargs: 其他参数

        Returns:
            ChatResponse: 包含 tool_calls 的响应

        Note:
            - 最多支持 128 个工具定义
            - 当 finish_reason="tool_calls" 时，需要执行工具并将结果发回
        """
        model = model or self.default_model

        # 构建请求体
        body: dict[str, Any] = {
            "model": model,
            "messages": [msg.to_dict() for msg in messages],
            "temperature": temperature,
            "tools": tools,
            "tool_choice": tool_choice,
        }

        if max_tokens:
            body["max_tokens"] = max_tokens

        # 合并其他参数
        body.update(kwargs)

        logger.debug(
            f"DeepSeek Function Calling 请求: tools={[t['function']['name'] for t in tools]}"
        )

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
                message = choice.get("message", {})
                content = message.get("content", "") or ""
                finish_reason = choice.get("finish_reason")

                # 解析工具调用
                tool_calls_data = message.get("tool_calls")
                tool_calls = None
                if tool_calls_data:
                    tool_calls = [ToolCall.from_dict(tc) for tc in tool_calls_data]

                usage = result.get("usage", {})
                tokens_used = usage.get("total_tokens")

                logger.debug(
                    f"DeepSeek Function Calling 响应: "
                    f"finish_reason={finish_reason}, "
                    f"tool_calls={[tc.function.name for tc in tool_calls] if tool_calls else []}"
                )

                return ChatResponse(
                    content=content,
                    model=model,
                    tokens_used=tokens_used,
                    finish_reason=finish_reason,
                    tool_calls=tool_calls,
                )

        except httpx.TimeoutException as e:
            logger.error(f"DeepSeek API 超时: {e}")
            raise AIClientError("API 请求超时，请重试") from e
        except httpx.RequestError as e:
            logger.error(f"DeepSeek API 请求错误: {e}")
            raise AIClientError(f"API 请求失败: {e}") from e

    async def chat_with_thinking(
        self,
        messages: list[ChatMessage],
        model: str = "deepseek-reasoner",
        max_tokens: int | None = None,
        **kwargs: Any,
    ) -> ChatResponse:
        """使用思考模式的聊天

        文档: https://api-docs.deepseek.com/zh-cn/guides/reasoning_model

        Args:
            messages: 消息列表
            model: 模型名称 (默认 deepseek-reasoner)
            max_tokens: 最大生成 token 数
            **kwargs: 其他参数

        Returns:
            ChatResponse: 包含 reasoning_content 的响应

        Note:
            - 思考模式不支持 temperature, top_p 等采样参数
            - reasoning_content 包含思维链过程
            - content 包含最终答案
        """
        # 思考模式不支持采样参数
        kwargs.pop("temperature", None)
        kwargs.pop("top_p", None)
        kwargs.pop("presence_penalty", None)
        kwargs.pop("frequency_penalty", None)

        # 构建请求体
        body: dict[str, Any] = {
            "model": model,
            "messages": [msg.to_dict() for msg in messages],
        }

        if max_tokens:
            body["max_tokens"] = max_tokens

        # 合并其他参数
        body.update(kwargs)

        logger.debug(f"DeepSeek 思考模式请求: model={model}")

        try:
            async with httpx.AsyncClient(
                timeout=300.0
            ) as client:  # 思考模式可能需要更长时间
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
                message = choice.get("message", {})
                content = message.get("content", "") or ""
                finish_reason = choice.get("finish_reason")

                # 解析思考内容
                reasoning_content = message.get("reasoning_content")

                usage = result.get("usage", {})
                tokens_used = usage.get("total_tokens")

                logger.debug(
                    f"DeepSeek 思考模式响应: "
                    f"tokens={tokens_used}, "
                    f"reasoning_length={len(reasoning_content) if reasoning_content else 0}"
                )

                return ChatResponse(
                    content=content,
                    model=model,
                    tokens_used=tokens_used,
                    finish_reason=finish_reason,
                    reasoning_content=reasoning_content,
                )

        except httpx.TimeoutException as e:
            logger.error(f"DeepSeek API 超时: {e}")
            raise AIClientError("API 请求超时，请重试") from e
        except httpx.RequestError as e:
            logger.error(f"DeepSeek API 请求错误: {e}")
            raise AIClientError(f"API 请求失败: {e}") from e
