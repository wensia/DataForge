"""飞书多维表格配置模型"""

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from app.models.base import BaseTable


class FeishuBitable(BaseTable, table=True):
    """飞书多维表格配置"""

    __tablename__ = "feishu_bitables"

    client_id: int = Field(foreign_key="feishu_clients.id", index=True, description="关联的客户端 ID")
    name: str = Field(description="多维表格名称")
    app_token: str = Field(index=True, description="多维表格 App Token")
    is_active: bool = Field(default=True, description="是否启用")
    notes: Optional[str] = Field(default=None, description="备注")


class FeishuBitableCreate(SQLModel):
    """创建飞书多维表格请求"""

    name: str
    app_token: str
    notes: Optional[str] = None


class FeishuBitableUpdate(SQLModel):
    """更新飞书多维表格请求"""

    name: Optional[str] = None
    app_token: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class FeishuBitableResponse(SQLModel):
    """飞书多维表格响应"""

    id: int
    client_id: int
    name: str
    app_token: str
    is_active: bool
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
