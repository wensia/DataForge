"""对话 API 路由

提供 AI 对话的创建、消息发送、历史记录等接口。
"""

import json

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from loguru import logger
from sqlmodel import Session

from app.database import get_session
from app.models.conversation import (
    ConversationCreate,
    ConversationResponse,
    ConversationUpdate,
    MessageResponse,
    SendMessageRequest,
    SendMessageResponse,
)
from app.schemas.response import ResponseModel
from app.services import chat_service
from app.services.chat_service import ChatServiceError
from app.utils.jwt_auth import TokenPayload, get_current_user

router = APIRouter(prefix="/chat", tags=["AI 对话"])


# ============ 对话管理接口 ============


@router.post("/conversations", response_model=ResponseModel)
async def create_conversation(
    data: ConversationCreate,
    current_user: TokenPayload = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ResponseModel:
    """创建新对话

    Args:
        data: 创建对话请求数据

    Returns:
        ResponseModel: 包含创建的对话信息
    """
    conversation = chat_service.create_conversation(
        session=session,
        user_id=current_user.user_id,
        data=data,
    )

    return ResponseModel(
        data=ConversationResponse.model_validate(conversation).model_dump()
    )


@router.get("/conversations", response_model=ResponseModel)
async def list_conversations(
    conversation_type: str | None = Query(None, description="对话类型筛选"),
    include_archived: bool = Query(False, description="是否包含归档对话"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: TokenPayload = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ResponseModel:
    """获取对话列表

    Args:
        conversation_type: 对话类型筛选 (general/analysis)
        include_archived: 是否包含归档对话
        page: 页码
        page_size: 每页数量

    Returns:
        ResponseModel: 包含对话列表和分页信息
    """
    offset = (page - 1) * page_size

    conversations, total = chat_service.get_conversations(
        session=session,
        user_id=current_user.user_id,
        conversation_type=conversation_type,
        include_archived=include_archived,
        limit=page_size,
        offset=offset,
    )

    return ResponseModel(
        data={
            "items": [
                ConversationResponse.model_validate(c).model_dump()
                for c in conversations
            ],
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": (total + page_size - 1) // page_size,
        }
    )


@router.get("/conversations/{conversation_id}", response_model=ResponseModel)
async def get_conversation(
    conversation_id: int,
    include_messages: bool = Query(True, description="是否包含消息列表"),
    current_user: TokenPayload = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ResponseModel:
    """获取对话详情

    Args:
        conversation_id: 对话 ID
        include_messages: 是否包含消息列表

    Returns:
        ResponseModel: 包含对话详情和消息列表
    """
    conversation = chat_service.get_conversation(
        session=session,
        conversation_id=conversation_id,
        user_id=current_user.user_id,
    )

    if not conversation:
        return ResponseModel.error(code=404, message="对话不存在")

    result = ConversationResponse.model_validate(conversation).model_dump()

    if include_messages:
        messages, _ = chat_service.get_conversation_messages(
            session=session,
            conversation_id=conversation_id,
            limit=100,
        )
        result["messages"] = [
            MessageResponse.model_validate(m).model_dump() for m in messages
        ]

    return ResponseModel(data=result)


@router.put("/conversations/{conversation_id}", response_model=ResponseModel)
async def update_conversation(
    conversation_id: int,
    data: ConversationUpdate,
    current_user: TokenPayload = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ResponseModel:
    """更新对话

    Args:
        conversation_id: 对话 ID
        data: 更新数据

    Returns:
        ResponseModel: 包含更新后的对话信息
    """
    conversation = chat_service.update_conversation(
        session=session,
        conversation_id=conversation_id,
        user_id=current_user.user_id,
        data=data,
    )

    if not conversation:
        return ResponseModel.error(code=404, message="对话不存在")

    return ResponseModel(
        data=ConversationResponse.model_validate(conversation).model_dump()
    )


@router.delete("/conversations/{conversation_id}", response_model=ResponseModel)
async def delete_conversation(
    conversation_id: int,
    current_user: TokenPayload = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ResponseModel:
    """删除对话

    Args:
        conversation_id: 对话 ID

    Returns:
        ResponseModel: 操作结果
    """
    success = chat_service.delete_conversation(
        session=session,
        conversation_id=conversation_id,
        user_id=current_user.user_id,
    )

    if not success:
        return ResponseModel.error(code=404, message="对话不存在")

    return ResponseModel(message="删除成功")


# ============ 消息接口 ============


@router.get("/conversations/{conversation_id}/messages", response_model=ResponseModel)
async def get_messages(
    conversation_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: TokenPayload = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ResponseModel:
    """获取对话消息列表

    Args:
        conversation_id: 对话 ID
        page: 页码
        page_size: 每页数量

    Returns:
        ResponseModel: 包含消息列表和分页信息
    """
    # 验证对话归属
    conversation = chat_service.get_conversation(
        session=session,
        conversation_id=conversation_id,
        user_id=current_user.user_id,
    )

    if not conversation:
        return ResponseModel.error(code=404, message="对话不存在")

    offset = (page - 1) * page_size

    messages, total = chat_service.get_conversation_messages(
        session=session,
        conversation_id=conversation_id,
        limit=page_size,
        offset=offset,
    )

    return ResponseModel(
        data={
            "items": [MessageResponse.model_validate(m).model_dump() for m in messages],
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": (total + page_size - 1) // page_size,
        }
    )


@router.post("/conversations/{conversation_id}/messages", response_model=ResponseModel)
async def send_message(
    conversation_id: int,
    data: SendMessageRequest,
    current_user: TokenPayload = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ResponseModel:
    """发送消息并获取 AI 回复

    Args:
        conversation_id: 对话 ID
        data: 发送消息请求数据

    Returns:
        ResponseModel: 包含用户消息和 AI 回复
    """
    try:
        user_message, assistant_message = await chat_service.send_message(
            session=session,
            conversation_id=conversation_id,
            user_id=current_user.user_id,
            content=data.content,
            ai_provider=data.ai_provider,
            use_deep_thinking=data.use_deep_thinking,
        )

        return ResponseModel(
            data=SendMessageResponse(
                user_message=MessageResponse.model_validate(user_message),
                assistant_message=MessageResponse.model_validate(assistant_message),
                tokens_used=assistant_message.tokens_used,
            ).model_dump()
        )

    except ChatServiceError as e:
        logger.error(f"发送消息失败: {e.message}")
        return ResponseModel.error(code=500, message=e.message)


@router.post("/conversations/{conversation_id}/messages/stream")
async def send_message_stream(
    conversation_id: int,
    data: SendMessageRequest,
    current_user: TokenPayload = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> StreamingResponse:
    """流式发送消息并获取 AI 回复

    使用 SSE (Server-Sent Events) 实时返回 AI 响应内容。

    事件格式:
        - type: "start" - 开始响应，包含 user_message_id
        - type: "content" - 增量内容
        - type: "done" - 响应完成，包含 assistant_message_id 和 tokens_used
        - type: "error" - 发生错误

    Args:
        conversation_id: 对话 ID
        data: 发送消息请求数据

    Returns:
        StreamingResponse: SSE 流式响应
    """

    async def event_generator():
        """生成 SSE 事件流"""
        async for event in chat_service.send_message_stream(
            session=session,
            conversation_id=conversation_id,
            user_id=current_user.user_id,
            content=data.content,
            ai_provider=data.ai_provider,
        ):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

        # 发送结束标记
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # 禁用 nginx 缓冲
        },
    )


# ============ 辅助接口 ============


@router.get("/providers", response_model=ResponseModel)
async def get_providers(
    session: Session = Depends(get_session),
) -> ResponseModel:
    """获取可用的 AI 提供商列表

    Returns:
        ResponseModel: 包含可用的 AI 提供商列表
    """
    providers = chat_service.get_available_providers(session)

    return ResponseModel(data={"providers": providers})
