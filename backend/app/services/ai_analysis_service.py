"""AI 分析服务

提供数据摘要、趋势分析、异常检测、智能问答等功能。
"""

import json
from datetime import datetime
from typing import Any

from loguru import logger
from sqlmodel import Session

from app.clients.ai import AIClient, AIClientError, ChatMessage, get_ai_client
from app.config import settings
from app.models.analysis_result import (
    AnalysisResult,
    AnalysisResultCreate,
    AnalysisType,
)
from app.models.call_record import CallRecord
from app.services.data_sync_service import get_call_records, get_call_record_stats


class AIAnalysisError(Exception):
    """AI 分析异常"""

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


def _get_ai_client(provider: str | None = None) -> AIClient:
    """获取 AI 客户端

    Args:
        provider: AI 服务提供商（可选，使用默认）

    Returns:
        AIClient: AI 客户端实例

    Raises:
        AIAnalysisError: 配置错误
    """
    provider = provider or settings.default_ai_provider

    if provider == "kimi":
        if not settings.kimi_api_key:
            raise AIAnalysisError("未配置 Kimi API 密钥，请在 .env 中设置 KIMI_API_KEY")
        return get_ai_client("kimi", settings.kimi_api_key)
    elif provider == "deepseek":
        if not settings.deepseek_api_key:
            raise AIAnalysisError("未配置 DeepSeek API 密钥，请在 .env 中设置 DEEPSEEK_API_KEY")
        return get_ai_client("deepseek", settings.deepseek_api_key)
    else:
        raise AIAnalysisError(f"不支持的 AI 服务: {provider}")


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
            f"[{i+1}] 时间: {record.call_time}, "
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
    provider = provider or settings.default_ai_provider

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
        client = _get_ai_client(provider)
        response = await client.summarize(prompt)

        # 保存结果
        result = AnalysisResult(
            analysis_type=AnalysisType.SUMMARY,
            ai_provider=provider,
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

        logger.info(f"生成摘要完成: result_id={result.id}, tokens={response.tokens_used}")
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
    provider = provider or settings.default_ai_provider

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
        client = _get_ai_client(provider)
        response = await client.detect_anomalies(data_text, threshold)

        # 保存结果
        result = AnalysisResult(
            analysis_type=AnalysisType.ANOMALY,
            ai_provider=provider,
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

        logger.info(f"异常检测完成: result_id={result.id}, tokens={response.tokens_used}")
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
    provider = provider or settings.default_ai_provider

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
        client = _get_ai_client(provider)
        response = await client.analyze(data_text, prompt, system_prompt=system_prompt)

        # 保存结果
        result = AnalysisResult(
            analysis_type=AnalysisType.TREND,
            ai_provider=provider,
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

        logger.info(f"趋势分析完成: result_id={result.id}, tokens={response.tokens_used}")
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
    provider = provider or settings.default_ai_provider

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
        client = _get_ai_client(provider)
        response = await client.answer_question(context, question, chat_history)

        # 保存结果
        result = AnalysisResult(
            analysis_type=AnalysisType.QA,
            ai_provider=provider,
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

        logger.info(f"智能问答完成: result_id={result.id}, tokens={response.tokens_used}")
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
