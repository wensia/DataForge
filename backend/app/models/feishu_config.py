"""飞书多维表格配置模型"""

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from app.models.base import BaseTable


class FeishuConfig(BaseTable, table=True):
    """飞书多维表格配置"""

    __tablename__ = "feishu_configs"

    name: str = Field(description="配置名称")
    app_id: str = Field(unique=True, index=True, description="飞书应用 App ID")
    app_secret: str = Field(description="飞书应用 App Secret")
    app_token: Optional[str] = Field(default=None, description="多维表格 App Token")
    table_id: Optional[str] = Field(default=None, description="数据表 ID")
    is_active: bool = Field(default=True, description="是否启用")
    notes: Optional[str] = Field(default=None, description="备注")


class FeishuConfigCreate(SQLModel):
    """创建飞书配置请求"""

    name: str
    app_id: str
    app_secret: str
    app_token: Optional[str] = None
    table_id: Optional[str] = None
    notes: Optional[str] = None


class FeishuConfigUpdate(SQLModel):
    """更新飞书配置请求"""

    name: Optional[str] = None
    app_secret: Optional[str] = None
    app_token: Optional[str] = None
    table_id: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class FeishuConfigResponse(SQLModel):
    """飞书配置响应（不含敏感信息）"""

    id: int
    name: str
    app_id: str
    app_token: Optional[str]
    table_id: Optional[str]
    is_active: bool
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
