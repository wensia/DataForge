"""公众号分组管理 API

管理公众号分组，支持批量控制采集行为。
"""

from datetime import datetime

from fastapi import APIRouter, Depends
from sqlmodel import Session, func, select

from app.database import get_session
from app.models.wechat_account import WechatAccount
from app.models.wechat_account_group import (
    WechatAccountGroup,
    WechatAccountGroupCreate,
    WechatAccountGroupResponse,
    WechatAccountGroupUpdate,
)
from app.schemas.response import ResponseModel

router = APIRouter(prefix="/wechat-account-groups", tags=["公众号分组"])


@router.get("", response_model=ResponseModel)
def get_groups(
    session: Session = Depends(get_session),
):
    """获取公众号分组列表（按排序顺序）"""
    # 获取所有分组
    groups = session.exec(
        select(WechatAccountGroup).order_by(WechatAccountGroup.sort_order)
    ).all()

    # 统计每个分组的公众号数量
    result = []
    for group in groups:
        count = session.exec(
            select(func.count(WechatAccount.id)).where(
                WechatAccount.group_id == group.id
            )
        ).one()
        result.append(WechatAccountGroupResponse.from_model(group, count))

    return ResponseModel(data=result)


@router.post("", response_model=ResponseModel)
def create_group(
    data: WechatAccountGroupCreate,
    session: Session = Depends(get_session),
):
    """创建公众号分组"""
    # 检查名称是否重复
    existing = session.exec(
        select(WechatAccountGroup).where(WechatAccountGroup.name == data.name)
    ).first()
    if existing:
        return ResponseModel.error(code=400, message="分组名称已存在")

    group = WechatAccountGroup(
        name=data.name,
        description=data.description,
        is_collection_enabled=data.is_collection_enabled,
        sort_order=data.sort_order,
    )
    session.add(group)
    session.commit()
    session.refresh(group)

    return ResponseModel(
        message="创建成功",
        data=WechatAccountGroupResponse.from_model(group, 0),
    )


@router.get("/{group_id}", response_model=ResponseModel)
def get_group(
    group_id: int,
    session: Session = Depends(get_session),
):
    """获取单个分组详情"""
    group = session.get(WechatAccountGroup, group_id)
    if not group:
        return ResponseModel.error(code=404, message="分组不存在")

    count = session.exec(
        select(func.count(WechatAccount.id)).where(WechatAccount.group_id == group_id)
    ).one()

    return ResponseModel(data=WechatAccountGroupResponse.from_model(group, count))


@router.put("/{group_id}", response_model=ResponseModel)
def update_group(
    group_id: int,
    data: WechatAccountGroupUpdate,
    session: Session = Depends(get_session),
):
    """更新分组信息"""
    group = session.get(WechatAccountGroup, group_id)
    if not group:
        return ResponseModel.error(code=404, message="分组不存在")

    update_data = data.model_dump(exclude_unset=True)

    # 如果更新名称，检查是否重复
    if "name" in update_data and update_data["name"] != group.name:
        existing = session.exec(
            select(WechatAccountGroup).where(
                WechatAccountGroup.name == update_data["name"],
                WechatAccountGroup.id != group_id,
            )
        ).first()
        if existing:
            return ResponseModel.error(code=400, message="分组名称已存在")

    for key, value in update_data.items():
        setattr(group, key, value)

    group.updated_at = datetime.now()
    session.add(group)
    session.commit()
    session.refresh(group)

    count = session.exec(
        select(func.count(WechatAccount.id)).where(WechatAccount.group_id == group_id)
    ).one()

    return ResponseModel(
        message="更新成功",
        data=WechatAccountGroupResponse.from_model(group, count),
    )


@router.delete("/{group_id}", response_model=ResponseModel)
def delete_group(
    group_id: int,
    session: Session = Depends(get_session),
):
    """删除分组

    删除分组后，该分组下的公众号将变为"未分组"状态（group_id = None）。
    """
    group = session.get(WechatAccountGroup, group_id)
    if not group:
        return ResponseModel.error(code=404, message="分组不存在")

    # 将该分组下的公众号移动到未分组
    accounts = session.exec(
        select(WechatAccount).where(WechatAccount.group_id == group_id)
    ).all()
    for account in accounts:
        account.group_id = None
        session.add(account)

    session.delete(group)
    session.commit()

    return ResponseModel(message="删除成功")


@router.put("/{group_id}/toggle-collection", response_model=ResponseModel)
def toggle_group_collection(
    group_id: int,
    session: Session = Depends(get_session),
):
    """切换分组的采集状态"""
    group = session.get(WechatAccountGroup, group_id)
    if not group:
        return ResponseModel.error(code=404, message="分组不存在")

    group.is_collection_enabled = not group.is_collection_enabled
    group.updated_at = datetime.now()
    session.add(group)
    session.commit()
    session.refresh(group)

    count = session.exec(
        select(func.count(WechatAccount.id)).where(WechatAccount.group_id == group_id)
    ).one()

    status = "已启用" if group.is_collection_enabled else "已暂停"
    return ResponseModel(
        message=f"采集{status}",
        data=WechatAccountGroupResponse.from_model(group, count),
    )
