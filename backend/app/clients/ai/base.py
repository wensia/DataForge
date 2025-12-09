"""AI 客户端基类定义"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


class AIClientError(Exception):
    """AI 客户端异常"""

    def __init__(self, message: str, code: str | None = None):
        self.message = message
        self.code = code
        super().__init__(message)


@dataclass
class ChatMessage:
    """聊天消息"""

    role: str  # system / user / assistant
    content: str

    def to_dict(self) -> dict[str, str]:
        return {"role": self.role, "content": self.content}


@dataclass
class ChatResponse:
    """聊天响应"""

    content: str
    model: str
    tokens_used: int | None = None
    finish_reason: str | None = None


class AIClient(ABC):
    """AI 客户端抽象基类

    所有 AI 服务客户端都应继承此类并实现相关方法。
    """

    def __init__(self, api_key: str, base_url: str | None = None):
        """初始化 AI 客户端

        Args:
            api_key: API 密钥
            base_url: API 基础地址（可选）
        """
        self.api_key = api_key
        self.base_url = base_url

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """返回提供商名称"""
        pass

    @property
    @abstractmethod
    def default_model(self) -> str:
        """返回默认模型名称"""
        pass

    @abstractmethod
    async def chat(
        self,
        messages: list[ChatMessage],
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        **kwargs: Any,
    ) -> ChatResponse:
        """发送聊天请求

        Args:
            messages: 消息列表
            model: 模型名称（可选，使用默认模型）
            temperature: 温度参数
            max_tokens: 最大生成 token 数
            **kwargs: 其他参数

        Returns:
            ChatResponse: 聊天响应
        """
        pass

    async def analyze(
        self,
        data: str,
        prompt: str,
        system_prompt: str | None = None,
        **kwargs: Any,
    ) -> ChatResponse:
        """分析数据

        Args:
            data: 要分析的数据（文本格式）
            prompt: 分析指令
            system_prompt: 系统提示（可选）
            **kwargs: 其他参数

        Returns:
            ChatResponse: 分析结果
        """
        messages = []

        if system_prompt:
            messages.append(ChatMessage(role="system", content=system_prompt))

        # 将数据和提示组合
        user_content = f"以下是需要分析的数据：\n\n{data}\n\n{prompt}"
        messages.append(ChatMessage(role="user", content=user_content))

        return await self.chat(messages, **kwargs)

    async def summarize(
        self,
        data: str,
        focus: str | None = None,
        **kwargs: Any,
    ) -> ChatResponse:
        """生成数据摘要

        Args:
            data: 要总结的数据
            focus: 关注点（可选）
            **kwargs: 其他参数

        Returns:
            ChatResponse: 摘要结果
        """
        system_prompt = """你是一个专业的数据分析师。请对用户提供的数据进行分析，并生成简洁、准确的摘要。
摘要应包括：
1. 数据概述（数量、时间范围等）
2. 关键指标和统计
3. 主要发现和趋势
4. 值得关注的异常或问题"""

        prompt = "请对以上数据生成摘要报告。"
        if focus:
            prompt += f"\n\n请特别关注：{focus}"

        return await self.analyze(data, prompt, system_prompt=system_prompt, **kwargs)

    async def detect_anomalies(
        self,
        data: str,
        threshold: str | None = None,
        **kwargs: Any,
    ) -> ChatResponse:
        """检测数据异常

        Args:
            data: 要检测的数据
            threshold: 异常阈值说明（可选）
            **kwargs: 其他参数

        Returns:
            ChatResponse: 异常检测结果
        """
        system_prompt = """你是一个数据异常检测专家。请分析用户提供的数据，识别其中的异常情况。
异常可能包括：
1. 数值异常（极端值、突变）
2. 模式异常（与正常模式不符）
3. 时间异常（不正常的时间分布）
4. 关联异常（数据之间的不一致）

请列出发现的每个异常，并说明其可能的原因和影响。"""

        prompt = "请检测以上数据中的异常情况。"
        if threshold:
            prompt += f"\n\n异常判断标准：{threshold}"

        return await self.analyze(data, prompt, system_prompt=system_prompt, **kwargs)

    async def answer_question(
        self,
        data: str,
        question: str,
        history: list[ChatMessage] | None = None,
        **kwargs: Any,
    ) -> ChatResponse:
        """基于数据回答问题

        Args:
            data: 参考数据
            question: 用户问题
            history: 对话历史（可选）
            **kwargs: 其他参数

        Returns:
            ChatResponse: 回答
        """
        system_prompt = """你是一个智能数据分析助手。用户会提供一些数据，并询问相关问题。
请基于提供的数据准确回答问题。如果数据中没有相关信息，请如实说明。
回答应该简洁、准确、有帮助。"""

        messages = [ChatMessage(role="system", content=system_prompt)]

        # 添加数据上下文
        messages.append(
            ChatMessage(
                role="user",
                content=f"以下是参考数据：\n\n{data}\n\n请基于这些数据回答我的问题。",
            )
        )
        messages.append(
            ChatMessage(role="assistant", content="好的，我已经了解这些数据。请问您想了解什么？")
        )

        # 添加历史对话
        if history:
            messages.extend(history)

        # 添加当前问题
        messages.append(ChatMessage(role="user", content=question))

        return await self.chat(messages, **kwargs)
