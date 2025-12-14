"""数据分析 API 路由

提供数据查询、同步、AI 分析等接口。
"""

from datetime import datetime

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from loguru import logger
from sqlmodel import Session

from app.database import get_session
from app.models.analysis_result import (
    AnalysisRequest,
    AnalysisResultResponse,
    ChatRequest,
)
from app.models.call_record import CallRecordResponse, CallRecordStats
from app.schemas.response import ResponseModel
from app.services import ai_analysis_service as ai_svc
from app.services import data_sync_service as sync_svc
from app.utils.jwt_auth import TokenPayload, require_admin

router = APIRouter(prefix="/analysis", tags=["数据分析"])


# ============ 数据查询接口 ============


@router.get("/filter-options", response_model=ResponseModel)
async def get_filter_options(
    session: Session = Depends(get_session),
) -> ResponseModel:
    """获取筛选选项（员工列表等）

    Returns:
        ResponseModel: 包含员工列表等筛选选项
    """
    staff_names = sync_svc.get_unique_staff_names(session)
    return ResponseModel(
        data={
            "staff_names": staff_names,
        }
    )


@router.get("/records", response_model=ResponseModel)
async def get_records(
    source: str | None = None,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    department: str | None = None,
    staff_name: str | None = None,
    call_type: str | None = None,
    call_result: str | None = None,
    callee: str | None = None,
    duration_min: int | None = Query(None, ge=0, description="最小通话时长（秒）"),
    duration_max: int | None = Query(None, ge=0, description="最大通话时长（秒）"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=1000),
    session: Session = Depends(get_session),
) -> ResponseModel:
    """获取通话记录列表

    Args:
        source: 数据来源筛选 (feishu / yunke)
        start_time: 开始时间
        end_time: 结束时间
        department: 部门筛选
        staff_name: 员工筛选
        call_type: 通话类型筛选
        call_result: 通话结果筛选
        callee: 被叫号码筛选（模糊匹配）
        duration_min: 最小通话时长（秒）
        duration_max: 最大通话时长（秒）
        page: 页码
        page_size: 每页数量

    Returns:
        ResponseModel: 包含记录列表和分页信息
    """
    # 如果 end_time 只有日期（时间为零点），设置为当天末尾
    if (
        end_time
        and end_time.hour == 0
        and end_time.minute == 0
        and end_time.second == 0
    ):
        end_time = end_time.replace(hour=23, minute=59, second=59)

    offset = (page - 1) * page_size

    records, total = sync_svc.get_call_records(
        session=session,
        source=source,
        start_time=start_time,
        end_time=end_time,
        department=department,
        staff_name=staff_name,
        call_type=call_type,
        call_result=call_result,
        callee=callee,
        duration_min=duration_min,
        duration_max=duration_max,
        limit=page_size,
        offset=offset,
    )

    return ResponseModel(
        data={
            "items": [CallRecordResponse.model_validate(r) for r in records],
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": (total + page_size - 1) // page_size,
        }
    )


@router.get("/records/stats", response_model=ResponseModel)
async def get_records_stats(
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    session: Session = Depends(get_session),
) -> ResponseModel:
    """获取通话记录统计

    Args:
        start_time: 开始时间
        end_time: 结束时间

    Returns:
        ResponseModel: 统计数据
    """
    stats = sync_svc.get_call_record_stats(
        session=session,
        start_time=start_time,
        end_time=end_time,
    )

    return ResponseModel(data=CallRecordStats(**stats))


@router.delete("/records", response_model=ResponseModel)
async def delete_records(
    record_ids: list[int] = Body(..., embed=True, description="要删除的记录ID列表"),
    session: Session = Depends(get_session),
    current_user: TokenPayload = Depends(require_admin),
) -> ResponseModel:
    """批量删除通话记录

    仅超级管理员可以执行此操作。

    Args:
        record_ids: 要删除的记录ID列表

    Returns:
        ResponseModel: 删除结果
    """
    if not record_ids:
        raise HTTPException(status_code=400, detail="请选择要删除的记录")

    if len(record_ids) > 1000:
        raise HTTPException(status_code=400, detail="单次最多删除1000条记录")

    deleted_count = sync_svc.delete_call_records(session, record_ids)

    logger.info(
        f"用户 {current_user.email} 删除了 {deleted_count} 条通话记录, "
        f"请求ID列表: {record_ids[:10]}{'...' if len(record_ids) > 10 else ''}"
    )

    return ResponseModel(
        message=f"成功删除 {deleted_count} 条记录",
        data={"deleted_count": deleted_count},
    )


# ============ 数据同步接口 ============


@router.post("/sync", response_model=ResponseModel)
async def sync_data(
    session: Session = Depends(get_session),
) -> ResponseModel:
    """手动触发数据同步

    从所有配置的飞书数据表同步数据到本地数据库。

    Returns:
        ResponseModel: 同步结果
    """
    try:
        result = await sync_svc.sync_all_feishu_tables(session)
        return ResponseModel(
            message=f"同步完成: 成功 {result['success']} 个，失败 {result['failed']} 个",
            data=result,
        )
    except sync_svc.DataSyncError as e:
        raise HTTPException(status_code=500, detail=e.message) from e


