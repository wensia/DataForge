"""对话服务

提供 AI 对话功能，支持多轮会话和历史记录管理。
支持 Function Calling 让 AI 自主查询数据库。
"""

from collections.abc import AsyncGenerator
from datetime import datetime
from typing import Any

from loguru import logger
from sqlalchemy import func
from sqlmodel import Session, select

from app.clients.ai import AIClientError
from app.clients.ai import ChatMessage as AIChatMessage
from app.clients.ai.deepseek import DeepSeekClient
from app.models.conversation import (
    Conversation,
    ConversationCreate,
    ConversationType,
    ConversationUpdate,
    Message,
    MessageRole,
    MessageStatus,
)
from app.services.ai_analysis_service import AIAnalysisError, _resolve_ai_client
from app.services.chat_tools import CHAT_TOOLS, execute_tool


class ChatServiceError(Exception):
    """对话服务异常"""

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


# 增量保存配置
SAVE_INTERVAL_SECONDS = 2.0  # 每 2 秒保存一次
SAVE_CHUNK_SIZE = 500  # 或每 500 字符保存一次


def _update_streaming_message(
    session: Session,
    message: Message,
    content: str,
    reasoning_content: str | None = None,
    tokens_used: int | None = None,
    status: str | None = None,
) -> None:
    """更新流式消息内容

    Args:
        session: 数据库会话
        message: 消息对象
        content: 当前累积的完整内容
        reasoning_content: 思考过程内容
        tokens_used: token 消耗
        status: 消息状态
    """
    message.content = content
    message.updated_at = datetime.now()
    if reasoning_content is not None:
        message.reasoning_content = reasoning_content
    if tokens_used is not None:
        message.tokens_used = tokens_used
    if status is not None:
        message.status = status
    session.add(message)
    session.commit()


def create_conversation(
    session: Session,
    user_id: int,
    data: ConversationCreate,
) -> Conversation:
    """创建对话

    Args:
        session: 数据库会话
        user_id: 用户 ID
        data: 创建数据

    Returns:
        Conversation: 创建的对话
    """
    now = datetime.now()
    title = data.title or f"新对话 {now.strftime('%m-%d %H:%M')}"

    conversation = Conversation(
        user_id=user_id,
        title=title,
        ai_provider=data.ai_provider,
        conversation_type=data.conversation_type,
        created_at=now,
        updated_at=now,
    )

    session.add(conversation)
    session.commit()
    session.refresh(conversation)

    logger.info(f"创建对话: id={conversation.id}, user_id={user_id}")
    return conversation


def get_conversations(
    session: Session,
    user_id: int,
    conversation_type: str | None = None,
    include_archived: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[Conversation], int]:
    """获取用户对话列表

    Args:
        session: 数据库会话
        user_id: 用户 ID
        conversation_type: 对话类型筛选
        include_archived: 是否包含归档
        limit: 返回数量
        offset: 偏移量

    Returns:
        tuple: (对话列表, 总数)
    """
    query = select(Conversation).where(Conversation.user_id == user_id)

    if conversation_type:
        query = query.where(Conversation.conversation_type == conversation_type)

    if not include_archived:
        query = query.where(Conversation.is_archived == False)  # noqa: E712

    # 获取总数
    count_query = select(func.count()).select_from(query.subquery())
    total = session.exec(count_query).one()

    # 分页和排序（最新的在前）
    query = query.order_by(Conversation.updated_at.desc())
    query = query.offset(offset).limit(limit)

    conversations = session.exec(query).all()
    return list(conversations), total


def get_conversation(
    session: Session,
    conversation_id: int,
    user_id: int,
) -> Conversation | None:
    """获取单个对话

    Args:
        session: 数据库会话
        conversation_id: 对话 ID
        user_id: 用户 ID

    Returns:
        Conversation | None: 对话或 None
    """
    query = select(Conversation).where(
        Conversation.id == conversation_id,
        Conversation.user_id == user_id,
    )
    return session.exec(query).first()


