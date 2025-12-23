"""HTML 模板管理 API"""

import re
from datetime import datetime

from fastapi import APIRouter, Depends, Request
from sqlmodel import Session, func, select

from app.database import get_session
from app.models import (
    ExtractVariablesRequest,
    HtmlTemplate,
    HtmlTemplateCreate,
    HtmlTemplateResponse,
    HtmlTemplateUpdate,
    RenderTemplateRequest,
    RenderTemplateResponse,
    TemplateCategory,
    TemplateCategoryCreate,
    TemplateCategoryResponse,
    TemplateCategoryUpdate,
)
from app.schemas.response import ResponseModel
from app.utils.jwt_auth import TokenPayload, get_current_user, require_admin

router = APIRouter(prefix="/html-templates", tags=["HTML 模板"])
category_router = APIRouter(prefix="/template-categories", tags=["模板分类"])


# ==================== 分类管理 ====================


@category_router.get("", response_model=ResponseModel)
def get_categories(
    skip: int = 0,
    limit: int = 100,
    is_active: bool | None = None,
    session: Session = Depends(get_session),
):
    """获取模板分类列表"""
    query = select(TemplateCategory)
    if is_active is not None:
        query = query.where(TemplateCategory.is_active == is_active)
    query = query.order_by(TemplateCategory.sort_order).offset(skip).limit(limit)

    categories = session.exec(query).all()

    # 统计每个分类下的模板数量
    result = []
    for cat in categories:
        count_query = (
            select(func.count())
            .select_from(HtmlTemplate)
            .where(HtmlTemplate.category_id == cat.id)
        )
        template_count = session.exec(count_query).one()
        result.append(TemplateCategoryResponse.from_model(cat, template_count))

    return ResponseModel(data=result)


@category_router.post("", response_model=ResponseModel)
def create_category(
    data: TemplateCategoryCreate,
    session: Session = Depends(get_session),
):
    """创建模板分类"""
    category = TemplateCategory(**data.model_dump())
    session.add(category)
    session.commit()
    session.refresh(category)
    return ResponseModel(message="创建成功", data={"id": category.id})


@category_router.get("/{category_id}", response_model=ResponseModel)
def get_category(
    category_id: int,
    session: Session = Depends(get_session),
):
    """获取单个模板分类"""
    category = session.get(TemplateCategory, category_id)
    if not category:
        return ResponseModel.error(code=404, message="分类不存在")

    count_query = (
        select(func.count())
        .select_from(HtmlTemplate)
        .where(HtmlTemplate.category_id == category.id)
    )
    template_count = session.exec(count_query).one()

    return ResponseModel(data=TemplateCategoryResponse.from_model(category, template_count))


@category_router.put("/{category_id}", response_model=ResponseModel)
def update_category(
    category_id: int,
    data: TemplateCategoryUpdate,
    session: Session = Depends(get_session),
):
    """更新模板分类"""
    category = session.get(TemplateCategory, category_id)
    if not category:
        return ResponseModel.error(code=404, message="分类不存在")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(category, key, value)
    category.updated_at = datetime.now()

    session.add(category)
    session.commit()
    return ResponseModel(message="更新成功")


@category_router.delete("/{category_id}", response_model=ResponseModel)
def delete_category(
    category_id: int,
    session: Session = Depends(get_session),
):
    """删除模板分类"""
    category = session.get(TemplateCategory, category_id)
    if not category:
        return ResponseModel.error(code=404, message="分类不存在")

    # 检查是否有关联模板
    count_query = (
        select(func.count())
        .select_from(HtmlTemplate)
        .where(HtmlTemplate.category_id == category_id)
    )
    template_count = session.exec(count_query).one()
    if template_count > 0:
        return ResponseModel.error(
            code=400, message=f"该分类下有 {template_count} 个模板，无法删除"
        )

    session.delete(category)
    session.commit()
    return ResponseModel(message="删除成功")


# ==================== 模板管理 ====================


@router.get("", response_model=ResponseModel)
def get_templates(
    skip: int = 0,
    limit: int = 50,
    category_id: int | None = None,
    is_active: bool | None = None,
    keyword: str | None = None,
    session: Session = Depends(get_session),
):
    """获取模板列表"""
    query = select(HtmlTemplate)

    if category_id is not None:
        query = query.where(HtmlTemplate.category_id == category_id)
    if is_active is not None:
        query = query.where(HtmlTemplate.is_active == is_active)
    if keyword:
        query = query.where(HtmlTemplate.name.contains(keyword))

    # 统计总数
    count_query = select(func.count()).select_from(query.subquery())
    total = session.exec(count_query).one()

    query = query.order_by(HtmlTemplate.updated_at.desc()).offset(skip).limit(limit)
    templates = session.exec(query).all()

    result = []
    for t in templates:
        category_name = None
        if t.category_id:
            cat = session.get(TemplateCategory, t.category_id)
            category_name = cat.name if cat else None

        result.append(HtmlTemplateResponse.from_model(t, category_name))

    return ResponseModel(data={"items": result, "total": total})


