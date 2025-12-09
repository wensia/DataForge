"""飞书数据表配置模型"""

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from app.models.base import BaseTable


class FeishuTable(BaseTable, table=True):
    """飞书数据表配置"""

    __tablename__ = "feishu_tables"

    bitable_id: int = Field(foreign_key="feishu_bitables.id", index=True, description="关联的多维表格 ID")
    name: str = Field(description="数据表名称")
    table_id: str = Field(index=True, description="数据表 Table ID")
    is_active: bool = Field(default=True, description="是否启用")
    notes: Optional[str] = Field(default=None, description="备注")


class FeishuTableCreate(SQLModel):
    """创建飞书数据表请求"""

    name: str
    table_id: str
    notes: Optional[str] = None


class FeishuTableUpdate(SQLModel):
    """更新飞书数据表请求"""

    name: Optional[str] = None
    table_id: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class FeishuTableResponse(SQLModel):
    """飞书数据表响应"""

    id: int
    bitable_id: int
    name: str
    table_id: str
    is_active: bool
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
