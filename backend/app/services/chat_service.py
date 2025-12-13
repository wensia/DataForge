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
)
from app.services.ai_analysis_service import AIAnalysisError, _resolve_ai_client
from app.services.chat_tools import CHAT_TOOLS, execute_tool


class ChatServiceError(Exception):
    """对话服务异常"""

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


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
        use_tools = enable_tools and isinstance(client, DeepSeekClient)

        # 添加系统提示（如果启用工具或是数据分析对话）
        if use_tools or conversation.conversation_type == ConversationType.ANALYSIS:
            system_prompt = """你是一个专业的数据分析助手。你可以使用提供的工具来查询通话记录数据。
当用户询问与通话数据相关的问题时，请使用工具获取数据，然后基于数据给出分析和回答。
如果需要知道当前日期（例如计算"最近一周"），请先调用 get_current_date 工具。
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

            final_content = response.content
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
        created_at=now,
        updated_at=now,
    )
    session.add(user_message)
    session.flush()  # 获取 ID

    # 发送开始事件
    yield {"type": "start", "user_message_id": user_message.id}

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
        use_tools = enable_tools and isinstance(client, DeepSeekClient)

        # 添加系统提示（如果启用工具或是数据分析对话）
        if use_tools or conversation.conversation_type == ConversationType.ANALYSIS:
            system_prompt = """你是一个专业的数据分析助手。你可以使用提供的工具来查询通话记录数据。
当用户询问与通话数据相关的问题时，请使用工具获取数据，然后基于数据给出分析和回答。
如果需要知道当前日期（例如计算"最近一周"），请先调用 get_current_date 工具。
请用中文回答问题，并以清晰、结构化的方式呈现数据分析结果。"""
            chat_history.insert(0, AIChatMessage(role="system", content=system_prompt))

        # 检查客户端是否支持流式输出
        if not hasattr(client, "chat_stream"):
            yield {"type": "error", "error": "当前 AI 服务不支持流式输出"}
            return

        # 收集完整内容
        full_content = ""
        total_tokens = 0

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
            # 如果最后的 response 没有工具调用，使用流式输出最终内容
            if not response.tool_calls:
                # 使用非流式结果（已经有了）
                full_content = response.content
                # 流式发送内容（分块发送以模拟流式效果）
                chunk_size = 20
                for i in range(0, len(full_content), chunk_size):
                    chunk = full_content[i : i + chunk_size]
                    yield {"type": "content", "content": chunk}
        else:
            # 普通流式对话（不使用工具）
            # 检查是否启用深度思考模式 (仅 DeepSeek 支持)
            is_deep_thinking = use_deep_thinking and isinstance(client, DeepSeekClient)
            stream_model = "deepseek-reasoner" if is_deep_thinking else model

            logger.info(
                f"开始流式对话: conversation_id={conversation_id}, "
                f"provider={provider_id}, deep_thinking={is_deep_thinking}"
            )

            full_reasoning = ""  # 收集完整思考过程

            async for chunk in client.chat_stream(chat_history, model=stream_model):
                # 处理思考内容 (reasoning_content)
                if chunk.reasoning_content:
                    full_reasoning += chunk.reasoning_content
                    yield {"type": "reasoning", "reasoning": chunk.reasoning_content}

                # 处理正式内容
                if chunk.content:
                    full_content += chunk.content
                    yield {"type": "content", "content": chunk.content}

                if chunk.tokens_used:
                    total_tokens = chunk.tokens_used

                if chunk.finish_reason:
                    logger.debug(f"流式响应完成: finish_reason={chunk.finish_reason}")

        # 保存 AI 回复
        assistant_message = Message(
            conversation_id=conversation_id,
            role=MessageRole.ASSISTANT,
            content=full_content,
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
        session.rollback()
        logger.error(f"流式对话 AI 错误: {e.message}")
        yield {"type": "error", "error": f"AI 服务错误: {e.message}"}
