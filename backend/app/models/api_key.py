"""API 密钥数据模型"""

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class ApiKey(SQLModel, table=True):
    """API 密钥模型"""

    __tablename__ = "api_keys"

    id: Optional[int] = Field(default=None, primary_key=True)
    key: str = Field(index=True, unique=True, description="API 密钥")
    name: str = Field(description="密钥名称/描述")
    is_active: bool = Field(default=True, description="是否启用")

    # 元数据
    created_at: datetime = Field(default_factory=datetime.utcnow, description="创建时间")
    expires_at: Optional[datetime] = Field(default=None, description="过期时间")
    last_used_at: Optional[datetime] = Field(default=None, description="最后使用时间")

    # 统计信息
    usage_count: int = Field(default=0, description="使用次数")

    # 备注
    notes: Optional[str] = Field(default=None, description="备注信息")


class ApiKeyCreate(SQLModel):
    """创建 API 密钥的请求模型"""

    name: str = Field(description="密钥名称/描述")
    key: Optional[str] = Field(default=None, description="自定义密钥(可选,不提供则自动生成)")
    expires_at: Optional[datetime] = Field(default=None, description="过期时间(可选)")
    notes: Optional[str] = Field(default=None, description="备注信息")


class ApiKeyUpdate(SQLModel):
    """更新 API 密钥的请求模型"""

    name: Optional[str] = Field(default=None, description="密钥名称/描述")
    is_active: Optional[bool] = Field(default=None, description="是否启用")
    expires_at: Optional[datetime] = Field(default=None, description="过期时间")
    notes: Optional[str] = Field(default=None, description="备注信息")


class ApiKeyResponse(SQLModel):
    """API 密钥响应模型"""

    id: int
    key: str
    name: str
    is_active: bool
    created_at: datetime
    expires_at: Optional[datetime]
    last_used_at: Optional[datetime]
    usage_count: int
    notes: Optional[str]
