"""HTML 模板管理模型"""

from datetime import datetime
from typing import Any

from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSON
from sqlmodel import Field, Relationship, SQLModel

from app.models.base import BaseTable


# ==================== 模板分类 ====================


class TemplateCategory(BaseTable, table=True):
    """HTML 模板分类表"""

    __tablename__ = "template_categories"

    name: str = Field(max_length=50, description="分类名称")
    description: str | None = Field(default=None, max_length=200, description="分类描述")
    color: str | None = Field(default=None, max_length=20, description="分类颜色标识")
    sort_order: int = Field(default=0, description="排序顺序")
    is_active: bool = Field(default=True, description="是否启用")

    # 关联模板
    templates: list["HtmlTemplate"] = Relationship(back_populates="category")


class TemplateCategoryCreate(SQLModel):
    """创建模板分类请求"""

    name: str
    description: str | None = None
    color: str | None = None
    sort_order: int = 0
    is_active: bool = True


class TemplateCategoryUpdate(SQLModel):
    """更新模板分类请求"""

    name: str | None = None
    description: str | None = None
    color: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class TemplateCategoryResponse(SQLModel):
    """模板分类响应"""

    id: int
    name: str
    description: str | None
    color: str | None
    sort_order: int
    is_active: bool
    template_count: int = 0
    created_at: str
    updated_at: str

    @classmethod
    def from_model(
        cls, category: TemplateCategory, template_count: int = 0
    ) -> "TemplateCategoryResponse":
        return cls(
            id=category.id,
            name=category.name,
            description=category.description,
            color=category.color,
            sort_order=category.sort_order,
            is_active=category.is_active,
            template_count=template_count,
            created_at=category.created_at.isoformat() if category.created_at else "",
            updated_at=category.updated_at.isoformat() if category.updated_at else "",
        )


# ==================== 模板变量 ====================


class TemplateVariableInfo(SQLModel):
    """模板变量信息"""

    name: str = Field(description="变量名")
    label: str | None = Field(default=None, description="变量显示名称")
    default_value: str | None = Field(default=None, description="默认值")
    placeholder: str | None = Field(default=None, description="输入提示")
    required: bool = Field(default=True, description="是否必填")


# ==================== HTML 模板 ====================


class HtmlTemplate(BaseTable, table=True):
    """HTML 模板表"""

    __tablename__ = "html_templates"

    name: str = Field(max_length=100, index=True, description="模板名称")
    description: str | None = Field(default=None, max_length=500, description="模板描述")
    html_content: str = Field(description="HTML 内容")
    css_content: str | None = Field(default=None, description="自定义 CSS 样式")
    variables: list[dict[str, Any]] | None = Field(
        default=None, sa_column=Column(JSON), description="变量定义 JSON"
    )
    thumbnail: str | None = Field(default=None, description="缩略图 URL 或 Base64")
    width: int = Field(default=800, description="模板宽度(px)")
    height: int = Field(default=600, description="模板高度(px)")
    category_id: int | None = Field(
        default=None, foreign_key="template_categories.id", description="分类 ID"
    )
    is_active: bool = Field(default=True, description="是否启用")
    use_count: int = Field(default=0, description="使用次数")
    created_by: int | None = Field(default=None, description="创建者 ID")

    # 新增：系统模板和所有者字段
    is_system: bool = Field(default=False, index=True, description="是否为系统/根模板")
    owner_id: int | None = Field(
        default=None, foreign_key="users.id", index=True, description="模板所有者 ID"
    )

    # 关联分类
    category: TemplateCategory | None = Relationship(back_populates="templates")


class HtmlTemplateCreate(SQLModel):
    """创建 HTML 模板请求"""

    name: str
    description: str | None = None
    html_content: str
    css_content: str | None = None
    variables: list[TemplateVariableInfo] | None = None
    width: int = 800
    height: int = 600
    category_id: int | None = None
    is_active: bool = True
    is_system: bool = False  # 仅管理员可设置为 True


class HtmlTemplateUpdate(SQLModel):
    """更新 HTML 模板请求"""

    name: str | None = None
    description: str | None = None
    html_content: str | None = None
    css_content: str | None = None
    variables: list[TemplateVariableInfo] | None = None
    thumbnail: str | None = None
    width: int | None = None
    height: int | None = None
    category_id: int | None = None
    is_active: bool | None = None


class HtmlTemplateResponse(SQLModel):
    """HTML 模板响应"""

    id: int
    name: str
    description: str | None
    html_content: str
    css_content: str | None
    variables: list[TemplateVariableInfo] | None
    thumbnail: str | None
    width: int
    height: int
    category_id: int | None
    category_name: str | None = None
    is_active: bool
    use_count: int
    created_by: int | None
    is_system: bool  # 是否为系统模板
    owner_id: int | None  # 模板所有者 ID
    created_at: str
    updated_at: str

    @classmethod
    def from_model(
        cls, template: HtmlTemplate, category_name: str | None = None
    ) -> "HtmlTemplateResponse":
        # 解析变量 JSON
        variables = None
        if template.variables:
            variables = [
                TemplateVariableInfo(**v) if isinstance(v, dict) else v
                for v in template.variables
            ]

        return cls(
            id=template.id,
            name=template.name,
            description=template.description,
            html_content=template.html_content,
            css_content=template.css_content,
            variables=variables,
            thumbnail=template.thumbnail,
            width=template.width,
            height=template.height,
            category_id=template.category_id,
            category_name=category_name,
            is_active=template.is_active,
            use_count=template.use_count,
            created_by=template.created_by,
            is_system=template.is_system,
            owner_id=template.owner_id,
            created_at=template.created_at.isoformat() if template.created_at else "",
            updated_at=template.updated_at.isoformat() if template.updated_at else "",
        )


# ==================== API 请求模型 ====================


class ExtractVariablesRequest(SQLModel):
    """提取变量请求"""

    html_content: str


class RenderTemplateRequest(SQLModel):
    """渲染模板请求"""

    template_id: int
    variables: dict[str, str]


class RenderTemplateResponse(SQLModel):
    """渲染模板响应"""

    html: str
    css: str | None
    width: int
    height: int
