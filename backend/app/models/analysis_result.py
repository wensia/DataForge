"""AI 分析结果数据模型"""

from datetime import datetime
from enum import Enum
from typing import Any

from sqlalchemy import Column
from sqlalchemy.types import JSON, Text
from sqlmodel import Field, SQLModel

from app.models.base import BaseTable


class AnalysisType(str, Enum):
    """分析类型"""

    SUMMARY = "summary"  # 数据摘要
    TREND = "trend"  # 趋势分析
    ANOMALY = "anomaly"  # 异常检测
    QA = "qa"  # 智能问答
    REPORT = "report"  # 报告生成


class AIProvider(str, Enum):
    """AI 服务提供商"""

    KIMI = "kimi"
    DEEPSEEK = "deepseek"
    DOUBAO = "doubao"


class AnalysisResult(BaseTable, table=True):
    """AI 分析结果表

    存储 AI 分析的结果，便于查看历史和避免重复分析。
    """

    __tablename__ = "analysis_results"

    # 分析类型和提供商
    analysis_type: str = Field(index=True, description="分析类型")
    ai_provider: str = Field(index=True, description="AI 服务提供商")

    # 输入
    query: str | None = Field(
        default=None, sa_column=Column(Text), description="用户问题（问答场景）"
    )
    data_range: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON),
        description="分析的数据范围（时间、筛选条件等）",
    )
    data_summary: str | None = Field(
        default=None, sa_column=Column(Text), description="输入数据摘要"
    )

    # 输出
    result: str = Field(sa_column=Column(Text), description="分析结果")
    tokens_used: int | None = Field(default=None, description="消耗的 token 数量")

    # 状态
    status: str = Field(
        default="completed", description="状态: pending/completed/failed"
    )
    error_message: str | None = Field(default=None, description="错误信息")


class AnalysisResultCreate(SQLModel):
    """创建分析结果"""

    analysis_type: str
    ai_provider: str
    query: str | None = None
    data_range: dict[str, Any] = {}
    data_summary: str | None = None
    result: str = ""
    tokens_used: int | None = None
    status: str = "completed"
    error_message: str | None = None


class AnalysisResultResponse(SQLModel):
    """分析结果响应"""

    id: int
    analysis_type: str
    ai_provider: str
    query: str | None
    data_range: dict[str, Any]
    data_summary: str | None
    result: str
    tokens_used: int | None
    status: str
    error_message: str | None
    created_at: datetime
    updated_at: datetime


class AnalysisRequest(SQLModel):
    """分析请求"""

    analysis_type: str = "summary"
    ai_provider: str = "kimi"
    query: str | None = None  # 问答场景的用户问题
    date_start: datetime | None = None  # 数据起始时间
    date_end: datetime | None = None  # 数据结束时间
    filters: dict[str, Any] = {}  # 筛选条件
    max_records: int = 1000  # 最大记录数


class ChatMessage(SQLModel):
    """聊天消息"""

    role: str  # user / assistant / system
    content: str


class ChatRequest(SQLModel):
    """智能问答请求"""

    question: str
    ai_provider: str = "kimi"
    context_records: int = 100  # 作为上下文的记录数
    history: list[ChatMessage] = []  # 对话历史