@router.post("/sync/yunke/{account_id}", response_model=ResponseModel)
async def sync_yunke_data(
    account_id: int,
    start_time: str = Query(..., description="开始时间，格式 YYYY-MM-DD HH:mm"),
    end_time: str = Query(..., description="结束时间，格式 YYYY-MM-DD HH:mm"),
    session: Session = Depends(get_session),
) -> ResponseModel:
    """同步云客通话记录

    从指定云客账号同步通话记录到本地数据库。
    使用通话ID作为唯一标识，避免重复创建记录。

    Args:
        account_id: 云客账号 ID
        start_time: 开始时间
        end_time: 结束时间

    Returns:
        ResponseModel: 同步结果
    """
    try:
        result = await sync_svc.sync_yunke_call_logs(
            session=session,
            account_id=account_id,
            start_time=start_time,
            end_time=end_time,
        )
        return ResponseModel(
            message=f"同步完成: 新增 {result['added']}，更新 {result['updated']}，跳过 {result['skipped']}",
            data=result,
        )
    except sync_svc.DataSyncError as e:
        raise HTTPException(status_code=500, detail=e.message) from e


# ============ AI 分析接口 ============


@router.post("/summary", response_model=ResponseModel)
async def generate_summary(
    request: AnalysisRequest,
    session: Session = Depends(get_session),
) -> ResponseModel:
    """生成数据摘要

    Args:
        request: 分析请求参数

    Returns:
        ResponseModel: 摘要结果
    """
    try:
        result = await ai_svc.generate_summary(
            session=session,
            start_time=request.date_start,
            end_time=request.date_end,
            filters=request.filters,
            provider=request.ai_provider,
            max_records=request.max_records,
        )
        return ResponseModel(data=AnalysisResultResponse.model_validate(result))
    except ai_svc.AIAnalysisError as e:
        raise HTTPException(status_code=500, detail=e.message) from e


@router.post("/trend", response_model=ResponseModel)
async def analyze_trend(
    request: AnalysisRequest,
    focus: str | None = None,
    session: Session = Depends(get_session),
) -> ResponseModel:
    """分析数据趋势

    Args:
        request: 分析请求参数
        focus: 关注点

    Returns:
        ResponseModel: 趋势分析结果
    """
    try:
        result = await ai_svc.analyze_trend(
            session=session,
            start_time=request.date_start,
            end_time=request.date_end,
            focus=focus,
            provider=request.ai_provider,
            max_records=request.max_records,
        )
        return ResponseModel(data=AnalysisResultResponse.model_validate(result))
    except ai_svc.AIAnalysisError as e:
        raise HTTPException(status_code=500, detail=e.message) from e


@router.post("/anomaly", response_model=ResponseModel)
async def detect_anomalies(
    request: AnalysisRequest,
    threshold: str | None = None,
    session: Session = Depends(get_session),
) -> ResponseModel:
    """检测数据异常

    Args:
        request: 分析请求参数
        threshold: 异常阈值说明

    Returns:
        ResponseModel: 异常检测结果
    """
    try:
        result = await ai_svc.detect_anomalies(
            session=session,
            start_time=request.date_start,
            end_time=request.date_end,
            threshold=threshold,
            provider=request.ai_provider,
            max_records=request.max_records,
        )
        return ResponseModel(data=AnalysisResultResponse.model_validate(result))
    except ai_svc.AIAnalysisError as e:
        raise HTTPException(status_code=500, detail=e.message) from e


@router.post("/chat", response_model=ResponseModel)
async def chat_with_data(
    request: ChatRequest,
    session: Session = Depends(get_session),
) -> ResponseModel:
    """智能问答

    基于数据回答用户问题。

    Args:
        request: 聊天请求参数

    Returns:
        ResponseModel: AI 回答
    """
    try:
        # 转换历史记录格式
        history = None
        if request.history:
            history = [
                {"role": msg.role, "content": msg.content} for msg in request.history
            ]

        result = await ai_svc.chat_with_data(
            session=session,
            question=request.question,
            history=history,
            provider=request.ai_provider,
            context_records=request.context_records,
        )
        return ResponseModel(data=AnalysisResultResponse.model_validate(result))
    except ai_svc.AIAnalysisError as e:
        raise HTTPException(status_code=500, detail=e.message) from e


@router.get("/history", response_model=ResponseModel)
async def get_analysis_history(
    analysis_type: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=1000),
    session: Session = Depends(get_session),
) -> ResponseModel:
    """获取分析历史

    Args:
        analysis_type: 分析类型筛选
        page: 页码
        page_size: 每页数量

    Returns:
        ResponseModel: 历史记录列表
    """
    offset = (page - 1) * page_size

    results, total = ai_svc.get_analysis_history(
        session=session,
        analysis_type=analysis_type,
        limit=page_size,
        offset=offset,
    )

    return ResponseModel(
        data={
            "items": [AnalysisResultResponse.model_validate(r) for r in results],
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": (total + page_size - 1) // page_size,
        }
    )


