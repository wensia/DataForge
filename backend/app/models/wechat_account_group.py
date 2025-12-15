"""公众号分组数据模型

用于管理公众号的分组，支持按分组批量控制采集行为。
"""

from sqlmodel import Field, SQLModel

from app.models.base import BaseTable


class WechatAccountGroup(BaseTable, table=True):
    """公众号分组表"""

    __tablename__ = "wechat_account_groups"

    name: str = Field(description="分组名称")
    description: str | None = Field(default=None, description="分组描述")
    is_collection_enabled: bool = Field(default=True, description="该分组是否启用采集")
    sort_order: int = Field(default=0, description="排序顺序")


class WechatAccountGroupCreate(SQLModel):
    """创建公众号分组"""

    name: str
    description: str | None = None
    is_collection_enabled: bool = True
    sort_order: int = 0


class WechatAccountGroupUpdate(SQLModel):
    """更新公众号分组"""

    name: str | None = None
    description: str | None = None
    is_collection_enabled: bool | None = None
    sort_order: int | None = None


class WechatAccountGroupResponse(SQLModel):
    """公众号分组响应"""

    id: int
    name: str
    description: str | None
    is_collection_enabled: bool
    sort_order: int
    account_count: int = 0  # 组内公众号数量统计
    created_at: str
    updated_at: str

    @classmethod
    def from_model(
        cls, group: "WechatAccountGroup", account_count: int = 0
    ) -> "WechatAccountGroupResponse":
        return cls(
            id=group.id,
            name=group.name,
            description=group.description,
            is_collection_enabled=group.is_collection_enabled,
            sort_order=group.sort_order,
            account_count=account_count,
            created_at=group.created_at.isoformat() if group.created_at else "",
            updated_at=group.updated_at.isoformat() if group.updated_at else "",
        )
