"""公众号账号管理 API

管理微信公众号账号，支持分组和采集控制。
"""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from loguru import logger
from pydantic import BaseModel
from sqlmodel import Session, func, or_, select

from app.database import get_session
from app.models.wechat_account import (
    BatchMoveGroupRequest,
    MoveGroupRequest,
    WechatAccount,
    WechatAccountCreate,
    WechatAccountResponse,
    WechatAccountUpdate,
)
from app.models.wechat_account_group import WechatAccountGroup
from app.schemas.response import ResponseModel
from app.services.avatar_service import download_avatar_if_needed
from app.services.wechat_article_parser import (
    WechatArticleParseError,
    parse_wechat_article_url,
)


class ParseUrlRequest(BaseModel):
    """解析 URL 请求"""

    url: str


class ParseUrlResponse(BaseModel):
    """解析 URL 响应"""

    biz: str
    name: str
    avatar_url: str | None = None
    user_name: str | None = None

router = APIRouter(prefix="/wechat-accounts", tags=["公众号账号"])


@router.post("/parse-url", response_model=ResponseModel)
async def parse_article_url(data: ParseUrlRequest):
    """从微信公众号文章链接解析公众号信息

    支持的 URL 格式:
    - 长链接: https://mp.weixin.qq.com/s?__biz=xxx&mid=...
    - 短链接: https://mp.weixin.qq.com/s/xxx
    """
    try:
        result = await parse_wechat_article_url(data.url)
        return ResponseModel(
            data=ParseUrlResponse(
                biz=result.biz,
                name=result.name,
                avatar_url=result.avatar_url,
                user_name=result.user_name,
            )
        )
    except WechatArticleParseError as e:
        return ResponseModel.error(code=400, message=str(e))
    except Exception as e:
        return ResponseModel.error(code=500, message=f"解析失败: {e}")


def _get_account_with_group_name(
    account: WechatAccount, session: Session
) -> WechatAccountResponse:
    """获取公众号响应（包含分组名称）"""
    group_name = None
    if account.group_id:
        group = session.get(WechatAccountGroup, account.group_id)
        if group:
            group_name = group.name
    return WechatAccountResponse.from_model(account, group_name)


