"""基础模型定义"""

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class BaseTable(SQLModel):
    """基础表模型，包含通用字段

    Attributes:
        id: 主键 ID
        created_at: 创建时间
        updated_at: 更新时间
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)






