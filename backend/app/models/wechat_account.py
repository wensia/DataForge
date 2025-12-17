"""公众号账号数据模型

用于管理微信公众号账号，支持分组和采集控制。
"""

from datetime import datetime

from sqlmodel import Field, SQLModel

from app.models.base import BaseTable


class WechatAccount(BaseTable, table=True):
    """公众号账号表"""

    __tablename__ = "wechat_accounts"

    biz: str = Field(unique=True, index=True, description="公众号 biz（唯一标识）")
    name: str = Field(description="公众号名称")
    avatar_url: str | None = Field(default=None, description="头像 URL（原始外链）")
    local_avatar: str | None = Field(default=None, description="本地头像路径")

    group_id: int | None = Field(
        default=None,
        foreign_key="wechat_account_groups.id",
        description="所属分组 ID",
    )
    is_collection_enabled: bool = Field(default=True, description="是否启用采集")
    collection_frequency: str | None = Field(
        default=None, description="采集频率（daily/weekly/manual）"
    )

    last_collection_at: datetime | None = Field(default=None, description="上次采集时间")
    article_count: int = Field(default=0, description="文章数量统计")
    notes: str | None = Field(default=None, description="备注")


class WechatAccountCreate(SQLModel):
    """创建公众号账号"""

    biz: str
    name: str
    avatar_url: str | None = None
    group_id: int | None = None
    is_collection_enabled: bool = True
    collection_frequency: str | None = None
    notes: str | None = None


class WechatAccountUpdate(SQLModel):
    """更新公众号账号"""

    name: str | None = None
    avatar_url: str | None = None
    group_id: int | None = None
    is_collection_enabled: bool | None = None
    collection_frequency: str | None = None
    notes: str | None = None


class WechatAccountResponse(SQLModel):
    """公众号账号响应"""

    id: int
    biz: str
    name: str
    avatar_url: str | None
    local_avatar: str | None = None  # 本地头像路径
    group_id: int | None
    group_name: str | None = None  # 分组名称（用于显示）
    is_collection_enabled: bool
    collection_frequency: str | None
    last_collection_at: str | None
    article_count: int
    notes: str | None
    created_at: str
    updated_at: str

    @classmethod
    def from_model(
        cls, account: "WechatAccount", group_name: str | None = None
    ) -> "WechatAccountResponse":
        return cls(
            id=account.id,
            biz=account.biz,
            name=account.name,
            avatar_url=account.avatar_url,
            local_avatar=account.local_avatar,
            group_id=account.group_id,
            group_name=group_name,
            is_collection_enabled=account.is_collection_enabled,
            collection_frequency=account.collection_frequency,
            last_collection_at=(
                account.last_collection_at.isoformat()
                if account.last_collection_at
                else None
            ),
            article_count=account.article_count,
            notes=account.notes,
            created_at=account.created_at.isoformat() if account.created_at else "",
            updated_at=account.updated_at.isoformat() if account.updated_at else "",
        )


class WechatAccountParams(SQLModel):
    """公众号账号查询参数"""

    page: int = 1
    page_size: int = 50
    group_id: int | None = None
    is_collection_enabled: bool | None = None
    search: str | None = None  # 搜索名称或 biz


class MoveGroupRequest(SQLModel):
    """移动分组请求"""

    group_id: int | None = None  # None 表示移到未分组


class BatchMoveGroupRequest(SQLModel):
    """批量移动分组请求"""

    account_ids: list[int]
    group_id: int | None = None
