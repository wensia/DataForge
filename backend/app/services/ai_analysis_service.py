"""AI 分析服务

提供数据摘要、趋势分析、异常检测、智能问答等功能。
"""

import json
from collections.abc import AsyncGenerator
from datetime import datetime
from typing import Any

from loguru import logger
from sqlmodel import Session, select

from app.clients.ai import (
    AIClient,
    AIClientError,
    ChatMessage,
    StreamChunk,
    get_ai_client,
)
from app.config import settings
from app.models.ai_config import AIConfig
from app.models.analysis_result import (
    AnalysisResult,
    AnalysisType,
)
from app.models.call_record import CallRecord
from app.services.data_sync_service import get_call_record_stats, get_call_records


class AIAnalysisError(Exception):
    """AI 分析异常"""

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


def _get_active_ai_config(session: Session, provider: str) -> AIConfig | None:
    """获取指定 provider 的可用 AI 配置（优先取最新一条启用配置）"""
    provider = provider.strip()
    if not provider:
        return None

    query = (
        select(AIConfig)
        .where(AIConfig.provider == provider, AIConfig.is_active == True)  # noqa: E712
        .order_by(AIConfig.updated_at.desc())
        .limit(1)
    )
    return session.exec(query).first()


def _get_ai_client_from_env(provider: str) -> AIClient | None:
    """从环境变量（.env）获取 AI 客户端（兼容旧配置）"""
    if provider == "kimi":
        return (
            get_ai_client("kimi", settings.kimi_api_key)
            if settings.kimi_api_key
            else None
        )
    if provider == "deepseek":
        return (
            get_ai_client("deepseek", settings.deepseek_api_key)
            if settings.deepseek_api_key
            else None
        )
    if provider == "doubao":
        return (
            get_ai_client(
                "doubao",
                settings.doubao_api_key,
                endpoint_id=settings.doubao_endpoint_id,
            )
            if settings.doubao_api_key and settings.doubao_endpoint_id
            else None
        )
    return None


def _resolve_ai_client(
    session: Session, provider: str | None = None
) -> tuple[str, AIClient, str | None]:
    """解析并获取 AI 客户端（优先使用数据库 AI 配置，其次 .env）

    Args:
        session: 数据库会话
        provider: AI 服务提供商（可选，使用默认）

    Returns:
        tuple[str, AIClient, str | None]: (provider, client, default_model)

    Raises:
        AIAnalysisError: 配置错误
    """
    requested = (provider or "").strip()

    def _from_db(p: str) -> tuple[str, AIClient, str | None] | None:
        cfg = _get_active_ai_config(session, p)
        if not cfg:
            return None
        return (
            p,
            get_ai_client(
                p, cfg.api_key, base_url=cfg.base_url, endpoint_id=cfg.default_model
            ),
            cfg.default_model,
        )

    def _from_env(p: str) -> tuple[str, AIClient, str | None] | None:
        client = _get_ai_client_from_env(p)
        if not client:
            return None
        return p, client, None

    # 1) 优先使用显式指定的 provider
    if requested:
        resolved = _from_db(requested) or _from_env(requested)
        if resolved:
            return resolved
        raise AIAnalysisError(
            f"未配置 {requested} 的 AI 密钥，请在「系统设置 -> AI 配置」中添加并启用，或在 .env 中配置对应 API Key"
        )

    # 2) 未指定 provider：优先使用默认 provider
    default_provider = settings.default_ai_provider
    resolved = _from_db(default_provider) or _from_env(default_provider)
    if resolved:
        return resolved

    # 3) 默认 provider 不可用：退化到任意启用的 AI 配置
    any_cfg = session.exec(
        select(AIConfig)
        .where(AIConfig.is_active == True)
        .order_by(AIConfig.updated_at.desc())
        .limit(1)
    ).first()  # noqa: E712
    if any_cfg:
        provider_id = any_cfg.provider
        return (
            provider_id,
            get_ai_client(
                provider_id,
                any_cfg.api_key,
                base_url=any_cfg.base_url,
                endpoint_id=any_cfg.default_model,
            ),
            any_cfg.default_model,
        )

    # 4) 兼容旧配置：退化到任意可用的 .env
    for p in ("kimi", "deepseek", "doubao"):
        resolved = _from_env(p)
        if resolved:
            return resolved

    raise AIAnalysisError(
        "未配置可用的 AI 服务，请在「系统设置 -> AI 配置」中添加并启用，或在 .env 中配置 KIMI / DEEPSEEK / DOUBAO 相关参数"
    )