@router.get("", response_model=ResponseModel)
def get_accounts(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(50, ge=1, le=200, description="每页数量"),
    group_id: int | None = Query(None, description="按分组筛选"),
    is_collection_enabled: bool | None = Query(None, description="按采集状态筛选"),
    search: str | None = Query(None, description="搜索名称或 biz"),
    session: Session = Depends(get_session),
):
    """获取公众号列表"""
    query = select(WechatAccount)

    # 筛选条件
    if group_id is not None:
        query = query.where(WechatAccount.group_id == group_id)
    if is_collection_enabled is not None:
        query = query.where(WechatAccount.is_collection_enabled == is_collection_enabled)
    if search:
        query = query.where(
            or_(
                WechatAccount.name.contains(search),
                WechatAccount.biz.contains(search),
            )
        )

    # 统计总数
    count_query = select(func.count(WechatAccount.id))
    if group_id is not None:
        count_query = count_query.where(WechatAccount.group_id == group_id)
    if is_collection_enabled is not None:
        count_query = count_query.where(
            WechatAccount.is_collection_enabled == is_collection_enabled
        )
    if search:
        count_query = count_query.where(
            or_(
                WechatAccount.name.contains(search),
                WechatAccount.biz.contains(search),
            )
        )
    total = session.exec(count_query).one()

    # 分页
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size).order_by(WechatAccount.created_at.desc())
    accounts = session.exec(query).all()

    return ResponseModel(
        data={
            "items": [_get_account_with_group_name(a, session) for a in accounts],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@router.get("/grouped", response_model=ResponseModel)
def get_accounts_grouped(
    session: Session = Depends(get_session),
):
    """获取按分组组织的公众号列表（用于树形展示）"""
    # 获取所有分组
    groups = session.exec(
        select(WechatAccountGroup).order_by(WechatAccountGroup.sort_order)
    ).all()

    result = []

    # 每个分组及其公众号
    for group in groups:
        accounts = session.exec(
            select(WechatAccount)
            .where(WechatAccount.group_id == group.id)
            .order_by(WechatAccount.name)
        ).all()

        result.append({
            "group": {
                "id": group.id,
                "name": group.name,
                "description": group.description,
                "is_collection_enabled": group.is_collection_enabled,
                "sort_order": group.sort_order,
            },
            "accounts": [
                WechatAccountResponse.from_model(a, group.name) for a in accounts
            ],
        })

    # 未分组的公众号
    ungrouped_accounts = session.exec(
        select(WechatAccount)
        .where(WechatAccount.group_id.is_(None))
        .order_by(WechatAccount.name)
    ).all()

    result.append({
        "group": {
            "id": None,
            "name": "未分组",
            "description": None,
            "is_collection_enabled": True,
            "sort_order": 9999,
        },
        "accounts": [
            WechatAccountResponse.from_model(a, None) for a in ungrouped_accounts
        ],
    })

    return ResponseModel(data=result)


@router.post("", response_model=ResponseModel)
async def create_account(
    data: WechatAccountCreate,
    session: Session = Depends(get_session),
):
    """添加公众号"""
    # 检查 biz 是否已存在
    existing = session.exec(
        select(WechatAccount).where(WechatAccount.biz == data.biz)
    ).first()
    if existing:
        return ResponseModel.error(code=400, message="该公众号已存在")

    # 验证分组是否存在
    if data.group_id:
        group = session.get(WechatAccountGroup, data.group_id)
        if not group:
            return ResponseModel.error(code=400, message="指定的分组不存在")

    # 下载头像到本地
    local_avatar = None
    if data.avatar_url:
        local_avatar = await download_avatar_if_needed(data.avatar_url, data.biz)

    account = WechatAccount(
        biz=data.biz,
        name=data.name,
        avatar_url=data.avatar_url,
        local_avatar=local_avatar,
        group_id=data.group_id,
        is_collection_enabled=data.is_collection_enabled,
        collection_frequency=data.collection_frequency,
        notes=data.notes,
    )
    session.add(account)
    session.commit()
    session.refresh(account)

    return ResponseModel(
        message="添加成功",
        data=_get_account_with_group_name(account, session),
    )


@router.get("/{account_id}", response_model=ResponseModel)
def get_account(
    account_id: int,
    session: Session = Depends(get_session),
):
    """获取单个公众号详情"""
    account = session.get(WechatAccount, account_id)
    if not account:
        return ResponseModel.error(code=404, message="公众号不存在")

    return ResponseModel(data=_get_account_with_group_name(account, session))


@router.put("/{account_id}", response_model=ResponseModel)
async def update_account(
    account_id: int,
    data: WechatAccountUpdate,
    session: Session = Depends(get_session),
):
    """更新公众号信息"""
    account = session.get(WechatAccount, account_id)
    if not account:
        return ResponseModel.error(code=404, message="公众号不存在")

    update_data = data.model_dump(exclude_unset=True)

    # 验证分组是否存在
    if "group_id" in update_data and update_data["group_id"] is not None:
        group = session.get(WechatAccountGroup, update_data["group_id"])
        if not group:
            return ResponseModel.error(code=400, message="指定的分组不存在")

    # 如果头像 URL 变化了，重新下载
    if "avatar_url" in update_data and update_data["avatar_url"] != account.avatar_url:
        local_avatar = await download_avatar_if_needed(
            update_data["avatar_url"], account.biz
        )
        update_data["local_avatar"] = local_avatar

    for key, value in update_data.items():
        setattr(account, key, value)

    account.updated_at = datetime.now()
    session.add(account)
    session.commit()
    session.refresh(account)

    return ResponseModel(
        message="更新成功",
        data=_get_account_with_group_name(account, session),
    )


@router.delete("/{account_id}", response_model=ResponseModel)
def delete_account(
    account_id: int,
    session: Session = Depends(get_session),
):
    """删除公众号"""
    account = session.get(WechatAccount, account_id)
    if not account:
        return ResponseModel.error(code=404, message="公众号不存在")

    session.delete(account)
    session.commit()

    return ResponseModel(message="删除成功")


@router.put("/{account_id}/toggle-collection", response_model=ResponseModel)
def toggle_account_collection(
    account_id: int,
    session: Session = Depends(get_session),
):
    """切换公众号的采集状态"""
    account = session.get(WechatAccount, account_id)
    if not account:
        return ResponseModel.error(code=404, message="公众号不存在")

    account.is_collection_enabled = not account.is_collection_enabled
    account.updated_at = datetime.now()
    session.add(account)
    session.commit()
    session.refresh(account)

    status = "已启用" if account.is_collection_enabled else "已暂停"
    return ResponseModel(
        message=f"采集{status}",
        data=_get_account_with_group_name(account, session),
    )


@router.put("/{account_id}/move-group", response_model=ResponseModel)
def move_account_to_group(
    account_id: int,
    data: MoveGroupRequest,
    session: Session = Depends(get_session),
):
    """移动公众号到其他分组"""
    account = session.get(WechatAccount, account_id)
    if not account:
        return ResponseModel.error(code=404, message="公众号不存在")

    # 验证目标分组
    if data.group_id is not None:
        group = session.get(WechatAccountGroup, data.group_id)
        if not group:
            return ResponseModel.error(code=400, message="目标分组不存在")

    account.group_id = data.group_id
    account.updated_at = datetime.now()
    session.add(account)
    session.commit()
    session.refresh(account)

    return ResponseModel(
        message="移动成功",
        data=_get_account_with_group_name(account, session),
    )


@router.post("/batch-move-group", response_model=ResponseModel)
def batch_move_to_group(
    data: BatchMoveGroupRequest,
    session: Session = Depends(get_session),
):
    """批量移动公众号到其他分组"""
    if not data.account_ids:
        return ResponseModel.error(code=400, message="请选择要移动的公众号")

    # 验证目标分组
    if data.group_id is not None:
        group = session.get(WechatAccountGroup, data.group_id)
        if not group:
            return ResponseModel.error(code=400, message="目标分组不存在")

    # 批量更新
    accounts = session.exec(
        select(WechatAccount).where(WechatAccount.id.in_(data.account_ids))
    ).all()

    for account in accounts:
        account.group_id = data.group_id
        account.updated_at = datetime.now()
        session.add(account)

    session.commit()

    return ResponseModel(message=f"已移动 {len(accounts)} 个公众号")


@router.post("/sync-avatars", response_model=ResponseModel)
async def sync_avatars(
    session: Session = Depends(get_session),
):
    """批量同步所有公众号头像到本地

    遍历所有有 avatar_url 但没有 local_avatar 的公众号，下载头像到本地。
    """
    # 查找需要同步的公众号
    accounts = session.exec(
        select(WechatAccount).where(
            WechatAccount.avatar_url.isnot(None),
            WechatAccount.local_avatar.is_(None),
        )
    ).all()

    if not accounts:
        return ResponseModel(message="所有头像已同步", data={"synced": 0, "failed": 0})

    synced = 0
    failed = 0

    for account in accounts:
        try:
            local_avatar = await download_avatar_if_needed(
                account.avatar_url, account.biz, account.local_avatar
            )
            if local_avatar:
                account.local_avatar = local_avatar
                account.updated_at = datetime.now()
                session.add(account)
                synced += 1
                logger.info(f"同步头像成功: {account.name} ({account.biz})")
            else:
                failed += 1
                logger.warning(f"同步头像失败: {account.name} ({account.biz})")
        except Exception as e:
            failed += 1
            logger.error(f"同步头像异常: {account.name} ({account.biz}), 错误: {e}")

    session.commit()

    return ResponseModel(
        message=f"同步完成：成功 {synced} 个，失败 {failed} 个",
        data={"synced": synced, "failed": failed},
    )