@router.get("/{template_id}", response_model=ResponseModel)
def get_template(
    template_id: int,
    session: Session = Depends(get_session),
):
    """获取单个模板详情"""
    template = session.get(HtmlTemplate, template_id)
    if not template:
        return ResponseModel.error(code=404, message="模板不存在")

    category_name = None
    if template.category_id:
        cat = session.get(TemplateCategory, template.category_id)
        category_name = cat.name if cat else None

    return ResponseModel(data=HtmlTemplateResponse.from_model(template, category_name))


@router.post("", response_model=ResponseModel)
def create_template(
    data: HtmlTemplateCreate,
    session: Session = Depends(get_session),
):
    """创建模板"""
    # 自动提取变量
    variables = None
    if data.variables:
        variables = [v.model_dump() for v in data.variables]
    else:
        extracted = extract_variables_from_html(data.html_content)
        if extracted:
            variables = [
                {"name": v, "label": v, "required": True, "default_value": None, "placeholder": None}
                for v in extracted
            ]

    template_data = data.model_dump(exclude={"variables"})
    template_data["variables"] = variables

    template = HtmlTemplate(**template_data)
    session.add(template)
    session.commit()
    session.refresh(template)

    return ResponseModel(message="创建成功", data={"id": template.id})


@router.put("/{template_id}", response_model=ResponseModel)
def update_template(
    template_id: int,
    data: HtmlTemplateUpdate,
    session: Session = Depends(get_session),
):
    """更新模板"""
    template = session.get(HtmlTemplate, template_id)
    if not template:
        return ResponseModel.error(code=404, message="模板不存在")

    update_data = data.model_dump(exclude_unset=True)

    # 处理变量字段
    if "variables" in update_data and update_data["variables"] is not None:
        update_data["variables"] = [
            v.model_dump() if hasattr(v, "model_dump") else v
            for v in update_data["variables"]
        ]

    for key, value in update_data.items():
        setattr(template, key, value)
    template.updated_at = datetime.now()

    session.add(template)
    session.commit()
    return ResponseModel(message="更新成功")


@router.delete("/{template_id}", response_model=ResponseModel)
def delete_template(
    template_id: int,
    session: Session = Depends(get_session),
):
    """删除模板"""
    template = session.get(HtmlTemplate, template_id)
    if not template:
        return ResponseModel.error(code=404, message="模板不存在")

    session.delete(template)
    session.commit()
    return ResponseModel(message="删除成功")


@router.post("/extract-variables", response_model=ResponseModel)
def extract_variables(data: ExtractVariablesRequest):
    """从 HTML 中提取变量"""
    variables = extract_variables_from_html(data.html_content)
    return ResponseModel(data={"variables": variables})


@router.post("/{template_id}/render", response_model=ResponseModel)
def render_template(
    template_id: int,
    data: RenderTemplateRequest,
    session: Session = Depends(get_session),
):
    """渲染模板（返回替换变量后的 HTML）"""
    template = session.get(HtmlTemplate, template_id)
    if not template:
        return ResponseModel.error(code=404, message="模板不存在")

    # 替换变量
    rendered_html = replace_variables(template.html_content, data.variables)

    # 更新使用次数
    template.use_count += 1
    session.add(template)
    session.commit()

    return ResponseModel(
        data=RenderTemplateResponse(
            html=rendered_html,
            css=template.css_content,
            width=template.width,
            height=template.height,
        )
    )


# ==================== 辅助函数 ====================


def extract_variables_from_html(html_content: str) -> list[str]:
    """从 HTML 中提取 {{变量名}} 格式的变量

    Args:
        html_content: HTML 内容

    Returns:
        变量名列表（已去重并保持顺序）
    """
    pattern = r"\{\{(\w+)\}\}"
    matches = re.findall(pattern, html_content)
    # 去重并保持顺序
    seen = set()
    result = []
    for m in matches:
        if m not in seen:
            seen.add(m)
            result.append(m)
    return result


def replace_variables(html_content: str, variables: dict[str, str]) -> str:
    """替换 HTML 中的变量

    Args:
        html_content: HTML 内容
        variables: 变量键值对

    Returns:
        替换后的 HTML 内容
    """
    result = html_content
    for key, value in variables.items():
        result = result.replace(f"{{{{{key}}}}}", value)
    return result
