"""定时任务模型"""

from datetime import datetime
from enum import Enum

from sqlmodel import Field, SQLModel


class TaskType(str, Enum):
    """任务类型"""

    CRON = "cron"  # Cron 表达式
    INTERVAL = "interval"  # 固定间隔
    DATE = "date"  # 一次性执行
    MANUAL = "manual"  # 手动执行


class TaskStatus(str, Enum):
    """任务状态"""

    ACTIVE = "active"  # 运行中
    PAUSED = "paused"  # 已暂停
    DISABLED = "disabled"  # 已禁用


class ScheduledTask(SQLModel, table=True):
    """定时任务定义表"""

    __tablename__ = "scheduled_tasks"

    id: int | None = Field(default=None, primary_key=True)

    # 基本信息
    name: str = Field(index=True, unique=True, description="任务名称")
    description: str = Field(default="", description="任务描述")
    task_type: TaskType = Field(description="任务类型")

    # 调度配置
    cron_expression: str | None = Field(default=None, description="Cron 表达式")
    interval_seconds: int | None = Field(default=None, description="间隔秒数")
    run_date: datetime | None = Field(default=None, description="一次性执行时间")

    # 任务处理
    handler_path: str = Field(description="处理函数路径")
    handler_kwargs: str | None = Field(default=None, description="处理函数参数 JSON")

    # 状态
    status: TaskStatus = Field(default=TaskStatus.ACTIVE, description="任务状态")
    is_system: bool = Field(default=False, description="是否系统任务")
    category: str | None = Field(default=None, index=True, description="任务分类")

    # 执行统计
    last_run_at: datetime | None = Field(default=None, description="上次执行时间")
    next_run_at: datetime | None = Field(default=None, description="下次执行时间")
    run_count: int = Field(default=0, description="执行总次数")
    success_count: int = Field(default=0, description="成功次数")
    fail_count: int = Field(default=0, description="失败次数")

    # 时间戳
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


# Schema 定义
class ScheduledTaskCreate(SQLModel):
    """创建任务请求"""

    name: str
    description: str = ""
    task_type: TaskType
    cron_expression: str | None = None
    interval_seconds: int | None = None
    run_date: datetime | None = None
    handler_path: str
    handler_kwargs: str | None = None
    category: str | None = None


class ScheduledTaskUpdate(SQLModel):
    """更新任务请求"""

    description: str | None = None
    task_type: TaskType | None = None
    cron_expression: str | None = None
    interval_seconds: int | None = None
    run_date: datetime | None = None
    handler_kwargs: str | None = None
    status: TaskStatus | None = None
    category: str | None = None


class ScheduledTaskResponse(SQLModel):
    """任务响应"""

    id: int
    name: str
    description: str
    task_type: TaskType
    cron_expression: str | None
    interval_seconds: int | None
    run_date: datetime | None
    handler_path: str
    handler_kwargs: str | None
    status: TaskStatus
    is_system: bool
    category: str | None
    last_run_at: datetime | None
    next_run_at: datetime | None
    run_count: int
    success_count: int
    fail_count: int
    created_at: datetime
    updated_at: datetime
