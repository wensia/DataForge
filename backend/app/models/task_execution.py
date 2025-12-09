"""任务执行历史模型"""

from datetime import datetime
from enum import Enum
from typing import Optional

from sqlmodel import Field, SQLModel


class ExecutionStatus(str, Enum):
    """执行状态"""

    PENDING = "pending"  # 等待中
    RUNNING = "running"  # 执行中
    SUCCESS = "success"  # 成功
    FAILED = "failed"  # 失败
    CANCELLED = "cancelled"  # 已取消


class TaskExecution(SQLModel, table=True):
    """任务执行历史表"""

    __tablename__ = "task_executions"

    id: Optional[int] = Field(default=None, primary_key=True)
    task_id: int = Field(foreign_key="scheduled_tasks.id", index=True)

    # 执行信息
    status: ExecutionStatus = Field(
        default=ExecutionStatus.PENDING, description="执行状态"
    )
    trigger_type: str = Field(default="scheduled", description="触发类型")

    # 时间
    started_at: Optional[datetime] = Field(default=None, description="开始时间")
    finished_at: Optional[datetime] = Field(default=None, description="结束时间")
    duration_ms: Optional[int] = Field(default=None, description="执行耗时(毫秒)")

    # 结果
    result: Optional[str] = Field(default=None, description="执行结果 JSON")
    error_message: Optional[str] = Field(default=None, description="错误信息")
    error_traceback: Optional[str] = Field(default=None, description="完整堆栈")
    log_output: Optional[str] = Field(default=None, description="日志输出")

    created_at: datetime = Field(default_factory=datetime.now)


# Schema 定义
class TaskExecutionResponse(SQLModel):
    """执行历史响应"""

    id: int
    task_id: int
    status: ExecutionStatus
    trigger_type: str
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    duration_ms: Optional[int]
    result: Optional[str]
    error_message: Optional[str]
    created_at: datetime


class TaskExecutionDetailResponse(TaskExecutionResponse):
    """执行详情响应（包含完整日志）"""

    error_traceback: Optional[str]
    log_output: Optional[str]
