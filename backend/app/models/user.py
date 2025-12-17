"""用户数据模型"""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel
from sqlmodel import Field, SQLModel


class UserRole(str, Enum):
    """用户角色"""

    USER = "user"  # 普通用户
    ADMIN = "admin"  # 超级管理员


class User(SQLModel, table=True):
    """用户模型

    支持两种认证模式:
    1. 本地认证: 使用 email + password_hash
    2. CRM 认证: 使用 crm_id 关联 CRM 系统用户
    """

    __tablename__ = "users"

    id: int | None = Field(default=None, primary_key=True)

    # 本地认证字段
    email: str | None = Field(
        default=None, index=True, unique=True, description="邮箱(本地登录账号)"
    )
    password_hash: str | None = Field(default=None, description="密码哈希(本地认证)")

    # CRM 认证字段
    crm_id: str | None = Field(
        default=None, index=True, unique=True, description="CRM 用户 ID"
    )
    username: str | None = Field(
        default=None, index=True, unique=True, description="用户名(CRM 登录账号)"
    )
    phone: str | None = Field(default=None, description="手机号")

    # 通用字段
    name: str = Field(description="显示名称")
    role: UserRole = Field(default=UserRole.USER, description="用户角色")
    is_active: bool = Field(default=True, description="是否启用")
    ai_enabled: bool = Field(default=False, description="是否启用 AI 对话功能")

    # 数据访问权限
    analysis_enabled: bool = Field(
        default=False, description="是否启用数据分析功能"
    )
    call_type_filter: str | None = Field(
        default=None,
        description="通话类型过滤: null=全部, '呼入'=仅呼入, '外呼'=仅外呼",
    )

    created_at: datetime = Field(
        default_factory=datetime.utcnow, description="创建时间"
    )
    updated_at: datetime = Field(
        default_factory=datetime.utcnow, description="更新时间"
    )
    last_login_at: datetime | None = Field(default=None, description="最后登录时间")

    # CRM 同步信息
    crm_synced_at: datetime | None = Field(
        default=None, description="CRM 信息最后同步时间"
    )


class UserCreate(SQLModel):
    """创建用户请求模型（仅用于 CRM 同步场景）"""

    crm_id: str | None = Field(default=None, description="CRM 用户 ID")
    username: str | None = Field(default=None, description="用户名")
    email: str | None = Field(default=None, description="邮箱")
    name: str = Field(description="显示名称")
    role: UserRole = Field(default=UserRole.USER, description="用户角色")


class UserUpdate(SQLModel):
    """更新用户请求模型（仅本地扩展字段）"""

    role: UserRole | None = None
    is_active: bool | None = None
    ai_enabled: bool | None = None
    analysis_enabled: bool | None = None
    call_type_filter: str | None = None


class UserResponse(SQLModel):
    """用户响应模型(不包含密码)"""

    id: int
    email: str | None = None
    username: str | None = None
    crm_id: str | None = None
    name: str
    phone: str | None = None
    role: UserRole
    is_active: bool
    ai_enabled: bool
    analysis_enabled: bool
    call_type_filter: str | None = None
    created_at: datetime
    last_login_at: datetime | None = None


class UserIdentity(BaseModel):
    """用户身份信息（来自 CRM）"""

    identity_id: str
    campus_id: str
    campus_name: str
    department_id: str
    department_name: str
    position_id: str
    position_name: str
    position_level: int
    is_active: bool = True


class UserWithIdentities(UserResponse):
    """包含身份信息的用户响应"""

    identities: list[UserIdentity] = []
