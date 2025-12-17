"""公众号标签管理 API

管理公众号标签，支持多对多关系。
"""

from datetime import datetime

from fastapi import APIRouter, Depends
from sqlmodel import Session, func, select

from app.database import get_session
from app.models.wechat_account_tag import (
    WechatAccountTag,
    WechatAccountTagCreate,
    WechatAccountTagLink,
    WechatAccountTagResponse,
    WechatAccountTagUpdate,
)
from app.schemas.response import ResponseModel

router = APIRouter(prefix="/wechat-account-tags", tags=["公众号标签"])


@router.get("", response_model=ResponseModel)
def get_tags(
    session: Session = Depends(get_session),
):
    """获取公众号标签列表（按排序顺序）"""
    tags = session.exec(
        select(WechatAccountTag).order_by(WechatAccountTag.sort_order)
    ).all()

    result = []
    for tag in tags:
        # 统计每个标签关联的公众号数量
        count = session.exec(
            select(func.count(WechatAccountTagLink.id)).where(
                WechatAccountTagLink.tag_id == tag.id
            )
        ).one()
        result.append(WechatAccountTagResponse.from_model(tag, count))

    return ResponseModel(data=result)


@router.post("", response_model=ResponseModel)
def create_tag(
    data: WechatAccountTagCreate,
    session: Session = Depends(get_session),
):
    """创建公众号标签"""
    # 检查名称是否重复
    existing = session.exec(
        select(WechatAccountTag).where(WechatAccountTag.name == data.name)
    ).first()
    if existing:
        return ResponseModel.error(code=400, message="标签名称已存在")

    tag = WechatAccountTag(
        name=data.name,
        color=data.color,
        sort_order=data.sort_order,
    )
    session.add(tag)
    session.commit()
    session.refresh(tag)

    return ResponseModel(
        message="创建成功",
        data=WechatAccountTagResponse.from_model(tag, 0),
    )


@router.get("/{tag_id}", response_model=ResponseModel)
def get_tag(
    tag_id: int,
    session: Session = Depends(get_session),
):
    """获取单个标签详情"""
    tag = session.get(WechatAccountTag, tag_id)
    if not tag:
        return ResponseModel.error(code=404, message="标签不存在")

    count = session.exec(
        select(func.count(WechatAccountTagLink.id)).where(
            WechatAccountTagLink.tag_id == tag_id
        )
    ).one()

    return ResponseModel(data=WechatAccountTagResponse.from_model(tag, count))


@router.put("/{tag_id}", response_model=ResponseModel)
def update_tag(
    tag_id: int,
    data: WechatAccountTagUpdate,
    session: Session = Depends(get_session),
):
    """更新标签信息"""
    tag = session.get(WechatAccountTag, tag_id)
    if not tag:
        return ResponseModel.error(code=404, message="标签不存在")

    update_data = data.model_dump(exclude_unset=True)

    # 如果更新名称，检查是否重复
    if "name" in update_data and update_data["name"] != tag.name:
        existing = session.exec(
            select(WechatAccountTag).where(
                WechatAccountTag.name == update_data["name"],
                WechatAccountTag.id != tag_id,
            )
        ).first()
        if existing:
            return ResponseModel.error(code=400, message="标签名称已存在")

    for key, value in update_data.items():
        setattr(tag, key, value)

    tag.updated_at = datetime.now()
    session.add(tag)
    session.commit()
    session.refresh(tag)

    count = session.exec(
        select(func.count(WechatAccountTagLink.id)).where(
            WechatAccountTagLink.tag_id == tag_id
        )
    ).one()

    return ResponseModel(
        message="更新成功",
        data=WechatAccountTagResponse.from_model(tag, count),
    )


@router.delete("/{tag_id}", response_model=ResponseModel)
def delete_tag(
    tag_id: int,
    session: Session = Depends(get_session),
):
    """删除标签

    删除标签时会自动删除关联记录（ON DELETE CASCADE）。
    """
    tag = session.get(WechatAccountTag, tag_id)
    if not tag:
        return ResponseModel.error(code=404, message="标签不存在")

    # 手动删除关联记录（确保删除成功）
    links = session.exec(
        select(WechatAccountTagLink).where(WechatAccountTagLink.tag_id == tag_id)
    ).all()
    for link in links:
        session.delete(link)

    session.delete(tag)
    session.commit()

    return ResponseModel(message="删除成功")