def _format_records_for_ai(records: list[CallRecord], max_chars: int = 50000) -> str:
    """将记录格式化为 AI 可读的文本

    Args:
        records: 通话记录列表
        max_chars: 最大字符数

    Returns:
        str: 格式化的文本
    """
    lines = []
    total_chars = 0

    for i, record in enumerate(records):
        line = (
            f"[{i + 1}] 时间: {record.call_time}, "
            f"主叫: {record.caller or '未知'}, "
            f"被叫: {record.callee or '未知'}, "
            f"时长: {record.duration or 0}秒, "
            f"类型: {record.call_type or '未知'}, "
            f"结果: {record.call_result or '未知'}, "
            f"客户: {record.customer_name or '未知'}, "
            f"员工: {record.staff_name or '未知'}, "
            f"部门: {record.department or '未知'}"
        )

        if total_chars + len(line) > max_chars:
            lines.append(f"... 共 {len(records)} 条记录，已截断显示 {i} 条")
            break

        lines.append(line)
        total_chars += len(line) + 1

    return "\n".join(lines)


async def generate_summary(
    session: Session,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    filters: dict[str, Any] | None = None,
    provider: str | None = None,
    max_records: int = 1000,
) -> AnalysisResult:
    """生成数据摘要

    Args:
        session: 数据库会话
        start_time: 开始时间
        end_time: 结束时间
        filters: 筛选条件
        provider: AI 服务提供商
        max_records: 最大记录数

    Returns:
        AnalysisResult: 分析结果
    """
    try:
        # 获取数据
        records, total = get_call_records(
            session=session,
            start_time=start_time,
            end_time=end_time,
            department=filters.get("department") if filters else None,
            staff_name=filters.get("staff_name") if filters else None,
            limit=max_records,
        )

        if not records:
            raise AIAnalysisError("没有找到符合条件的数据")

        # 获取统计信息
        stats = get_call_record_stats(session, start_time, end_time)

        # 格式化数据
        data_text = _format_records_for_ai(records)
        stats_text = json.dumps(stats, ensure_ascii=False, indent=2)

        # 构建提示
        prompt = f"""数据统计概览:
{stats_text}

详细记录（共 {total} 条，显示 {len(records)} 条）:
{data_text}"""

        # 调用 AI
        provider_id, client, model = _resolve_ai_client(session, provider)
        response = await client.summarize(prompt, model=model)

        # 保存结果
        result = AnalysisResult(
            analysis_type=AnalysisType.SUMMARY,
            ai_provider=provider_id,
            data_range={
                "start_time": start_time.isoformat() if start_time else None,
                "end_time": end_time.isoformat() if end_time else None,
                "filters": filters,
                "total_records": total,
            },
            data_summary=f"共 {total} 条记录",
            result=response.content,
            tokens_used=response.tokens_used,
            status="completed",
        )

        session.add(result)
        session.commit()
        session.refresh(result)

        logger.info(
            f"生成摘要完成: result_id={result.id}, tokens={response.tokens_used}"
        )
        return result

    except AIClientError as e:
        raise AIAnalysisError(f"AI 服务错误: {e.message}") from e


