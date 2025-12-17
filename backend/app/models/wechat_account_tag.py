"""公众号标签数据模型

用于对公众号进行分类标记，支持多对多关系。
"""

from sqlmodel import Field, SQLModel

from app.models.base import BaseTable


class WechatAccountTag(BaseTable, table=True):
    """公众号标签表"""

    __tablename__ = "wechat_account_tags"

    name: str = Field(max_length=50, unique=True, index=True, description="标签名称")
    color: str = Field(default="gray", max_length=20, description="标签颜色")
    sort_order: int = Field(default=0, description="排序顺序")


class WechatAccountTagLink(BaseTable, table=True):
    """公众号-标签关联表（多对多中间表）"""

    __tablename__ = "wechat_account_tag_links"

    account_id: int = Field(
        foreign_key="wechat_accounts.id",
        index=True,
        description="公众号 ID",
    )
    tag_id: int = Field(
        foreign_key="wechat_account_tags.id",
        index=True,
        description="标签 ID",
    )


# ============ Pydantic 模型 ============


class WechatAccountTagCreate(SQLModel):
    """创建标签"""

    name: str
    color: str = "gray"
    sort_order: int = 0


class WechatAccountTagUpdate(SQLModel):
    """更新标签"""

    name: str | None = None
    color: str | None = None
    sort_order: int | None = None


class WechatAccountTagResponse(SQLModel):
    """标签响应"""

    id: int
    name: str
    color: str
    sort_order: int
    account_count: int = 0
    created_at: str
    updated_at: str

    @classmethod
    def from_model(
        cls, tag: "WechatAccountTag", account_count: int = 0
    ) -> "WechatAccountTagResponse":
        return cls(
            id=tag.id,
            name=tag.name,
            color=tag.color,
            sort_order=tag.sort_order,
            account_count=account_count,
            created_at=tag.created_at.isoformat() if tag.created_at else "",
            updated_at=tag.updated_at.isoformat() if tag.updated_at else "",
        )


class WechatAccountTagBrief(SQLModel):
    """标签简要信息（用于嵌入公众号响应）"""

    id: int
    name: str
    color: str


class AssignTagsRequest(SQLModel):
    """分配标签请求"""

    tag_ids: list[int]


class BatchAssignTagsRequest(SQLModel):
    """批量分配标签请求"""

    account_ids: list[int]
    tag_ids: list[int]
