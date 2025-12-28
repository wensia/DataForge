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
from app.models.user import User
from app.schemas.response import ResponseModel
from app.services import ai_analysis_service as ai_svc
from app.services import data_sync_service as sync_svc
from app.utils.jwt_auth import TokenPayload, get_current_user, require_admin


# ============ 权限检查依赖 ============


def require_analysis_access(
    current_user: TokenPayload = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> User:
    """要求数据分析访问权限

    管理员默认有权限，普通用户需要 analysis_enabled=True

    Returns:
        User: 当前用户对象（包含 call_type_filter 等配置）

    Raises:
        HTTPException: 404 用户不存在，403 无权限
    """
    user = session.get(User, current_user.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 管理员默认有权限
    if current_user.role == "admin":
        return user

    # 普通用户检查 analysis_enabled
    if not user.analysis_enabled:
        raise HTTPException(status_code=403, detail="无数据分析权限，请联系管理员开通")

    return user


router = APIRouter(prefix="/analysis", tags=["数据分析"])


# ============ 数据查询接口 ============


@router.get("/filter-options", response_model=ResponseModel)
async def get_filter_options(
    user: User = Depends(require_analysis_access),
    session: Session = Depends(get_session),
) -> ResponseModel:
    """获取筛选选项（员工列表等）

    需要数据分析权限。

    Returns:
        ResponseModel: 包含员工列表等筛选选项
    """
    staff_names = sync_svc.get_unique_staff_names(session)
    return ResponseModel(
        data={
            "staff_names": staff_names,
        }
    )


def apply_user_data_filters(
    user: User,
    start_time: datetime | None,
    end_time: datetime | None,
    call_type: str | None,
    department: str | None,
    staff_name: str | None,
) -> tuple[
    datetime | None, datetime | None, str | None, list[str] | None, list[str] | None
]:
    """应用用户的数据筛选条件

    Args:
        user: 用户对象
        start_time: 前端传入的开始时间
        end_time: 前端传入的结束时间
        call_type: 前端传入的通话类型
        department: 前端传入的部门
        staff_name: 前端传入的员工

    Returns:
        tuple: (effective_start_time, effective_end_time, effective_call_type, departments, staff_names)
    """
    effective_start_time = start_time
    effective_end_time = end_time
    effective_call_type = call_type
    departments: list[str] | None = None
    staff_names: list[str] | None = None

    # 优先使用新的 data_filters 配置
    if user.data_filters:
        filters = user.data_filters

        # 开始日期限制
        if filters.get("start_date"):
            min_start = datetime.fromisoformat(filters["start_date"])
            if not effective_start_time or effective_start_time < min_start:
                effective_start_time = min_start

        # 结束日期限制
        if filters.get("end_date"):
            max_end = datetime.fromisoformat(filters["end_date"])
            max_end = max_end.replace(hour=23, minute=59, second=59)
            if not effective_end_time or effective_end_time > max_end:
                effective_end_time = max_end

        # 通话类型限制
        if filters.get("call_type"):
            effective_call_type = filters["call_type"]

        # 部门限制
        if filters.get("departments"):
            departments = filters["departments"]

        # 员工限制
        if filters.get("staff_names"):
            staff_names = filters["staff_names"]

    # 兼容旧的 call_type_filter（如果 data_filters 中没有 call_type）
    elif user.call_type_filter:
        effective_call_type = user.call_type_filter

    return (
        effective_start_time,
        effective_end_time,
        effective_call_type,
        departments,
        staff_names,
    )


def is_complete_phone_number(callee: str | None) -> bool:
    """判断是否为完整的手机号（11位数字）"""
    if not callee:
        return False
    # 去除空格和横线
    clean = callee.replace(" ", "").replace("-", "")
    # 检查是否为11位数字且以1开头（中国手机号）
    return len(clean) == 11 and clean.isdigit() and clean.startswith("1")


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
    is_invalid_call: bool | None = Query(None, description="筛选无效通话（转写为空但时长>30秒）"),
    transcript_status: str | None = Query(None, description="转写状态筛选（pending/completed/empty）"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=1000),
    user: User = Depends(require_analysis_access),
    session: Session = Depends(get_session),
) -> ResponseModel:
    """获取通话记录列表

    需要数据分析权限。如果用户配置了数据筛选条件，会强制过滤数据。
    但如果用户输入了完整的手机号（11位），则绕过员工/部门限制，允许精确查询。

    用户可配置的筛选条件（在 data_filters 中）：
    - start_date: 开始日期限制（用户只能看此日期之后的数据）
    - end_date: 结束日期限制
    - call_type: 通话类型限制
    - departments: 部门限制（数组）
    - staff_names: 员工限制（数组）

    Args:
        source: 数据来源筛选 (feishu / yunke)
        start_time: 开始时间
        end_time: 结束时间
        department: 部门筛选
        staff_name: 员工筛选
        call_type: 通话类型筛选
        call_result: 通话结果筛选
        callee: 被叫号码筛选（模糊匹配，完整手机号时绕过数据访问限制）
        duration_min: 最小通话时长（秒）
        duration_max: 最大通话时长（秒）
        is_invalid_call: 筛选无效通话（转写为空但时长>30秒）
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

    # 检查是否为完整手机号查询 - 如果是则绕过所有数据访问限制
    bypass_data_filter = is_complete_phone_number(callee)

    if bypass_data_filter:
        # 完整手机号查询：绕过所有用户数据访问限制，使用前端传入的原始参数
        effective_start_time = start_time
        effective_end_time = end_time
        effective_call_type = call_type
        allowed_departments = None
        allowed_staff_names = None
    else:
        # 非完整手机号查询：应用用户的数据过滤配置
        (
            effective_start_time,
            effective_end_time,
            effective_call_type,
            allowed_departments,
            allowed_staff_names,
        ) = apply_user_data_filters(
            user, start_time, end_time, call_type, department, staff_name
        )

    # 如果用户配置了部门/员工限制，需要验证前端传入的值是否在允许范围内
    effective_department = department
    effective_staff_name = staff_name

    if allowed_departments:
        if department:
            # 如果前端指定了部门，检查是否在允许范围内
            if department not in allowed_departments:
                effective_department = None  # 不允许的部门，返回空结果
        # 部门限制会在 get_call_records 中处理

    if allowed_staff_names:
        if staff_name:
            # 如果前端指定了员工，检查是否在允许范围内
            if staff_name not in allowed_staff_names:
                effective_staff_name = None  # 不允许的员工，返回空结果
        # 员工限制会在 get_call_records 中处理

    offset = (page - 1) * page_size

    records, total = sync_svc.get_call_records(
        session=session,
        source=source,
        start_time=effective_start_time,
        end_time=effective_end_time,
        department=effective_department,
        staff_name=effective_staff_name,
        call_type=effective_call_type,
        call_result=call_result,
        callee=callee,
        duration_min=duration_min,
        duration_max=duration_max,
        is_invalid_call=is_invalid_call,
        transcript_status=transcript_status,
        limit=page_size,
        offset=offset,
        allowed_departments=allowed_departments,
        allowed_staff_names=allowed_staff_names,
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
    user: User = Depends(require_analysis_access),
    session: Session = Depends(get_session),
) -> ResponseModel:
    """获取通话记录统计

    需要数据分析权限。如果用户配置了数据筛选条件，统计数据也会相应过滤。

    Args:
        start_time: 开始时间
        end_time: 结束时间

    Returns:
        ResponseModel: 统计数据
    """
    # 应用用户的数据过滤配置
    (
        effective_start_time,
        effective_end_time,
        effective_call_type,
        allowed_departments,
        allowed_staff_names,
    ) = apply_user_data_filters(user, start_time, end_time, None, None, None)

    stats = sync_svc.get_call_record_stats(
        session=session,
        start_time=effective_start_time,
        end_time=effective_end_time,
        call_type=effective_call_type,
        allowed_departments=allowed_departments,
        allowed_staff_names=allowed_staff_names,
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


@router.get("/transcript-stats/monthly", response_model=ResponseModel)
async def get_monthly_transcript_stats(
    duration_min: int | None = Query(None, ge=0, description="最小通话时长筛选（秒）"),
    session: Session = Depends(get_session),
) -> ResponseModel:
    """获取按月份统计的录音转写状态

    Args:
        duration_min: 最小通话时长筛选（秒），用于排除短时长通话

    返回每个月的：
    - 总通话数量
    - 待转写数量（status 为 null 或 pending）
    - 已转写数量（status 为 completed）
    - 空音频数量（status 为 empty）

    Returns:
        ResponseModel: 月度转写统计列表
    """
    stats = sync_svc.get_monthly_transcript_stats(session, duration_min=duration_min)
    return ResponseModel(data=stats)


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
    user: User = Depends(require_analysis_access),
    session: Session = Depends(get_session),
) -> ResponseModel:
    """生成数据摘要

    需要数据分析权限。

    Args:
        request: 分析请求参数

    Returns:
        ResponseModel: 摘要结果
    """
    try:
        # 应用用户的数据过滤配置
        filters = request.filters or {}
        if user.call_type_filter:
            filters["call_type"] = user.call_type_filter

        result = await ai_svc.generate_summary(
            session=session,
            start_time=request.date_start,
            end_time=request.date_end,
            filters=filters,
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
    user: User = Depends(require_analysis_access),
    session: Session = Depends(get_session),
) -> ResponseModel:
    """分析数据趋势

    需要数据分析权限。

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
    user: User = Depends(require_analysis_access),
    session: Session = Depends(get_session),
) -> ResponseModel:
    """检测数据异常

    需要数据分析权限。

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
    user: User = Depends(require_analysis_access),
    session: Session = Depends(get_session),
) -> ResponseModel:
    """智能问答

    需要数据分析权限。基于数据回答用户问题。

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
    user: User = Depends(require_analysis_access),
    session: Session = Depends(get_session),
) -> ResponseModel:
    """获取分析历史

    需要数据分析权限。

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
    user: User = Depends(require_analysis_access),
    session: Session = Depends(get_session),
) -> ResponseModel:
    """通话记录智能分析（DeepSeek + Function Calling）

    需要数据分析权限。使用 DeepSeek 自动执行 SQL 查询并分析通话数据。

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
    user: User = Depends(require_analysis_access),
    session: Session = Depends(get_session),
) -> ResponseModel:
    """快速查询被叫号码

    需要数据分析权限。不使用 AI，直接执行 SQL 查询被叫号码的通话统计。

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
