"""快捷话术数据模型

用于存储管理员创建的快捷话术，并支持分配给指定用户。
"""

from datetime import datetime

from sqlalchemy import Index
from sqlmodel import Field, SQLModel

from app.models.base import BaseTable


class Prompt(BaseTable, table=True):
    """快捷话术表"""

    __tablename__ = "prompts"

    title: str = Field(max_length=100, description="话术标题")
    content: str = Field(description="话术内容")
    category: str | None = Field(default=None, max_length=50, description="分类")
    description: str | None = Field(default=None, max_length=500, description="描述说明")
    sort_order: int = Field(default=0, description="排序顺序")
    is_active: bool = Field(default=True, description="是否启用")
    created_by: int = Field(foreign_key="users.id", description="创建者用户ID")


class PromptAssignment(BaseTable, table=True):
    """话术分配表 - 记录哪些话术分配给哪些用户"""

    __tablename__ = "prompt_assignments"
    __table_args__ = (
        Index("ix_prompt_user_unique", "prompt_id", "user_id", unique=True),
    )

    prompt_id: int = Field(foreign_key="prompts.id", index=True, description="话术ID")
    user_id: int = Field(foreign_key="users.id", index=True, description="用户ID")


# ============ Pydantic 模型 ============


class PromptCreate(SQLModel):
    """创建话术"""

    title: str
    content: str
    category: str | None = None
    description: str | None = None
    sort_order: int = 0
    is_active: bool = True


class PromptUpdate(SQLModel):
    """更新话术"""

    title: str | None = None
    content: str | None = None
    category: str | None = None
    description: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class PromptResponse(SQLModel):
    """话术响应"""

    id: int
    title: str
    content: str
    category: str | None
    description: str | None
    sort_order: int
    is_active: bool
    created_by: int
    created_at: datetime
    updated_at: datetime
    # 可选：分配的用户数量
    assigned_count: int | None = None


class PromptWithAssignments(PromptResponse):
    """话术响应（包含分配的用户列表）"""

    assigned_users: list[dict] = []


class AssignUsersRequest(SQLModel):
    """分配用户请求"""

    user_ids: list[int]


class PromptAssignmentResponse(SQLModel):
    """话术分配响应"""

    id: int
    prompt_id: int
    user_id: int
    created_at: datetime
    # 用户信息
    user_name: str | None = None
    user_email: str | None = None