# ============ 通话记录智能分析接口 (DeepSeek + Function Calling) ============


@router.post("/call-analysis", response_model=ResponseModel)
async def analyze_call_records(
    question: str = Body(..., embed=True, description="用户问题"),
    history: list[dict[str, str]] | None = Body(None, description="对话历史"),
    session: Session = Depends(get_session),
) -> ResponseModel:
    """通话记录智能分析（DeepSeek + Function Calling）

    使用 DeepSeek 自动执行 SQL 查询并分析通话数据。

    特性:
    - 自动执行 SQL 查询
    - 支持被叫号码列表分析
    - 支持员工通话统计
    - 支持多轮对话

    Args:
        question: 用户问题
        history: 对话历史 [{"role": "user/assistant", "content": "..."}]

    Returns:
        ResponseModel: 分析结果

    Example:
        POST /api/v1/analysis/call-analysis
        {
            "question": "分析这些被叫号码：13821294844, 13302199992"
        }
    """
    from app.services.call_record_analysis_service import (
        CallRecordAnalysisError,
        CallRecordAnalysisService,
    )

    try:
        service = CallRecordAnalysisService(session)
        result = await service.analyze(
            question=question,
            history=history,
        )

        return ResponseModel(
            data={
                "content": result.content,
                "queries_executed": result.queries_executed,
                "tokens_used": result.tokens_used,
            }
        )
    except CallRecordAnalysisError as e:
        raise HTTPException(status_code=500, detail=e.message) from e


@router.post("/call-analysis/quick", response_model=ResponseModel)
async def quick_query_phones(
    phones: list[str] = Body(..., description="被叫号码列表"),
    start_date: str | None = Body(None, description="开始日期 (YYYY-MM-DD)"),
    end_date: str | None = Body(None, description="结束日期 (YYYY-MM-DD)"),
    session: Session = Depends(get_session),
) -> ResponseModel:
    """快速查询被叫号码

    不使用 AI，直接执行 SQL 查询被叫号码的通话统计。

    Args:
        phones: 被叫号码列表
        start_date: 开始日期
        end_date: 结束日期

    Returns:
        ResponseModel: 查询结果
    """
    from app.services.call_record_analysis_service import (
        CallRecordAnalysisError,
        CallRecordAnalysisService,
    )

    try:
        service = CallRecordAnalysisService(session)
        result = await service.quick_query(
            phones=phones,
            start_date=start_date,
            end_date=end_date,
        )

        return ResponseModel(
            data={
                "content": result.content,
                "queries_executed": result.queries_executed,
            }
        )
    except CallRecordAnalysisError as e:
        raise HTTPException(status_code=500, detail=e.message) from e


@router.get("/providers", response_model=ResponseModel)
async def get_ai_providers(
    session: Session = Depends(get_session),
) -> ResponseModel:
    """获取可用的 AI 服务列表

    Returns:
        ResponseModel: AI 服务列表
    """
    from sqlmodel import select

    from app.config import settings
    from app.models.ai_config import AIConfig

    active_providers = set(
        session.exec(
            select(AIConfig.provider).where(AIConfig.is_active == True)  # noqa: E712
        ).all()
    )

    providers: list[dict[str, object]] = []

    kimi_available = ("kimi" in active_providers) or bool(settings.kimi_api_key)
    if kimi_available:
        providers.append(
            {
                "id": "kimi",
                "name": "Kimi (月之暗面)",
                "description": "超长上下文 200K，适合大数据分析",
                "available": True,
            }
        )
    else:
        providers.append(
            {
                "id": "kimi",
                "name": "Kimi (月之暗面)",
                "description": "未配置（请在系统设置 -> AI 配置中添加并启用，或在 .env 中配置 KIMI_API_KEY）",
                "available": False,
            }
        )

    deepseek_available = ("deepseek" in active_providers) or bool(
        settings.deepseek_api_key
    )
    if deepseek_available:
        providers.append(
            {
                "id": "deepseek",
                "name": "DeepSeek",
                "description": "性价比高，推理能力强",
                "available": True,
            }
        )
    else:
        providers.append(
            {
                "id": "deepseek",
                "name": "DeepSeek",
                "description": "未配置（请在系统设置 -> AI 配置中添加并启用，或在 .env 中配置 DEEPSEEK_API_KEY）",
                "available": False,
            }
        )

    available_ids = [p["id"] for p in providers if p.get("available")]
    default_provider = settings.default_ai_provider
    if available_ids and default_provider not in available_ids:
        default_provider = str(available_ids[0])

    return ResponseModel(
        data={
            "providers": providers,
            "default": default_provider,
        }
    )
