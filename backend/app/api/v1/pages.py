"""页面配置 API

管理侧边栏页面和分组的配置，支持权限控制。
"""

from datetime import datetime

from fastapi import APIRouter, Depends, Request
from loguru import logger
from sqlmodel import Session, select

from app.database import get_session
from app.models import (
    NavConfig,
    NavGroup,
    NavItem,
    Page,
    PageCreate,
    PageGroup,
    PageGroupCreate,
    PageGroupResponse,
    PageGroupUpdate,
    PageResponse,
    PageUpdate,
    PageWithGroup,
    ReorderRequest,
    User,
    UserRole,
)
from app.schemas.response import ResponseModel

router = APIRouter(prefix="/pages", tags=["页面配置"])
group_router = APIRouter(prefix="/page-groups", tags=["页面分组"])


# ============================================================================
# 辅助函数
# ============================================================================


def get_current_user(request: Request, session: Session) -> User | None:
    """从请求中获取当前用户"""
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        return None
    return session.get(User, user_id)


def require_admin(request: Request) -> bool:
    """检查当前用户是否为管理员"""
    return getattr(request.state, "user_role", None) == UserRole.ADMIN.value


def can_user_see_page(user: User, page: Page) -> bool:
    """检查用户是否可以看到该页面"""
    if not page.is_active:
        return False

    if page.is_public:
        return True

    if page.is_admin_only:
        return user.role == UserRole.ADMIN

    if page.allowed_user_ids and user.id in page.allowed_user_ids:
        return True

    return False


# ============================================================================
# 用户导航 API（所有登录用户可访问）
# ============================================================================


@router.get("", response_model=ResponseModel)
def get_user_nav_config(
    request: Request,
    session: Session = Depends(get_session),
):
    """获取当前用户可见的导航配置

    根据用户权限返回可访问的页面列表，按分组组织。
    """
    user = get_current_user(request, session)
    if not user:
        return ResponseModel.error(code=401, message="请先登录")

    # 获取所有启用的分组
    groups = session.exec(
        select(PageGroup)
        .where(PageGroup.is_active == True)
        .order_by(PageGroup.order)
    ).all()

    # 获取所有启用的页面
    pages = session.exec(
        select(Page).where(Page.is_active == True).order_by(Page.order)
    ).all()

    # 按分组组织用户可见的页面
    nav_groups = []
    for group in groups:
        group_pages = [p for p in pages if p.group_id == group.id]
        visible_pages = [p for p in group_pages if can_user_see_page(user, p)]

        if visible_pages:
            nav_groups.append(
                NavGroup(
                    id=group.id,
                    title=group.title,
                    order=group.order,
                    items=[
                        NavItem(
                            id=p.id,
                            key=p.key,
                            title=p.title,
                            url=p.url,
                            icon=p.icon,
                            order=p.order,
                        )
                        for p in visible_pages
                    ],
                )
            )

    # 处理未分组的页面
    ungrouped_pages = [p for p in pages if p.group_id is None]
    visible_ungrouped = [p for p in ungrouped_pages if can_user_see_page(user, p)]
    if visible_ungrouped:
        nav_groups.insert(
            0,
            NavGroup(
                id=0,
                title="其他",
                order=-1,
                items=[
                    NavItem(
                        id=p.id,
                        key=p.key,
                        title=p.title,
                        url=p.url,
                        icon=p.icon,
                        order=p.order,
                    )
                    for p in visible_ungrouped
                ],
            ),
        )

    return ResponseModel(data=NavConfig(groups=nav_groups).model_dump())


# ============================================================================
# 管理员 API - 页面管理
# ============================================================================


@router.get("/all", response_model=ResponseModel)
def get_all_pages(
    request: Request,
    session: Session = Depends(get_session),
):
    """获取所有页面（管理员用）

    返回所有页面，包括未启用的，用于管理界面。
    """
    if not require_admin(request):
        return ResponseModel.error(code=403, message="需要管理员权限")

    pages = session.exec(
        select(Page).order_by(Page.group_id, Page.order)
    ).all()

    # 获取分组信息
    groups = {g.id: g for g in session.exec(select(PageGroup)).all()}

    result = []
    for page in pages:
        page_dict = PageResponse.model_validate(page).model_dump()
        if page.group_id and page.group_id in groups:
            page_dict["group"] = PageGroupResponse.model_validate(
                groups[page.group_id]
            ).model_dump()
        else:
            page_dict["group"] = None
        result.append(page_dict)

    return ResponseModel(data=result)


@router.post("", response_model=ResponseModel)
def create_page(
    request: Request,
    data: PageCreate,
    session: Session = Depends(get_session),
):
    """创建页面"""
    if not require_admin(request):
        return ResponseModel.error(code=403, message="需要管理员权限")

    # 检查 key 是否重复
    existing = session.exec(select(Page).where(Page.key == data.key)).first()
    if existing:
        return ResponseModel.error(code=400, message=f"页面标识 '{data.key}' 已存在")

    # 检查分组是否存在
    if data.group_id:
        group = session.get(PageGroup, data.group_id)
        if not group:
            return ResponseModel.error(code=400, message="指定的分组不存在")

    page = Page(**data.model_dump())
    session.add(page)
    session.commit()
    session.refresh(page)

    logger.info(f"创建页面: {page.title} ({page.key})")
    return ResponseModel(message="创建成功", data=PageResponse.model_validate(page).model_dump())


