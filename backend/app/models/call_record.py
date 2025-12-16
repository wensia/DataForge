"""通话记录数据模型

用于存储从飞书多维表格或云客 API 同步的通话数据，
突破飞书 2 万行限制。
"""

from datetime import datetime
from enum import Enum
from typing import Any

from sqlalchemy import Column, Index
from sqlalchemy.types import JSON
from sqlmodel import Field, SQLModel

from app.models.base import BaseTable


class DataSource(str, Enum):
    """数据来源"""

    FEISHU = "feishu"
    YUNKE = "yunke"


class TranscriptStatus(str, Enum):
    """转写状态"""

    PENDING = "pending"  # 待转写
    COMPLETED = "completed"  # 已完成
    EMPTY = "empty"  # 空内容（无语音）


class CallRecord(BaseTable, table=True):
    """通话记录表

    存储通话记录数据，支持从多个数据源同步。
    核心字段独立存储便于查询，扩展字段使用 JSON 存储。
    """

    __tablename__ = "call_records"
    __table_args__ = (
        Index("ix_call_records_call_time", "call_time"),
        Index("ix_call_records_source_record_id", "source", "record_id", unique=True),
        # 复合索引：优化按时间范围+转写状态的查询（ASR任务常用）
        Index("ix_call_records_time_status", "call_time", "transcript_status"),
    )

    # 数据来源标识
    source: str = Field(index=True, description="数据来源: feishu/yunke")
    record_id: str = Field(index=True, description="原始记录ID")

    # 核心字段（便于查询和统计）
    caller: str | None = Field(default=None, description="主叫号码/人员")
    callee: str | None = Field(default=None, description="被叫号码/客户")
    call_time: datetime = Field(description="通话时间")
    duration: int | None = Field(default=None, description="通话时长(秒)")
    call_type: str | None = Field(default=None, description="通话类型")
    call_result: str | None = Field(default=None, description="通话结果")

    # 业务字段
    customer_name: str | None = Field(default=None, description="客户名称")
    staff_name: str | None = Field(default=None, description="员工名称")
    department: str | None = Field(default=None, description="部门")
    has_recording: bool = Field(
        default=False, index=True, description="是否有录音文件（优化查询性能）"
    )
    transcript: list[dict[str, Any]] | None = Field(
        default=None,
        sa_column=Column(JSON),
        description="通话录音转写文本(JSON格式)",
    )
    transcript_status: str | None = Field(
        default=None,
        index=True,
        description="转写状态: pending/completed/empty",
    )

    # 员工映射字段（通过 staff_mapping 回写）
    staff_id: int | None = Field(
        default=None, foreign_key="staff.id", description="关联的员工ID"
    )
    mapped_position: str | None = Field(default=None, description="映射的职位")
    mapped_campus: str | None = Field(default=None, description="映射的校区")
    mapped_department: str | None = Field(default=None, description="映射的部门")

    # 扩展字段（JSON 存储，灵活保存其他数据）
    raw_data: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON),
        description="原始数据（完整记录）",
    )


class CallRecordCreate(SQLModel):
    """创建通话记录"""

    source: str
    record_id: str
    caller: str | None = None
    callee: str | None = None
    call_time: datetime  # 必填字段
    duration: int | None = None
    call_type: str | None = None
    call_result: str | None = None
    customer_name: str | None = None
    staff_name: str | None = None
    department: str | None = None
    transcript: list[dict[str, Any]] | None = None
    transcript_status: str | None = None
    raw_data: dict[str, Any] = {}


class CallRecordUpdate(SQLModel):
    """更新通话记录"""

    caller: str | None = None
    callee: str | None = None
    call_time: datetime | None = None
    duration: int | None = None
    call_type: str | None = None
    call_result: str | None = None
    customer_name: str | None = None
    staff_name: str | None = None
    department: str | None = None
    transcript: list[dict[str, Any]] | None = None
    transcript_status: str | None = None
    raw_data: dict[str, Any] | None = None


class CallRecordResponse(SQLModel):
    """通话记录响应"""

    id: int
    source: str
    record_id: str
    caller: str | None
    callee: str | None
    call_time: datetime | None
    duration: int | None
    call_type: str | None
    call_result: str | None
    customer_name: str | None
    staff_name: str | None
    department: str | None
    transcript: list[dict[str, Any]] | None
    transcript_status: str | None = None
    raw_data: dict[str, Any]
    created_at: datetime
    updated_at: datetime
    # 员工映射字段
    staff_id: int | None = None
    mapped_position: str | None = None
    mapped_campus: str | None = None
    mapped_department: str | None = None


class CallRecordStats(SQLModel):
    """通话记录统计"""

    total_count: int
    total_duration: int
    avg_duration: float
    by_source: dict[str, int]
    by_call_type: dict[str, int]
    by_department: dict[str, int]