def get_conversation_messages(
    session: Session,
    conversation_id: int,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[Message], int]:
    """获取对话消息

    Args:
        session: 数据库会话
        conversation_id: 对话 ID
        limit: 返回数量
        offset: 偏移量

    Returns:
        tuple: (消息列表, 总数)
    """
    query = select(Message).where(Message.conversation_id == conversation_id)

    # 获取总数
    count_query = select(func.count()).select_from(query.subquery())
    total = session.exec(count_query).one()

    # 分页和排序（按时间正序，方便显示）
    query = query.order_by(Message.created_at.asc())
    query = query.offset(offset).limit(limit)

    messages = session.exec(query).all()
    return list(messages), total


def update_conversation(
    session: Session,
    conversation_id: int,
    user_id: int,
    data: ConversationUpdate,
) -> Conversation | None:
    """更新对话

    Args:
        session: 数据库会话
        conversation_id: 对话 ID
        user_id: 用户 ID
        data: 更新数据

    Returns:
        Conversation | None: 更新后的对话或 None
    """
    conversation = get_conversation(session, conversation_id, user_id)
    if not conversation:
        return None

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(conversation, key, value)

    conversation.updated_at = datetime.now()

    session.add(conversation)
    session.commit()
    session.refresh(conversation)

    logger.info(f"更新对话: id={conversation_id}")
    return conversation


def delete_conversation(
    session: Session,
    conversation_id: int,
    user_id: int,
) -> bool:
    """删除对话（同时删除所有消息）

    Args:
        session: 数据库会话
        conversation_id: 对话 ID
        user_id: 用户 ID

    Returns:
        bool: 是否删除成功
    """
    conversation = get_conversation(session, conversation_id, user_id)
    if not conversation:
        return False

    # 删除所有消息
    messages = session.exec(
        select(Message).where(Message.conversation_id == conversation_id)
    ).all()
    for msg in messages:
        session.delete(msg)

    # 删除对话
    session.delete(conversation)
    session.commit()

    logger.info(f"删除对话: id={conversation_id}, messages={len(messages)}")
    return True


