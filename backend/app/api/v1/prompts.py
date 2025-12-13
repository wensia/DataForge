"""快捷话术 API 路由

提供话术管理和分配功能：
- 管理员 CRUD 话术
- 管理员分配话术给用户
- 用户获取分配给自己的话术
"""

from fastapi import APIRouter, Depends
from sqlmodel import Session, select, func

from app.database import get_session
from app.models import (
    AssignUsersRequest,
    Prompt,
    PromptAssignment,
    PromptCreate,
    PromptUpdate,
    User,
)
from app.schemas.response import ResponseModel
from app.utils.jwt_auth import TokenPayload, get_current_user, require_admin

router = APIRouter(prefix="/prompts", tags=["prompts"])


# ============ 话术管理 API (仅管理员) ============


@router.get("", response_model=ResponseModel)
async def get_prompts(
    page: int = 1,
    page_size: int = 20,
    category: str | None = None,
    is_active: bool | None = None,
    search: str | None = None,
    session: Session = Depends(get_session),
    current_user: TokenPayload = Depends(require_admin),
):
    """获取话术列表（分页）"""
    query = select(Prompt)

    # 筛选条件
    if category:
        query = query.where(Prompt.category == category)
    if is_active is not None:
        query = query.where(Prompt.is_active == is_active)
    if search:
        query = query.where(
            Prompt.title.contains(search) | Prompt.content.contains(search)
        )

    # 计算总数
    count_query = select(func.count()).select_from(query.subquery())
    total = session.exec(count_query).one()

    # 排序和分页
    query = query.order_by(Prompt.sort_order, Prompt.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    prompts = session.exec(query).all()

    # 统计每个话术的分配数量
    result = []
    for prompt in prompts:
        assignment_count = session.exec(
            select(func.count()).where(PromptAssignment.prompt_id == prompt.id)
        ).one()
        prompt_dict = prompt.model_dump()
        prompt_dict["assigned_count"] = assignment_count
        result.append(prompt_dict)

    return ResponseModel.success(
        data={
            "items": result,
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": (total + page_size - 1) // page_size,
        }
    )


@router.post("", response_model=ResponseModel)
async def create_prompt(
    data: PromptCreate,
    session: Session = Depends(get_session),
    current_user: TokenPayload = Depends(require_admin),
):
    """创建话术"""
    prompt = Prompt(
        **data.model_dump(),
        created_by=current_user.user_id,
    )
    session.add(prompt)
    session.commit()
    session.refresh(prompt)

    return ResponseModel.success(data=prompt.model_dump(), message="创建成功")


@router.get("/categories", response_model=ResponseModel)
async def get_categories(
    session: Session = Depends(get_session),
    current_user: TokenPayload = Depends(require_admin),
):
    """获取所有分类"""
    query = select(Prompt.category).where(Prompt.category.isnot(None)).distinct()
    categories = session.exec(query).all()
    return ResponseModel.success(data=[c for c in categories if c])


@router.get("/my", response_model=ResponseModel)
async def get_my_prompts(
    session: Session = Depends(get_session),
    current_user: TokenPayload = Depends(get_current_user),
):
    """获取分配给当前用户的话术列表"""
    query = (
        select(Prompt)
        .join(PromptAssignment, Prompt.id == PromptAssignment.prompt_id)
        .where(PromptAssignment.user_id == current_user.user_id)
        .where(Prompt.is_active == True)
        .order_by(Prompt.sort_order, Prompt.created_at.desc())
    )

    prompts = session.exec(query).all()
    return ResponseModel.success(data=[p.model_dump() for p in prompts])


@router.get("/{prompt_id}", response_model=ResponseModel)
async def get_prompt(
    prompt_id: int,
    session: Session = Depends(get_session),
    current_user: TokenPayload = Depends(require_admin),
):
    """获取话术详情"""
    prompt = session.get(Prompt, prompt_id)
    if not prompt:
        return ResponseModel.error(message="话术不存在", code=404)

    # 获取分配的用户列表
    query = (
        select(PromptAssignment, User)
        .join(User, PromptAssignment.user_id == User.id)
        .where(PromptAssignment.prompt_id == prompt_id)
    )
    assignments = session.exec(query).all()

    assigned_users = [
        {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "assignment_id": assignment.id,
            "assigned_at": assignment.created_at.isoformat(),
        }
        for assignment, user in assignments
    ]

    result = prompt.model_dump()
    result["assigned_users"] = assigned_users
    result["assigned_count"] = len(assigned_users)

    return ResponseModel.success(data=result)


@router.put("/{prompt_id}", response_model=ResponseModel)
async def update_prompt(
    prompt_id: int,
    data: PromptUpdate,
    session: Session = Depends(get_session),
    current_user: TokenPayload = Depends(require_admin),
):
    """更新话术"""
    prompt = session.get(Prompt, prompt_id)
    if not prompt:
        return ResponseModel.error(message="话术不存在", code=404)

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(prompt, key, value)

    session.add(prompt)
    session.commit()
    session.refresh(prompt)

    return ResponseModel.success(data=prompt.model_dump(), message="更新成功")


@router.delete("/{prompt_id}", response_model=ResponseModel)
async def delete_prompt(
    prompt_id: int,
    session: Session = Depends(get_session),
    current_user: TokenPayload = Depends(require_admin),
):
    """删除话术"""
    prompt = session.get(Prompt, prompt_id)
    if not prompt:
        return ResponseModel.error(message="话术不存在", code=404)

    # 删除关联的分配记录
    session.exec(
        select(PromptAssignment).where(PromptAssignment.prompt_id == prompt_id)
    )
    for assignment in session.exec(
        select(PromptAssignment).where(PromptAssignment.prompt_id == prompt_id)
    ).all():
        session.delete(assignment)

    session.delete(prompt)
    session.commit()

    return ResponseModel.success(message="删除成功")


# ============ 话术分配 API (仅管理员) ============


@router.get("/{prompt_id}/assignments", response_model=ResponseModel)
async def get_prompt_assignments(
    prompt_id: int,
    session: Session = Depends(get_session),
    current_user: TokenPayload = Depends(require_admin),
):
    """获取话术的用户分配列表"""
    prompt = session.get(Prompt, prompt_id)
    if not prompt:
        return ResponseModel.error(message="话术不存在", code=404)

    query = (
        select(PromptAssignment, User)
        .join(User, PromptAssignment.user_id == User.id)
        .where(PromptAssignment.prompt_id == prompt_id)
    )
    assignments = session.exec(query).all()

    result = [
        {
            "id": assignment.id,
            "prompt_id": assignment.prompt_id,
            "user_id": user.id,
            "user_name": user.name,
            "user_email": user.email,
            "created_at": assignment.created_at.isoformat(),
        }
        for assignment, user in assignments
    ]

    return ResponseModel.success(data=result)


@router.post("/{prompt_id}/assignments", response_model=ResponseModel)
async def assign_users(
    prompt_id: int,
    data: AssignUsersRequest,
    session: Session = Depends(get_session),
    current_user: TokenPayload = Depends(require_admin),
):
    """批量分配用户到话术"""
    prompt = session.get(Prompt, prompt_id)
    if not prompt:
        return ResponseModel.error(message="话术不存在", code=404)

    # 获取已分配的用户 ID
    existing_query = select(PromptAssignment.user_id).where(
        PromptAssignment.prompt_id == prompt_id
    )
    existing_user_ids = set(session.exec(existing_query).all())

    # 添加新的分配
    added = 0
    for user_id in data.user_ids:
        if user_id not in existing_user_ids:
            # 验证用户存在
            user = session.get(User, user_id)
            if user:
                assignment = PromptAssignment(prompt_id=prompt_id, user_id=user_id)
                session.add(assignment)
                added += 1

    session.commit()

    return ResponseModel.success(
        message=f"成功分配 {added} 个用户",
        data={"added": added, "total_requested": len(data.user_ids)},
    )


@router.delete("/{prompt_id}/assignments", response_model=ResponseModel)
async def unassign_users(
    prompt_id: int,
    data: AssignUsersRequest,
    session: Session = Depends(get_session),
    current_user: TokenPayload = Depends(require_admin),
):
    """批量取消分配用户"""
    prompt = session.get(Prompt, prompt_id)
    if not prompt:
        return ResponseModel.error(message="话术不存在", code=404)

    # 删除分配记录
    removed = 0
    for user_id in data.user_ids:
        assignment = session.exec(
            select(PromptAssignment).where(
                PromptAssignment.prompt_id == prompt_id,
                PromptAssignment.user_id == user_id,
            )
        ).first()
        if assignment:
            session.delete(assignment)
            removed += 1

    session.commit()

    return ResponseModel.success(
        message=f"成功取消分配 {removed} 个用户",
        data={"removed": removed, "total_requested": len(data.user_ids)},
    )
