"""对话数据模型"""

from datetime import datetime
from enum import Enum

from sqlalchemy import Column
from sqlalchemy.types import Text
from sqlmodel import Field, SQLModel

from app.models.base import BaseTable


class ConversationType(str, Enum):
    """对话类型"""

    GENERAL = "general"  # 通用对话
    ANALYSIS = "analysis"  # 数据分析对话


class MessageRole(str, Enum):
    """消息角色"""

    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class Conversation(BaseTable, table=True):
    """对话表

    存储用户与 AI 的对话会话。
    """

    __tablename__ = "conversations"

    user_id: int = Field(foreign_key="users.id", index=True, description="用户 ID")
    title: str = Field(max_length=200, description="对话标题")
    ai_provider: str = Field(default="kimi", index=True, description="AI 提供商")
    conversation_type: str = Field(
        default=ConversationType.GENERAL, index=True, description="对话类型"
    )
    is_archived: bool = Field(default=False, description="是否归档")


class Message(BaseTable, table=True):
    """消息表

    存储对话中的每条消息。
    """

    __tablename__ = "messages"

    conversation_id: int = Field(
        foreign_key="conversations.id", index=True, description="对话 ID"
    )
    role: str = Field(description="消息角色: user/assistant/system")
    content: str = Field(sa_column=Column(Text), description="消息内容")
    tokens_used: int | None = Field(default=None, description="消耗的 token 数量")


# ============ Schema ============


class ConversationCreate(SQLModel):
    """创建对话请求"""

    title: str | None = Field(default=None, max_length=200, description="对话标题")
    ai_provider: str = Field(default="kimi", description="AI 提供商")
    conversation_type: str = Field(
        default=ConversationType.GENERAL, description="对话类型"
    )


class ConversationUpdate(SQLModel):
    """更新对话请求"""

    title: str | None = None
    ai_provider: str | None = None
    is_archived: bool | None = None


class ConversationResponse(SQLModel):
    """对话响应"""

    id: int
    user_id: int
    title: str
    ai_provider: str
    conversation_type: str
    is_archived: bool
    created_at: datetime
    updated_at: datetime


class ConversationWithMessages(ConversationResponse):
    """对话响应（包含消息）"""

    messages: list["MessageResponse"] = []


class MessageCreate(SQLModel):
    """创建消息请求"""

    content: str = Field(description="消息内容")


class MessageResponse(SQLModel):
    """消息响应"""

    id: int
    conversation_id: int
    role: str
    content: str
    tokens_used: int | None
    created_at: datetime


class SendMessageRequest(SQLModel):
    """发送消息请求"""

    content: str = Field(description="用户消息内容")
    ai_provider: str | None = Field(default=None, description="临时切换 AI 提供商")
    use_deep_thinking: bool = Field(default=True, description="是否启用深度思考模式")


class SendMessageResponse(SQLModel):
    """发送消息响应"""

    user_message: MessageResponse
    assistant_message: MessageResponse
    tokens_used: int | None
