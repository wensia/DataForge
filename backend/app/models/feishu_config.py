"""飞书多维表格配置模型"""

from datetime import datetime

from sqlmodel import Field, SQLModel

from app.models.base import BaseTable


class FeishuConfig(BaseTable, table=True):
    """飞书多维表格配置"""

    __tablename__ = "feishu_configs"

    name: str = Field(description="配置名称")
    app_id: str = Field(unique=True, index=True, description="飞书应用 App ID")
    app_secret: str = Field(description="飞书应用 App Secret")
    app_token: str | None = Field(default=None, description="多维表格 App Token")
    table_id: str | None = Field(default=None, description="数据表 ID")
    is_active: bool = Field(default=True, description="是否启用")
    notes: str | None = Field(default=None, description="备注")


class FeishuConfigCreate(SQLModel):
    """创建飞书配置请求"""

    name: str
    app_id: str
    app_secret: str
    app_token: str | None = None
    table_id: str | None = None
    notes: str | None = None


class FeishuConfigUpdate(SQLModel):
    """更新飞书配置请求"""

    name: str | None = None
    app_secret: str | None = None
    app_token: str | None = None
    table_id: str | None = None
    is_active: bool | None = None
    notes: str | None = None


class FeishuConfigResponse(SQLModel):
    """飞书配置响应（不含敏感信息）"""

    id: int
    name: str
    app_id: str
    app_token: str | None
    table_id: str | None
    is_active: bool
    notes: str | None
    created_at: datetime
    updated_at: datetime
