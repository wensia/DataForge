"""公众号账号管理 API

管理微信公众号账号，支持标签分类和采集控制。
"""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from loguru import logger
from pydantic import BaseModel
from sqlmodel import Session, func, or_, select

from app.database import get_session
from app.models.wechat_account import (
    WechatAccount,
    WechatAccountCreate,
    WechatAccountResponse,
    WechatAccountUpdate,
)
from app.models.wechat_account_tag import (
    AssignTagsRequest,
    WechatAccountTag,
    WechatAccountTagBrief,
    WechatAccountTagLink,
)
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


def _get_account_tags(
    account_id: int, session: Session
) -> list[WechatAccountTagBrief]:
    """获取公众号的标签列表"""
    links = session.exec(
        select(WechatAccountTagLink).where(
            WechatAccountTagLink.account_id == account_id
        )
    ).all()

    tags = []
    for link in links:
        tag = session.get(WechatAccountTag, link.tag_id)
        if tag:
            tags.append(
                WechatAccountTagBrief(id=tag.id, name=tag.name, color=tag.color)
            )

    return tags


def _get_account_response(
    account: WechatAccount, session: Session
) -> WechatAccountResponse:
    """获取公众号响应（包含标签）"""
    tags = _get_account_tags(account.id, session)
    return WechatAccountResponse.from_model(account, tags)


def _update_account_tags(account_id: int, tag_ids: list[int], session: Session):
    """更新公众号的标签关联"""
    # 删除现有关联
    existing_links = session.exec(
        select(WechatAccountTagLink).where(
            WechatAccountTagLink.account_id == account_id
        )
    ).all()
    for link in existing_links:
        session.delete(link)

    # 创建新关联
    for tag_id in tag_ids:
        # 验证标签存在
        tag = session.get(WechatAccountTag, tag_id)
        if tag:
            link = WechatAccountTagLink(account_id=account_id, tag_id=tag_id)
            session.add(link)


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


@router.get("", response_model=ResponseModel)
def get_accounts(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(50, ge=1, le=200, description="每页数量"),
    tag_ids: str | None = Query(None, description="按标签筛选（逗号分隔）"),
    is_collection_enabled: bool | None = Query(None, description="按采集状态筛选"),
    search: str | None = Query(None, description="搜索名称或 biz"),
    session: Session = Depends(get_session),
):
    """获取公众号列表

    tag_ids 参数说明：
    - 传入逗号分隔的标签 ID，如 "1,2,3"
    - 使用 OR 逻辑：公众号只要包含任一选中标签即显示
    """
    # 解析标签 ID 列表
    tag_id_list = []
    if tag_ids:
        try:
            tag_id_list = [int(x.strip()) for x in tag_ids.split(",") if x.strip()]
        except ValueError:
            return ResponseModel.error(code=400, message="tag_ids 格式错误，应为逗号分隔的数字")

    # 基础查询
    query = select(WechatAccount)

    # 标签筛选（OR 逻辑）
    if tag_id_list:
        # 查找关联了任一标签的公众号 ID
        account_ids_query = (
            select(WechatAccountTagLink.account_id)
            .where(WechatAccountTagLink.tag_id.in_(tag_id_list))
            .distinct()
        )
        account_ids = session.exec(account_ids_query).all()
        if account_ids:
            query = query.where(WechatAccount.id.in_(account_ids))
        else:
            # 没有匹配的公众号
            return ResponseModel(
                data={
                    "items": [],
                    "total": 0,
                    "page": page,
                    "page_size": page_size,
                }
            )

    # 其他筛选条件
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
    count_query = select(func.count()).select_from(query.subquery())
    total = session.exec(count_query).one()

    # 分页
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size).order_by(WechatAccount.created_at.desc())
    accounts = session.exec(query).all()

    return ResponseModel(
        data={
            "items": [_get_account_response(a, session) for a in accounts],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


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

    # 下载头像到本地
    local_avatar = None
    if data.avatar_url:
        local_avatar = await download_avatar_if_needed(data.avatar_url, data.biz)

    account = WechatAccount(
        biz=data.biz,
        name=data.name,
        avatar_url=data.avatar_url,
        local_avatar=local_avatar,
        is_collection_enabled=data.is_collection_enabled,
        collection_frequency=data.collection_frequency,
        notes=data.notes,
    )
    session.add(account)
    session.commit()
    session.refresh(account)

    # 创建标签关联
    if data.tag_ids:
        _update_account_tags(account.id, data.tag_ids, session)
        session.commit()

    return ResponseModel(
        message="添加成功",
        data=_get_account_response(account, session),
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

    return ResponseModel(data=_get_account_response(account, session))


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

    # 处理标签更新
    if "tag_ids" in update_data:
        tag_ids = update_data.pop("tag_ids")
        _update_account_tags(account_id, tag_ids, session)

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
        data=_get_account_response(account, session),
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

    # 删除标签关联
    links = session.exec(
        select(WechatAccountTagLink).where(WechatAccountTagLink.account_id == account_id)
    ).all()
    for link in links:
        session.delete(link)

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
        data=_get_account_response(account, session),
    )


@router.put("/{account_id}/tags", response_model=ResponseModel)
def update_account_tags(
    account_id: int,
    data: AssignTagsRequest,
    session: Session = Depends(get_session),
):
    """更新公众号的标签"""
    account = session.get(WechatAccount, account_id)
    if not account:
        return ResponseModel.error(code=404, message="公众号不存在")

    _update_account_tags(account_id, data.tag_ids, session)
    account.updated_at = datetime.now()
    session.add(account)
    session.commit()
    session.refresh(account)

    return ResponseModel(
        message="标签更新成功",
        data=_get_account_response(account, session),
    )


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