async def send_message(
    session: Session,
    conversation_id: int,
    user_id: int,
    content: str,
    ai_provider: str | None = None,
    enable_tools: bool = True,
    use_deep_thinking: bool = True,
) -> tuple[Message, Message]:
    """发送消息并获取 AI 回复

    支持 Function Calling 和深度思考模式。

    Args:
        session: 数据库会话
        conversation_id: 对话 ID
        user_id: 用户 ID
        content: 用户消息内容
        ai_provider: 临时使用的 AI 提供商
        enable_tools: 是否启用工具调用 (Function Calling)
        use_deep_thinking: 是否启用深度思考模式 (DeepSeek Reasoner)

    Returns:
        tuple[Message, Message]: (用户消息, AI 回复消息)

    Raises:
        ChatServiceError: 对话不存在或 AI 服务错误
    """
    # 获取对话
    conversation = get_conversation(session, conversation_id, user_id)
    if not conversation:
        raise ChatServiceError("对话不存在")

    now = datetime.now()

    # 保存用户消息
    user_message = Message(
        conversation_id=conversation_id,
        role=MessageRole.USER,
        content=content,
        created_at=now,
        updated_at=now,
    )
    session.add(user_message)
    session.flush()  # 获取 ID

    try:
        # 获取历史消息作为上下文
        history_messages, _ = get_conversation_messages(
            session, conversation_id, limit=20
        )

        # 构建消息历史（不包括刚添加的用户消息）
        chat_history: list[AIChatMessage] = [
            AIChatMessage(role=msg.role, content=msg.content)
            for msg in history_messages
            if msg.id != user_message.id
        ]

        # 添加当前用户消息
        chat_history.append(AIChatMessage(role="user", content=content))

        # 获取 AI 客户端
        provider = ai_provider or conversation.ai_provider
        provider_id, client, model = _resolve_ai_client(session, provider)

        # 检查是否支持 Function Calling (目前只有 DeepSeek 支持)
        # 注意: deepseek-reasoner 模型不支持工具调用，深度思考时禁用工具
        use_tools = enable_tools and isinstance(client, DeepSeekClient) and not use_deep_thinking

        if enable_tools and use_deep_thinking:
            logger.info("深度思考模式与工具调用不兼容，已禁用工具调用")

        # 添加系统提示（如果启用工具或是数据分析对话）
        if use_tools or conversation.conversation_type == ConversationType.ANALYSIS:
            system_prompt = """你是一个专业的数据分析助手。你可以使用提供的工具来查询通话记录数据。

## 可用工具
- query_by_callee: 按被叫号码（客户手机号）查询通话统计。当用户提供手机号列表时优先使用此工具。
- get_call_transcripts: 获取通话转录文稿内容。用于分析对话内容、关键话题。需要分析通话内容时使用。
- query_call_records: 查询通话记录详情，支持按被叫号码(callee)、员工、部门等筛选。
- get_call_statistics: 获取通话统计，可按天/员工/部门/校区分组。
- get_call_ranking: 获取员工通话排行榜。
- get_staff_list: 获取员工列表。
- get_current_date: 获取当前日期，用于计算相对日期。

## 重要说明
- 被叫手机号存储在 callee 字段（不是 customer_name）
- 当用户提供手机号列表时，使用 query_by_callee 工具
- 当用户需要分析通话内容/对话/话术时，使用 get_call_transcripts 工具
- 有效通话定义：通话时长 >= 60 秒

## 输出格式要求
- 使用 Markdown 格式输出
- 使用标题（##、###）组织内容层级
- 使用列表（-、1.）展示要点
- 使用表格展示数据对比
- 使用代码块展示数字或ID
- 重要信息使用**加粗**标记

请用中文回答问题，并以清晰、结构化的方式呈现数据分析结果。"""
            chat_history.insert(0, AIChatMessage(role="system", content=system_prompt))
        total_tokens = 0
        final_content = ""

        if use_tools:
            # 使用 Function Calling
            response = await client.chat_with_tools(
                chat_history,
                tools=CHAT_TOOLS,
                model=model,
            )
            total_tokens += response.tokens_used or 0

            # 处理工具调用循环（最多 5 轮）
            max_iterations = 5
            iteration = 0

            while response.tool_calls and iteration < max_iterations:
                iteration += 1
                logger.info(
                    f"工具调用第 {iteration} 轮: {[tc.function.name for tc in response.tool_calls]}"
                )

                # 添加 AI 的工具调用请求到历史
                chat_history.append(
                    AIChatMessage(
                        role="assistant",
                        content=response.content,
                        tool_calls=response.tool_calls,
                    )
                )

                # 执行每个工具调用
                for tool_call in response.tool_calls:
                    tool_result = await execute_tool(
                        session,
                        tool_call.function.name,
                        tool_call.function.arguments,
                    )

                    # 添加工具结果到历史
                    chat_history.append(
                        AIChatMessage(
                            role="tool",
                            content=tool_result,
                            tool_call_id=tool_call.id,
                        )
                    )

                # 继续对话，获取 AI 的下一步响应
                response = await client.chat_with_tools(
                    chat_history,
                    tools=CHAT_TOOLS,
                    model=model,
                )
                total_tokens += response.tokens_used or 0

            final_content = response.content or ""

            # 如果 content 为空，添加引导提示后重新获取最终答案
            # DeepSeek 在多轮工具调用后可能不生成最终文本回复
            if not final_content:
                logger.info("工具调用后 content 为空，添加引导提示后重新获取回复")

                # 添加引导提示，明确告诉模型需要根据工具结果生成回复
                chat_history.append(
                    AIChatMessage(
                        role="user",
                        content="请根据以上工具执行结果，用中文总结回答我最初的问题。使用 Markdown 格式输出。"
                    )
                )

                response = await client.chat(chat_history, model=model)
                total_tokens += response.tokens_used or 0
                final_content = response.content or ""

        elif use_deep_thinking and isinstance(client, DeepSeekClient):
            # 深度思考模式 (DeepSeek Reasoner)
            logger.info("使用深度思考模式")
            response = await client.chat_with_thinking(chat_history)
            total_tokens = response.tokens_used or 0
            final_content = response.content
            # 如果有思考过程，可以记录到日志
            if response.reasoning_content:
                logger.debug(f"思考过程: {response.reasoning_content[:200]}...")
        else:
            # 普通对话
            response = await client.chat(chat_history, model=model)
            total_tokens = response.tokens_used or 0
            final_content = response.content

        # 保存 AI 回复
        assistant_message = Message(
            conversation_id=conversation_id,
            role=MessageRole.ASSISTANT,
            content=final_content,
            tokens_used=total_tokens,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        session.add(assistant_message)

        # 更新对话时间和 provider
        conversation.updated_at = datetime.now()
        if ai_provider:
            conversation.ai_provider = provider_id
        session.add(conversation)

        # 如果是第一条消息，自动生成标题
        if len(history_messages) == 0:
            # 使用用户消息的前 50 个字符作为标题
            auto_title = content[:50] + ("..." if len(content) > 50 else "")
            conversation.title = auto_title
            session.add(conversation)

        session.commit()
        session.refresh(user_message)
        session.refresh(assistant_message)

        logger.info(
            f"对话消息: conversation_id={conversation_id}, "
            f"provider={provider_id}, tokens={total_tokens}, "
            f"tools_enabled={use_tools}"
        )

        return user_message, assistant_message

    except AIAnalysisError as e:
        session.rollback()
        raise ChatServiceError(e.message) from e
    except AIClientError as e:
        session.rollback()
        raise ChatServiceError(f"AI 服务错误: {e.message}") from e


def get_available_providers(session: Session) -> list[dict]:
    """获取可用的 AI 提供商列表

    Args:
        session: 数据库会话

    Returns:
        list[dict]: 提供商列表
    """
    from app.models.ai_config import AIConfig

    # 从数据库获取启用的配置
    configs = session.exec(
        select(AIConfig)
        .where(AIConfig.is_active == True)  # noqa: E712
        .order_by(AIConfig.provider)
    ).all()

    providers = []
    seen = set()

    for cfg in configs:
        if cfg.provider not in seen:
            providers.append(
                {
                    "id": cfg.provider,
                    "name": cfg.name or cfg.provider.upper(),
                    "default_model": cfg.default_model,
                }
            )
            seen.add(cfg.provider)

    return providers


async def send_message_stream(
    session: Session,
    conversation_id: int,
    user_id: int,
    content: str,
    ai_provider: str | None = None,
    enable_tools: bool = True,
    use_deep_thinking: bool = False,
) -> AsyncGenerator[dict[str, Any], None]:
    """流式发送消息并获取 AI 回复

    支持 Function Calling 和深度思考模式。

    Args:
        session: 数据库会话
        conversation_id: 对话 ID
        user_id: 用户 ID
        content: 用户消息内容
        ai_provider: 临时使用的 AI 提供商
        enable_tools: 是否启用工具调用 (Function Calling)
        use_deep_thinking: 是否启用深度思考模式 (DeepSeek Reasoner)

    Yields:
        dict: SSE 事件数据
            - type: "start" | "tool_start" | "tool_result" | "reasoning" | "content" | "done" | "error"
            - content: 增量内容 (content 类型)
            - reasoning: 思考过程内容 (reasoning 类型)
            - user_message_id: 用户消息 ID (start 类型)
            - tool_name: 工具名称 (tool_start 类型)
            - tool_result: 工具执行结果摘要 (tool_result 类型)
            - assistant_message_id: AI 消息 ID (done 类型)
            - tokens_used: token 消耗 (done 类型)
            - error: 错误信息 (error 类型)

    Raises:
        ChatServiceError: 对话不存在或 AI 服务错误
    """
    # 获取对话
    conversation = get_conversation(session, conversation_id, user_id)
    if not conversation:
        yield {"type": "error", "error": "对话不存在"}
        return

    now = datetime.now()

    # 保存用户消息
    user_message = Message(
        conversation_id=conversation_id,
        role=MessageRole.USER,
        content=content,
        status=MessageStatus.COMPLETED,
        created_at=now,
        updated_at=now,
    )
    session.add(user_message)
    session.flush()  # 获取 ID

    # 立即创建 AI 消息（空内容，streaming 状态）
    assistant_message = Message(
        conversation_id=conversation_id,
        role=MessageRole.ASSISTANT,
        content="",
        status=MessageStatus.STREAMING,
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    session.add(assistant_message)
    session.commit()
    session.refresh(user_message)
    session.refresh(assistant_message)

    # 发送开始事件（包含 AI 消息 ID）
    yield {
        "type": "start",
        "user_message_id": user_message.id,
        "assistant_message_id": assistant_message.id,
    }

    try:
        # 获取历史消息作为上下文
        history_messages, _ = get_conversation_messages(
            session, conversation_id, limit=20
        )

        # 构建消息历史（不包括刚添加的用户消息）
        chat_history: list[AIChatMessage] = [
            AIChatMessage(role=msg.role, content=msg.content)
            for msg in history_messages
            if msg.id != user_message.id
        ]

        # 添加当前用户消息
        chat_history.append(AIChatMessage(role="user", content=content))

        # 获取 AI 客户端
        provider = ai_provider or conversation.ai_provider
        provider_id, client, model = _resolve_ai_client(session, provider)

        # 检查是否支持 Function Calling (目前只有 DeepSeek 支持)
        # 注意: deepseek-reasoner 模型不支持工具调用，深度思考时禁用工具
        use_tools = enable_tools and isinstance(client, DeepSeekClient) and not use_deep_thinking

        if enable_tools and use_deep_thinking:
            logger.info("深度思考模式与工具调用不兼容，已禁用工具调用")

        # 添加系统提示（如果启用工具或是数据分析对话）
        if use_tools or conversation.conversation_type == ConversationType.ANALYSIS:
            system_prompt = """你是一个专业的数据分析助手。你可以使用提供的工具来查询通话记录数据。

## 可用工具
- query_by_callee: 按被叫号码（客户手机号）查询通话统计。当用户提供手机号列表时优先使用此工具。
- get_call_transcripts: 获取通话转录文稿内容。用于分析对话内容、关键话题。需要分析通话内容时使用。
- query_call_records: 查询通话记录详情，支持按被叫号码(callee)、员工、部门等筛选。
- get_call_statistics: 获取通话统计，可按天/员工/部门/校区分组。
- get_call_ranking: 获取员工通话排行榜。
- get_staff_list: 获取员工列表。
- get_current_date: 获取当前日期，用于计算相对日期。

## 重要说明
- 被叫手机号存储在 callee 字段（不是 customer_name）
- 当用户提供手机号列表时，使用 query_by_callee 工具
- 当用户需要分析通话内容/对话/话术时，使用 get_call_transcripts 工具
- 有效通话定义：通话时长 >= 60 秒

## 输出格式要求
- 使用 Markdown 格式输出
- 使用标题（##、###）组织内容层级
- 使用列表（-、1.）展示要点
- 使用表格展示数据对比
- 使用代码块展示数字或ID
- 重要信息使用**加粗**标记

请用中文回答问题，并以清晰、结构化的方式呈现数据分析结果。"""
            chat_history.insert(0, AIChatMessage(role="system", content=system_prompt))

        # 检查客户端是否支持流式输出
        if not hasattr(client, "chat_stream"):
            yield {"type": "error", "error": "当前 AI 服务不支持流式输出"}
            return

        # 收集完整内容
        full_content = ""
        full_reasoning = ""  # 收集完整思考过程
        total_tokens = 0

        # 增量保存状态追踪
        import time

        last_save_time = time.time()
        last_save_length = 0

        def maybe_save_progress() -> None:
            """检查是否需要保存进度"""
            nonlocal last_save_time, last_save_length
            current_time = time.time()
            content_delta = len(full_content) - last_save_length

            # 满足任一条件时保存：时间间隔或内容增量
            should_save = (
                current_time - last_save_time >= SAVE_INTERVAL_SECONDS
                or content_delta >= SAVE_CHUNK_SIZE
            )

            if should_save and full_content:
                _update_streaming_message(
                    session=session,
                    message=assistant_message,
                    content=full_content,
                    reasoning_content=full_reasoning if full_reasoning else None,
                )
                last_save_time = current_time
                last_save_length = len(full_content)
                logger.debug(
                    f"增量保存消息: message_id={assistant_message.id}, "
                    f"length={len(full_content)}"
                )

        # 如果启用工具，先处理工具调用（非流式）
        if use_tools:
            logger.info(
                f"开始流式对话(带工具): conversation_id={conversation_id}, "
                f"provider={provider_id}"
            )

            # 使用 Function Calling
            response = await client.chat_with_tools(
                chat_history,
                tools=CHAT_TOOLS,
                model=model,
            )
            total_tokens += response.tokens_used or 0

            # 处理工具调用循环（最多 5 轮）
            max_iterations = 5
            iteration = 0

            while response.tool_calls and iteration < max_iterations:
                iteration += 1
                logger.info(
                    f"工具调用第 {iteration} 轮: {[tc.function.name for tc in response.tool_calls]}"
                )

                # 添加 AI 的工具调用请求到历史
                chat_history.append(
                    AIChatMessage(
                        role="assistant",
                        content=response.content,
                        tool_calls=response.tool_calls,
                    )
                )

                # 执行每个工具调用
                for tool_call in response.tool_calls:
                    # 发送工具开始事件
                    yield {
                        "type": "tool_start",
                        "tool_name": tool_call.function.name,
                    }

                    tool_result = await execute_tool(
                        session,
                        tool_call.function.name,
                        tool_call.function.arguments,
                    )

                    # 添加工具结果到历史
                    chat_history.append(
                        AIChatMessage(
                            role="tool",
                            content=tool_result,
                            tool_call_id=tool_call.id,
                        )
                    )

                    # 发送工具结果事件（简化显示）
                    yield {
                        "type": "tool_result",
                        "tool_name": tool_call.function.name,
                        "success": True,
                    }

                # 继续对话，获取 AI 的下一步响应
                response = await client.chat_with_tools(
                    chat_history,
                    tools=CHAT_TOOLS,
                    model=model,
                )
                total_tokens += response.tokens_used or 0

            # 工具调用完成，最终结果流式输出
            # 使用 Function Calling 后，DeepSeek 可能出现两种异常情况：
            # 1) 在达到最大工具轮次后仍持续返回 tool_calls（循环未收敛）
            # 2) 工具调用结束但不生成最终文本回复（content 为空）
            # 这两种情况下都强制用普通对话生成最终答案，避免前端出现“生成结束但内容为空”。

            if response.tool_calls:
                logger.warning(
                    "工具调用达到最大轮次仍未收敛，强制生成最终回复: "
                    f"conversation_id={conversation_id}, tool_calls={[tc.function.name for tc in response.tool_calls]}"
                )

                # 明确告诉模型不要再调用工具，直接总结结果输出
                chat_history.append(
                    AIChatMessage(
                        role="user",
                        content=(
                            "请停止调用工具。请根据以上所有工具执行结果，用中文总结回答我最初的问题，"
                            "并使用 Markdown 格式输出。"
                        ),
                    )
                )

                async for chunk in client.chat_stream(chat_history, model=model):
                    if chunk.content:
                        full_content += chunk.content
                        yield {"type": "content", "content": chunk.content}
                        maybe_save_progress()
                    if chunk.tokens_used:
                        total_tokens += chunk.tokens_used
                    if chunk.finish_reason:
                        break
            else:
                full_content = response.content or ""

                # 如果 content 为空，添加引导提示后重新获取最终答案
                # DeepSeek 在多轮工具调用后可能不生成最终文本回复
                if not full_content:
                    logger.info("工具调用后 content 为空，添加引导提示后重新获取回复")

                    # 添加引导提示，明确告诉模型需要根据工具结果生成回复
                    chat_history.append(
                        AIChatMessage(
                            role="user",
                            content=(
                                "请根据以上工具执行结果，用中文总结回答我最初的问题。"
                                "使用 Markdown 格式输出。"
                            ),
                        )
                    )

                    # 使用不带工具的普通对话获取最终回复
                    async for chunk in client.chat_stream(chat_history, model=model):
                        if chunk.content:
                            full_content += chunk.content
                            yield {"type": "content", "content": chunk.content}
                            maybe_save_progress()
                        if chunk.tokens_used:
                            total_tokens += chunk.tokens_used
                        if chunk.finish_reason:
                            break
                else:
                    # 原有逻辑：分块发送以模拟流式效果
                    chunk_size = 20
                    for i in range(0, len(full_content), chunk_size):
                        chunk = full_content[i : i + chunk_size]
                        yield {"type": "content", "content": chunk}
                        maybe_save_progress()
        else:
            # 普通流式对话（不使用工具）
            # 检查是否启用深度思考模式 (仅 DeepSeek 支持)
            is_deep_thinking = use_deep_thinking and isinstance(client, DeepSeekClient)
            stream_model = "deepseek-reasoner" if is_deep_thinking else model

            logger.info(
                f"开始流式对话: conversation_id={conversation_id}, "
                f"provider={provider_id}, deep_thinking={is_deep_thinking}"
            )

            async for chunk in client.chat_stream(chat_history, model=stream_model):
                # 处理思考内容 (reasoning_content)
                if chunk.reasoning_content:
                    full_reasoning += chunk.reasoning_content
                    yield {"type": "reasoning", "reasoning": chunk.reasoning_content}

                # 处理正式内容
                if chunk.content:
                    full_content += chunk.content
                    yield {"type": "content", "content": chunk.content}
                    # 增量保存
                    maybe_save_progress()

                if chunk.tokens_used:
                    total_tokens = chunk.tokens_used

                if chunk.finish_reason:
                    logger.debug(f"流式响应完成: finish_reason={chunk.finish_reason}")

        if not full_content:
            logger.warning(
                "流式对话未生成可展示内容，写入兜底提示: "
                f"conversation_id={conversation_id}, provider={provider_id}"
            )
            full_content = (
                "未生成可展示的内容（可能是工具调用未返回最终回复）。"
                "请尝试缩小问题范围或重试。"
            )

        # 更新 AI 回复（完成状态）
        assistant_message.content = full_content
        assistant_message.reasoning_content = full_reasoning if full_reasoning else None
        assistant_message.tokens_used = total_tokens
        assistant_message.status = MessageStatus.COMPLETED
        assistant_message.updated_at = datetime.now()
        session.add(assistant_message)

        # 更新对话时间和 provider
        conversation.updated_at = datetime.now()
        if ai_provider:
            conversation.ai_provider = provider_id
        session.add(conversation)

        # 如果是第一条消息，自动生成标题
        if len(history_messages) == 0:
            auto_title = content[:50] + ("..." if len(content) > 50 else "")
            conversation.title = auto_title
            session.add(conversation)

        session.commit()
        session.refresh(assistant_message)

        logger.info(
            f"流式对话完成: conversation_id={conversation_id}, "
            f"provider={provider_id}, tokens={total_tokens}"
        )

        # 发送完成事件
        yield {
            "type": "done",
            "assistant_message_id": assistant_message.id,
            "tokens_used": total_tokens,
        }

    except AIClientError as e:
        # 标记消息为失败状态（保留已生成的内容）
        if full_content:
            assistant_message.content = full_content
            assistant_message.reasoning_content = (
                full_reasoning if full_reasoning else None
            )
        assistant_message.status = MessageStatus.FAILED
        assistant_message.updated_at = datetime.now()
        session.add(assistant_message)
        session.commit()
        logger.error(f"流式对话 AI 错误: {e.message}")
        yield {"type": "error", "error": f"AI 服务错误: {e.message}"}
    except Exception as e:
        # 捕获其他异常，保存当前进度
        if full_content:
            assistant_message.content = full_content
            assistant_message.reasoning_content = (
                full_reasoning if full_reasoning else None
            )
        assistant_message.status = MessageStatus.FAILED
        assistant_message.updated_at = datetime.now()
        session.add(assistant_message)
        session.commit()
        logger.error(f"流式对话异常: {str(e)}")
        yield {"type": "error", "error": f"服务异常: {str(e)}"}
