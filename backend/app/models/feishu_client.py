"""飞书客户端配置模型"""

from datetime import datetime

from sqlmodel import Field, SQLModel

from app.models.base import BaseTable


class FeishuClient(BaseTable, table=True):
    """飞书客户端配置"""

    __tablename__ = "feishu_clients"

    name: str = Field(description="客户端名称")
    app_id: str = Field(unique=True, index=True, description="飞书应用 App ID")
    app_secret: str = Field(description="飞书应用 App Secret")
    is_active: bool = Field(default=True, description="是否启用")
    notes: str | None = Field(default=None, description="备注")


class FeishuClientCreate(SQLModel):
    """创建飞书客户端请求"""

    name: str
    app_id: str
    app_secret: str
    notes: str | None = None


class FeishuClientUpdate(SQLModel):
    """更新飞书客户端请求"""

    name: str | None = None
    app_secret: str | None = None
    is_active: bool | None = None
    notes: str | None = None


class FeishuClientResponse(SQLModel):
    """飞书客户端响应（不含敏感信息）"""

    id: int
    name: str
    app_id: str
    is_active: bool
    notes: str | None
    created_at: datetime
    updated_at: datetime
