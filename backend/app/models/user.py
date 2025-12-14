"""用户数据模型"""

from datetime import datetime
from enum import Enum

from sqlmodel import Field, SQLModel


class UserRole(str, Enum):
    """用户角色"""

    USER = "user"  # 普通用户
    ADMIN = "admin"  # 超级管理员


class User(SQLModel, table=True):
    """用户模型"""

    __tablename__ = "users"

    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True, description="邮箱(登录账号)")
    password_hash: str = Field(description="密码哈希")
    name: str = Field(description="显示名称")
    role: UserRole = Field(default=UserRole.USER, description="用户角色")
    is_active: bool = Field(default=True, description="是否启用")

    created_at: datetime = Field(
        default_factory=datetime.utcnow, description="创建时间"
    )
    updated_at: datetime = Field(
        default_factory=datetime.utcnow, description="更新时间"
    )
    last_login_at: datetime | None = Field(default=None, description="最后登录时间")


class UserCreate(SQLModel):
    """创建用户请求模型"""

    email: str = Field(description="邮箱")
    password: str = Field(min_length=6, description="密码(至少6位)")
    name: str = Field(description="显示名称")
    role: UserRole = Field(default=UserRole.USER, description="用户角色")


class UserUpdate(SQLModel):
    """更新用户请求模型（name 不可修改）"""

    email: str | None = None
    password: str | None = None
    role: UserRole | None = None
    is_active: bool | None = None


class UserResponse(SQLModel):
    """用户响应模型(不包含密码)"""

    id: int
    email: str
    name: str
    role: UserRole
    is_active: bool
    created_at: datetime
    last_login_at: datetime | None
