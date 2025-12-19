"""页面配置数据模型

管理侧边栏页面和分组的配置，支持权限控制。
"""

from datetime import datetime
from typing import Any

from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSON
from sqlmodel import Field, Relationship, SQLModel


class PageGroup(SQLModel, table=True):
    """页面分组"""

    __tablename__ = "page_groups"

    id: int | None = Field(default=None, primary_key=True)
    title: str = Field(description="分组标题")
    order: int = Field(default=0, description="排序权重")
    is_active: bool = Field(default=True, description="是否启用")
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

    # 关联的页面
    pages: list["Page"] = Relationship(back_populates="group")


class Page(SQLModel, table=True):
    """页面配置 - 全局统一配置"""

    __tablename__ = "pages"

    id: int | None = Field(default=None, primary_key=True)

    # 基本信息
    key: str = Field(unique=True, index=True, description="页面唯一标识，如 'dashboard'")
    title: str = Field(description="页面标题")
    url: str = Field(description="页面路径")
    icon: str = Field(default="LayoutDashboard", description="图标名称")

    # 分组和排序
    group_id: int | None = Field(default=None, foreign_key="page_groups.id")
    order: int = Field(default=0, description="排序权重")

    # 权限配置
    is_public: bool = Field(default=False, description="是否公开（所有用户可见）")
    is_admin_only: bool = Field(default=False, description="是否仅管理员可见")
    allowed_user_ids: list[int] | None = Field(
        default=None,
        sa_column=Column(JSON),
        description="允许访问的用户ID列表",
    )

    # 元数据
    is_active: bool = Field(default=True, description="是否启用")
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

    # 关联
    group: PageGroup | None = Relationship(back_populates="pages")


# ============================================================================
# PageGroup 相关模型
# ============================================================================


class PageGroupCreate(SQLModel):
    """创建分组"""

    title: str
    order: int = 0


class PageGroupUpdate(SQLModel):
    """更新分组"""

    title: str | None = None
    order: int | None = None
    is_active: bool | None = None


class PageGroupResponse(SQLModel):
    """分组响应"""

    id: int
    title: str
    order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ============================================================================
# Page 相关模型
# ============================================================================


class PageCreate(SQLModel):
    """创建页面"""

    key: str
    title: str
    url: str
    icon: str = "LayoutDashboard"
    group_id: int | None = None
    order: int = 0
    is_public: bool = False
    is_admin_only: bool = False
    allowed_user_ids: list[int] | None = None


class PageUpdate(SQLModel):
    """更新页面"""

    title: str | None = None
    url: str | None = None
    icon: str | None = None
    group_id: int | None = None
    order: int | None = None
    is_public: bool | None = None
    is_admin_only: bool | None = None
    allowed_user_ids: list[int] | None = None
    is_active: bool | None = None


class PageResponse(SQLModel):
    """页面响应"""

    id: int
    key: str
    title: str
    url: str
    icon: str
    group_id: int | None
    order: int
    is_public: bool
    is_admin_only: bool
    allowed_user_ids: list[int] | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class PageWithGroup(PageResponse):
    """页面响应（包含分组信息）"""

    group: PageGroupResponse | None = None


# ============================================================================
# 导航菜单响应模型
# ============================================================================


class NavItem(SQLModel):
    """导航菜单项"""

    id: int
    key: str
    title: str
    url: str
    icon: str
    order: int


class NavGroup(SQLModel):
    """导航菜单分组"""

    id: int
    title: str
    order: int
    items: list[NavItem]


class NavConfig(SQLModel):
    """用户可见的导航配置"""

    groups: list[NavGroup]


# ============================================================================
# 批量操作模型
# ============================================================================


class ReorderItem(SQLModel):
    """排序项"""

    id: int
    order: int
    group_id: int | None = None


class ReorderRequest(SQLModel):
    """批量排序请求"""

    pages: list[ReorderItem] | None = None
    groups: list[ReorderItem] | None = None
