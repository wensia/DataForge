"""微信公众号文章管理

管理从极致了 API 采集的公众号文章数据。
"""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlmodel import Session, func, select

from app.database import get_session
from app.models.dajiala_config import DajialaConfig
from app.models.wechat_article import (
    WechatArticle,
    WechatArticleResponse,
)
from app.schemas.response import ResponseModel
from app.services.dajiala_article_service import fetch_wechat_articles

router = APIRouter(prefix="/wechat-articles", tags=["微信公众号文章"])


class FetchArticlesRequest(BaseModel):
    """采集文章请求"""

    biz: str | None = None
    url: str | None = None
    name: str | None = None
    pages: int = 1  # 采集页数


class DeleteArticlesRequest(BaseModel):
    """删除文章请求"""

    article_ids: list[int]


@router.get("", response_model=ResponseModel)
def get_wechat_articles(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    biz: str | None = None,
    account_name: str | None = None,
    title: str | None = None,
    start_time: str | None = None,
    end_time: str | None = None,
    is_original: bool | None = None,
    config_id: int | None = None,
    session: Session = Depends(get_session),
):
    """获取微信公众号文章列表"""
    query = select(WechatArticle)

    # 筛选条件
    if biz:
        query = query.where(WechatArticle.biz == biz)
    if account_name:
        query = query.where(WechatArticle.account_name.contains(account_name))
    if title:
        query = query.where(WechatArticle.title.contains(title))
    if start_time:
        try:
            start_dt = datetime.strptime(start_time, "%Y-%m-%d")
            query = query.where(WechatArticle.post_time >= start_dt)
        except ValueError:
            pass
    if end_time:
        try:
            end_dt = datetime.strptime(end_time, "%Y-%m-%d")
            # 包含当天，设置为次日零点
            end_dt = end_dt.replace(hour=23, minute=59, second=59)
            query = query.where(WechatArticle.post_time <= end_dt)
        except ValueError:
            pass
    if is_original is not None:
        query = query.where(WechatArticle.is_original == is_original)
    if config_id:
        query = query.where(WechatArticle.config_id == config_id)

    # 统计总数
    count_query = select(func.count()).select_from(query.subquery())
    total = session.exec(count_query).one()

    # 分页和排序
    query = query.order_by(WechatArticle.post_time.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    articles = session.exec(query).all()

    return ResponseModel(
        data={
            "items": [
                WechatArticleResponse.model_validate(a, from_attributes=True)
                for a in articles
            ],
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": (total + page_size - 1) // page_size if total > 0 else 0,
        }
    )


@router.get("/filter-options", response_model=ResponseModel)
def get_filter_options(
    session: Session = Depends(get_session),
):
    """获取筛选选项（公众号列表等）"""
    # 获取所有公众号名称
    account_names = session.exec(
        select(WechatArticle.account_name)
        .where(WechatArticle.account_name.isnot(None))
        .distinct()
    ).all()

    # 获取所有 biz
    bizs = session.exec(select(WechatArticle.biz).distinct()).all()

    return ResponseModel(
        data={
            "account_names": [n for n in account_names if n],
            "bizs": bizs,
        }
    )


@router.get("/{article_id}", response_model=ResponseModel)
def get_wechat_article(
    article_id: int,
    session: Session = Depends(get_session),
):
    """获取单篇微信公众号文章"""
    article = session.get(WechatArticle, article_id)
    if not article:
        return ResponseModel.error(code=404, message="文章不存在")

    return ResponseModel(
        data=WechatArticleResponse.model_validate(article, from_attributes=True)
    )


@router.delete("", response_model=ResponseModel)
def delete_wechat_articles(
    data: DeleteArticlesRequest,
    session: Session = Depends(get_session),
):
    """批量删除微信公众号文章"""
    if not data.article_ids:
        return ResponseModel.error(code=400, message="请选择要删除的文章")

    deleted_count = 0
    for article_id in data.article_ids:
        article = session.get(WechatArticle, article_id)
        if article:
            session.delete(article)
            deleted_count += 1

    session.commit()

    return ResponseModel(
        message=f"成功删除 {deleted_count} 篇文章",
        data={"deleted_count": deleted_count},
    )


@router.post("/fetch", response_model=ResponseModel)
async def fetch_articles(
    config_id: int,
    data: FetchArticlesRequest,
    session: Session = Depends(get_session),
):
    """使用指定配置采集公众号文章

    Args:
        config_id: 极致了配置 ID
        data: 采集参数（biz/url/name 三选一，pages 采集页数）
    """
    # 获取配置
    config = session.get(DajialaConfig, config_id)
    if not config:
        return ResponseModel.error(code=404, message="配置不存在")

    if not config.is_active:
        return ResponseModel.error(code=400, message="该配置已禁用")

    # 参数校验
    if not data.biz and not data.url and not data.name:
        return ResponseModel.error(code=400, message="请提供公众号 biz、url 或名称")

    # 采集文章
    total_fetched = 0
    total_saved = 0
    total_skipped = 0
    account_name = None
    account_biz = data.biz

    for page in range(1, data.pages + 1):
        result = await fetch_wechat_articles(
            api_key=config.api_key,
            biz=data.biz,
            url=data.url,
            name=data.name,
            verify_code=config.verify_code,
            page=page,
        )

        if not result["success"]:
            if page == 1:
                return ResponseModel.error(code=400, message=result["message"])
            break

        article_list = result["article_list"]
        if not article_list:
            break

        # 获取公众号信息
        if not account_name and result.get("account_name"):
            account_name = result["account_name"]
        if not account_biz and result.get("account_biz"):
            account_biz = result["account_biz"]

        total_fetched += len(article_list)

        # 保存文章到数据库
        for article_data in article_list:
            # 检查是否已存在
            existing = session.exec(
                select(WechatArticle).where(
                    WechatArticle.article_url == article_data["url"]
                )
            ).first()

            if existing:
                total_skipped += 1
                continue

            # 创建新文章
            article = WechatArticle(
                biz=account_biz or "",
                article_url=article_data["url"],
                title=article_data["title"],
                cover_url=article_data.get("cover_url"),
                post_time=article_data["post_time"],
                position=article_data.get("position"),
                is_original=article_data.get("is_original", False),
                item_show_type=article_data.get("item_show_type"),
                config_id=config_id,
                account_name=account_name,
                raw_data=article_data.get("raw_data", {}),
            )
            session.add(article)
            total_saved += 1

        session.commit()

        # 没有下一页了
        if not result.get("has_next"):
            break

    # 更新配置余额
    if result.get("remain_money") is not None:
        config.remain_money = result["remain_money"]
        config.last_verified_at = datetime.now()
        session.add(config)
        session.commit()

    return ResponseModel(
        message=f"采集完成：获取 {total_fetched} 篇，保存 {total_saved} 篇，跳过 {total_skipped} 篇（已存在）",
        data={
            "total_fetched": total_fetched,
            "total_saved": total_saved,
            "total_skipped": total_skipped,
            "account_name": account_name,
            "account_biz": account_biz,
            "remain_money": result.get("remain_money"),
        },
    )
