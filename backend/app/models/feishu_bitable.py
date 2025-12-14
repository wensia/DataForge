"""飞书多维表格配置模型"""

from datetime import datetime

from sqlmodel import Field, SQLModel

from app.models.base import BaseTable


class FeishuBitable(BaseTable, table=True):
    """飞书多维表格配置"""

    __tablename__ = "feishu_bitables"

    client_id: int = Field(
        foreign_key="feishu_clients.id", index=True, description="关联的客户端 ID"
    )
    name: str = Field(description="多维表格名称")
    app_token: str = Field(index=True, description="多维表格 App Token")
    is_active: bool = Field(default=True, description="是否启用")
    notes: str | None = Field(default=None, description="备注")


class FeishuBitableCreate(SQLModel):
    """创建飞书多维表格请求"""

    name: str
    app_token: str
    notes: str | None = None


class FeishuBitableUpdate(SQLModel):
    """更新飞书多维表格请求"""

    name: str | None = None
    app_token: str | None = None
    is_active: bool | None = None
    notes: str | None = None


class FeishuBitableResponse(SQLModel):
    """飞书多维表格响应"""

    id: int
    client_id: int
    name: str
    app_token: str
    is_active: bool
    notes: str | None
    created_at: datetime
    updated_at: datetime
