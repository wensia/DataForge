"""API 密钥数据模型"""

from datetime import datetime

from sqlmodel import Field, SQLModel


class ApiKey(SQLModel, table=True):
    """API 密钥模型"""

    __tablename__ = "api_keys"

    id: int | None = Field(default=None, primary_key=True)
    key: str = Field(index=True, unique=True, description="API 密钥")
    name: str = Field(description="密钥名称/描述")
    is_active: bool = Field(default=True, description="是否启用")

    # 元数据
    created_at: datetime = Field(
        default_factory=datetime.utcnow, description="创建时间"
    )
    expires_at: datetime | None = Field(default=None, description="过期时间")
    last_used_at: datetime | None = Field(default=None, description="最后使用时间")

    # 统计信息
    usage_count: int = Field(default=0, description="使用次数")

    # 备注
    notes: str | None = Field(default=None, description="备注信息")

    # 用户关联
    owner_id: int | None = Field(
        default=None, foreign_key="users.id", description="所属用户ID"
    )


class ApiKeyCreate(SQLModel):
    """创建 API 密钥的请求模型"""

    name: str = Field(description="密钥名称/描述")
    key: str | None = Field(
        default=None, description="自定义密钥(可选,不提供则自动生成)"
    )
    expires_at: datetime | None = Field(default=None, description="过期时间(可选)")
    notes: str | None = Field(default=None, description="备注信息")


class ApiKeyUpdate(SQLModel):
    """更新 API 密钥的请求模型"""

    name: str | None = Field(default=None, description="密钥名称/描述")
    is_active: bool | None = Field(default=None, description="是否启用")
    expires_at: datetime | None = Field(default=None, description="过期时间")
    notes: str | None = Field(default=None, description="备注信息")


class ApiKeyResponse(SQLModel):
    """API 密钥响应模型"""

    id: int
    key: str
    name: str
    is_active: bool
    created_at: datetime
    expires_at: datetime | None
    last_used_at: datetime | None
    usage_count: int
    notes: str | None
    owner_id: int | None = None