@router.put("/{page_id}", response_model=ResponseModel)
def update_page(
    request: Request,
    page_id: int,
    data: PageUpdate,
    session: Session = Depends(get_session),
):
    """更新页面"""
    if not require_admin(request):
        return ResponseModel.error(code=403, message="需要管理员权限")

    page = session.get(Page, page_id)
    if not page:
        return ResponseModel.error(code=404, message="页面不存在")

    # 检查分组是否存在
    if data.group_id is not None and data.group_id != 0:
        group = session.get(PageGroup, data.group_id)
        if not group:
            return ResponseModel.error(code=400, message="指定的分组不存在")

    # 更新字段
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(page, key, value)

    page.updated_at = datetime.now()
    session.add(page)
    session.commit()
    session.refresh(page)

    logger.info(f"更新页面: {page.title} ({page.key})")
    return ResponseModel(message="更新成功", data=PageResponse.model_validate(page).model_dump())


@router.delete("/{page_id}", response_model=ResponseModel)
def delete_page(
    request: Request,
    page_id: int,
    session: Session = Depends(get_session),
):
    """删除页面"""
    if not require_admin(request):
        return ResponseModel.error(code=403, message="需要管理员权限")

    page = session.get(Page, page_id)
    if not page:
        return ResponseModel.error(code=404, message="页面不存在")

    session.delete(page)
    session.commit()

    logger.info(f"删除页面: {page.title} ({page.key})")
    return ResponseModel(message="删除成功")


@router.put("/reorder", response_model=ResponseModel)
def reorder_pages(
    request: Request,
    data: ReorderRequest,
    session: Session = Depends(get_session),
):
    """批量更新排序"""
    if not require_admin(request):
        return ResponseModel.error(code=403, message="需要管理员权限")

    # 更新页面排序
    if data.pages:
        for item in data.pages:
            page = session.get(Page, item.id)
            if page:
                page.order = item.order
                if item.group_id is not None:
                    page.group_id = item.group_id if item.group_id != 0 else None
                page.updated_at = datetime.now()
                session.add(page)

    # 更新分组排序
    if data.groups:
        for item in data.groups:
            group = session.get(PageGroup, item.id)
            if group:
                group.order = item.order
                group.updated_at = datetime.now()
                session.add(group)

    session.commit()
    logger.info("更新页面/分组排序")
    return ResponseModel(message="排序更新成功")


# ============================================================================
# 管理员 API - 分组管理
# ============================================================================


@group_router.get("", response_model=ResponseModel)
def get_all_groups(
    request: Request,
    session: Session = Depends(get_session),
):
    """获取所有分组"""
    if not require_admin(request):
        return ResponseModel.error(code=403, message="需要管理员权限")

    groups = session.exec(select(PageGroup).order_by(PageGroup.order)).all()
    return ResponseModel(
        data=[PageGroupResponse.model_validate(g).model_dump() for g in groups]
    )


@group_router.post("", response_model=ResponseModel)
def create_group(
    request: Request,
    data: PageGroupCreate,
    session: Session = Depends(get_session),
):
    """创建分组"""
    if not require_admin(request):
        return ResponseModel.error(code=403, message="需要管理员权限")

    group = PageGroup(**data.model_dump())
    session.add(group)
    session.commit()
    session.refresh(group)

    logger.info(f"创建分组: {group.title}")
    return ResponseModel(
        message="创建成功", data=PageGroupResponse.model_validate(group).model_dump()
    )


@group_router.put("/{group_id}", response_model=ResponseModel)
def update_group(
    request: Request,
    group_id: int,
    data: PageGroupUpdate,
    session: Session = Depends(get_session),
):
    """更新分组"""
    if not require_admin(request):
        return ResponseModel.error(code=403, message="需要管理员权限")

    group = session.get(PageGroup, group_id)
    if not group:
        return ResponseModel.error(code=404, message="分组不存在")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(group, key, value)

    group.updated_at = datetime.now()
    session.add(group)
    session.commit()
    session.refresh(group)

    logger.info(f"更新分组: {group.title}")
    return ResponseModel(
        message="更新成功", data=PageGroupResponse.model_validate(group).model_dump()
    )


@group_router.delete("/{group_id}", response_model=ResponseModel)
def delete_group(
    request: Request,
    group_id: int,
    session: Session = Depends(get_session),
):
    """删除分组

    删除分组时，该分组下的页面会变成未分组状态。
    """
    if not require_admin(request):
        return ResponseModel.error(code=403, message="需要管理员权限")

    group = session.get(PageGroup, group_id)
    if not group:
        return ResponseModel.error(code=404, message="分组不存在")

    # 将该分组下的页面移到未分组
    pages = session.exec(select(Page).where(Page.group_id == group_id)).all()
    for page in pages:
        page.group_id = None
        page.updated_at = datetime.now()
        session.add(page)

    session.delete(group)
    session.commit()

    logger.info(f"删除分组: {group.title}")
    return ResponseModel(message="删除成功")
