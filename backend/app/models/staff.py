"""员工与映射数据模型

用于管理员工信息和职位/部门/校区的时间维度映射。
支持员工在不同时间段分属不同校区/部门的场景。
"""

from datetime import date, datetime

from sqlalchemy import Index
from sqlmodel import Field, SQLModel

from app.models.base import BaseTable


# 校区固定选项
CAMPUS_OPTIONS = [
    {"value": "西南楼", "label": "西南楼"},
    {"value": "赛顿中心", "label": "赛顿中心"},
]


class Staff(BaseTable, table=True):
    """员工主表

    存储员工基本信息，通过 staff_name 与通话记录关联。
    """

    __tablename__ = "staff"
    __table_args__ = (Index("ix_staff_name", "name", unique=True),)

    name: str = Field(description="员工姓名（唯一标识）")
    phone: str | None = Field(default=None, description="手机号（可选）")
    is_active: bool = Field(default=True, description="是否在职")


class StaffMapping(BaseTable, table=True):
    """员工映射历史表

    存储员工在不同时间段的职位、部门、校区信息。
    使用 effective_from 和 effective_to 实现时间维度管理。
    """

    __tablename__ = "staff_mappings"
    __table_args__ = (
        Index("ix_staff_mappings_staff_id", "staff_id"),
        Index("ix_staff_mappings_dates", "effective_from", "effective_to"),
    )

    staff_id: int = Field(foreign_key="staff.id", description="员工ID")
    position: str | None = Field(default=None, description="职位")
    department: str | None = Field(default=None, description="部门")
    campus: str | None = Field(default=None, description="校区")
    effective_from: date = Field(description="生效开始日期")
    effective_to: date | None = Field(default=None, description="生效结束日期（NULL=至今）")


# ============ Schemas ============


class StaffCreate(SQLModel):
    """创建员工"""

    name: str
    phone: str | None = None
    is_active: bool = True


class StaffUpdate(SQLModel):
    """更新员工"""

    name: str | None = None
    phone: str | None = None
    is_active: bool | None = None


class StaffMappingCreate(SQLModel):
    """创建映射"""

    staff_id: int
    position: str | None = None
    department: str | None = None
    campus: str | None = None
    effective_from: date
    effective_to: date | None = None


class StaffMappingUpdate(SQLModel):
    """更新映射"""

    position: str | None = None
    department: str | None = None
    campus: str | None = None
    effective_from: date | None = None
    effective_to: date | None = None


class StaffMappingResponse(SQLModel):
    """映射响应"""

    id: int
    staff_id: int
    position: str | None
    department: str | None
    campus: str | None
    effective_from: date
    effective_to: date | None
    created_at: datetime
    updated_at: datetime


class StaffResponse(SQLModel):
    """员工响应（含当前映射）"""

    id: int
    name: str
    phone: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    # 当前有效的映射信息（可选）
    current_mapping: StaffMappingResponse | None = None


class StaffWithMappings(SQLModel):
    """员工及其所有映射历史"""

    id: int
    name: str
    phone: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    mappings: list[StaffMappingResponse] = []


class ApplyToRecordsRequest(SQLModel):
    """回写通话记录请求"""

    start_date: date | None = None
    end_date: date | None = None
    dry_run: bool = False  # 仅预览，不实际更新


class ApplyToRecordsResponse(SQLModel):
    """回写通话记录响应"""

    updated_count: int
    skipped_count: int  # 无法匹配的记录数
    details: list[dict] = []  # 详细更新日志（dry_run 时返回）