async def detect_anomalies(
    session: Session,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    threshold: str | None = None,
    provider: str | None = None,
    max_records: int = 1000,
) -> AnalysisResult:
    """检测数据异常

    Args:
        session: 数据库会话
        start_time: 开始时间
        end_time: 结束时间
        threshold: 异常阈值说明
        provider: AI 服务提供商
        max_records: 最大记录数

    Returns:
        AnalysisResult: 分析结果
    """
    try:
        # 获取数据
        records, total = get_call_records(
            session=session,
            start_time=start_time,
            end_time=end_time,
            limit=max_records,
        )

        if not records:
            raise AIAnalysisError("没有找到符合条件的数据")

        # 格式化数据
        data_text = _format_records_for_ai(records)

        # 调用 AI
        provider_id, client, model = _resolve_ai_client(session, provider)
        response = await client.detect_anomalies(data_text, threshold, model=model)

        # 保存结果
        result = AnalysisResult(
            analysis_type=AnalysisType.ANOMALY,
            ai_provider=provider_id,
            data_range={
                "start_time": start_time.isoformat() if start_time else None,
                "end_time": end_time.isoformat() if end_time else None,
                "threshold": threshold,
                "total_records": total,
            },
            data_summary=f"共 {total} 条记录",
            result=response.content,
            tokens_used=response.tokens_used,
            status="completed",
        )

        session.add(result)
        session.commit()
        session.refresh(result)

        logger.info(
            f"异常检测完成: result_id={result.id}, tokens={response.tokens_used}"
        )
        return result

    except AIClientError as e:
        raise AIAnalysisError(f"AI 服务错误: {e.message}") from e


async def analyze_trend(
    session: Session,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    focus: str | None = None,
    provider: str | None = None,
    max_records: int = 1000,
) -> AnalysisResult:
    """分析数据趋势

    Args:
        session: 数据库会话
        start_time: 开始时间
        end_time: 结束时间
        focus: 关注点
        provider: AI 服务提供商
        max_records: 最大记录数

    Returns:
        AnalysisResult: 分析结果
    """
    try:
        # 获取数据
        records, total = get_call_records(
            session=session,
            start_time=start_time,
            end_time=end_time,
            limit=max_records,
        )

        if not records:
            raise AIAnalysisError("没有找到符合条件的数据")

        # 格式化数据
        data_text = _format_records_for_ai(records)

        # 构建提示
        system_prompt = """你是一个数据趋势分析专家。请分析用户提供的通话数据，识别其中的趋势和模式。
分析应包括：
1. 时间趋势（按日/周的变化）
2. 通话量趋势
3. 通话时长趋势
4. 各类型通话的变化
5. 部门/员工的表现趋势
6. 预测和建议"""

        prompt = "请分析以上数据的趋势。"
        if focus:
            prompt += f"\n\n请特别关注：{focus}"

        # 调用 AI
        provider_id, client, model = _resolve_ai_client(session, provider)
        response = await client.analyze(
            data_text, prompt, system_prompt=system_prompt, model=model
        )

        # 保存结果
        result = AnalysisResult(
            analysis_type=AnalysisType.TREND,
            ai_provider=provider_id,
            data_range={
                "start_time": start_time.isoformat() if start_time else None,
                "end_time": end_time.isoformat() if end_time else None,
                "focus": focus,
                "total_records": total,
            },
            data_summary=f"共 {total} 条记录",
            result=response.content,
            tokens_used=response.tokens_used,
            status="completed",
        )

        session.add(result)
        session.commit()
        session.refresh(result)

        logger.info(
            f"趋势分析完成: result_id={result.id}, tokens={response.tokens_used}"
        )
        return result

    except AIClientError as e:
        raise AIAnalysisError(f"AI 服务错误: {e.message}") from e


