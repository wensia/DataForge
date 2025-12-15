"""微信公众号文章数据模型

用于存储从极致了 API 采集的公众号历史文章数据。
"""

from datetime import datetime
from typing import Any

from sqlalchemy import Column, Index
from sqlalchemy.types import JSON
from sqlmodel import Field, SQLModel

from app.models.base import BaseTable


class WechatArticle(BaseTable, table=True):
    """微信公众号文章表

    存储从极致了 API 采集的公众号历史文章数据。
    """

    __tablename__ = "wechat_articles"
    __table_args__ = (
        Index("ix_wechat_articles_biz_post_time", "biz", "post_time"),
        Index("ix_wechat_articles_config_id", "config_id"),
    )

    # 文章唯一标识
    biz: str = Field(index=True, description="公众号 biz")
    article_url: str = Field(unique=True, description="文章链接")

    # 文章信息
    title: str = Field(description="文章标题")
    cover_url: str | None = Field(default=None, description="封面图片URL")
    post_time: datetime = Field(index=True, description="发布时间")
    position: int | None = Field(default=None, description="文章位置(1=头条)")
    is_original: bool = Field(default=False, description="是否原创")
    item_show_type: int | None = Field(default=None, description="展示类型")

    # 采集信息
    config_id: int = Field(foreign_key="dajiala_configs.id", description="采集配置ID")
    account_name: str | None = Field(default=None, index=True, description="公众号名称")

    # 原始数据
    raw_data: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON),
        description="原始数据（完整记录）",
    )


class WechatArticleCreate(SQLModel):
    """创建微信公众号文章"""

    biz: str
    article_url: str
    title: str
    cover_url: str | None = None
    post_time: datetime
    position: int | None = None
    is_original: bool = False
    item_show_type: int | None = None
    config_id: int
    account_name: str | None = None
    raw_data: dict[str, Any] = {}


class WechatArticleResponse(SQLModel):
    """微信公众号文章响应"""

    id: int
    biz: str
    article_url: str
    title: str
    cover_url: str | None
    post_time: datetime
    position: int | None
    is_original: bool
    item_show_type: int | None
    config_id: int
    account_name: str | None
    created_at: datetime
    updated_at: datetime


class WechatArticleParams(SQLModel):
    """微信公众号文章查询参数"""

    page: int = 1
    page_size: int = 20
    biz: str | None = None
    account_name: str | None = None
    title: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    is_original: bool | None = None
    config_id: int | None = None