async def chat_with_data(
    session: Session,
    question: str,
    history: list[dict] | None = None,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    provider: str | None = None,
    context_records: int = 100,
) -> AnalysisResult:
    """基于数据的智能问答

    Args:
        session: 数据库会话
        question: 用户问题
        history: 对话历史
        start_time: 数据开始时间
        end_time: 数据结束时间
        provider: AI 服务提供商
        context_records: 上下文记录数

    Returns:
        AnalysisResult: 分析结果
    """
    try:
        # 获取数据作为上下文
        records, total = get_call_records(
            session=session,
            start_time=start_time,
            end_time=end_time,
            limit=context_records,
        )

        # 格式化数据
        data_text = _format_records_for_ai(records) if records else "暂无数据"

        # 获取统计信息
        stats = get_call_record_stats(session, start_time, end_time)
        stats_text = json.dumps(stats, ensure_ascii=False, indent=2)

        context = f"数据统计:\n{stats_text}\n\n详细记录（共 {total} 条）:\n{data_text}"

        # 转换历史记录
        chat_history = None
        if history:
            chat_history = [
                ChatMessage(role=msg["role"], content=msg["content"]) for msg in history
            ]

        # 调用 AI
        provider_id, client, model = _resolve_ai_client(session, provider)
        response = await client.answer_question(
            context, question, chat_history, model=model
        )

        # 保存结果
        result = AnalysisResult(
            analysis_type=AnalysisType.QA,
            ai_provider=provider_id,
            query=question,
            data_range={
                "start_time": start_time.isoformat() if start_time else None,
                "end_time": end_time.isoformat() if end_time else None,
                "total_records": total,
            },
            data_summary=f"共 {total} 条记录作为上下文",
            result=response.content,
            tokens_used=response.tokens_used,
            status="completed",
        )

        session.add(result)
        session.commit()
        session.refresh(result)

        logger.info(
            f"智能问答完成: result_id={result.id}, tokens={response.tokens_used}"
        )
        return result

    except AIClientError as e:
        raise AIAnalysisError(f"AI 服务错误: {e.message}") from e


def get_analysis_history(
    session: Session,
    analysis_type: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[AnalysisResult], int]:
    """获取分析历史

    Args:
        session: 数据库会话
        analysis_type: 分析类型筛选
        limit: 返回数量
        offset: 偏移量

    Returns:
        tuple: (结果列表, 总数)
    """
    from sqlalchemy import func
    from sqlmodel import select

    query = select(AnalysisResult)

    if analysis_type:
        query = query.where(AnalysisResult.analysis_type == analysis_type)

    # 获取总数
    count_query = select(func.count()).select_from(query.subquery())
    total = session.exec(count_query).one()

    # 分页和排序
    query = query.order_by(AnalysisResult.created_at.desc())
    query = query.offset(offset).limit(limit)

    results = session.exec(query).all()
    return list(results), total


async def stream_chat(
    session: Session,
    messages: list[dict[str, Any]],
    provider: str | None = None,
) -> AsyncGenerator[str, None]:
    """流式聊天

    Args:
        session: 数据库会话
        messages: 消息列表 [{"role": "user", "content": "..."}]
        provider: AI 服务提供商

    Yields:
        str: 响应片段
    """
    try:
        # 转换消息格式
        chat_messages = [
            ChatMessage(role=msg["role"], content=msg["content"]) for msg in messages
        ]

        # 获取客户端
        provider_id, client, model = _resolve_ai_client(session, provider)

        # 强制默认模型
        if not model:
            if provider_id == "deepseek":
                model = "deepseek-chat"
            elif provider_id == "kimi":
                model = "moonshot-v1-8k"
        
        logger.info(f"Using AI model: {model} for provider: {provider_id}")

        # 调用流式接口
        if hasattr(client, "chat_stream"):
            async for chunk in client.chat_stream(chat_messages, model=model):
                if chunk.content:
                    yield chunk.content
        else:
            # 如果不支持流式，回退到普通调用
            response = await client.chat(chat_messages, model=model)
            yield response.content

    except AIClientError as e:
        logger.error(f"AI 流式服务错误: {e.message}")
        yield f"Error: {e.message}"
    except Exception as e:
        logger.error(f"AI 流式未知错误: {e}")
        yield f"Error: {str(e)}"
