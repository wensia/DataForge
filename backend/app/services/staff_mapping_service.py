"""员工映射管理服务

提供员工和映射的 CRUD 操作，以及回写通话记录的功能。
"""

from datetime import date

from fastapi import HTTPException
from loguru import logger
from sqlmodel import Session, and_, or_, select

from app.models.call_record import CallRecord
from app.models.staff import (
    Staff,
    StaffCreate,
    StaffMapping,
    StaffMappingCreate,
    StaffMappingUpdate,
    StaffUpdate,
)


class StaffMappingError(Exception):
    """员工映射异常"""

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


# ============ Staff CRUD ============


def get_all_staff(session: Session, include_inactive: bool = False) -> list[Staff]:
    """获取所有员工"""
    query = select(Staff)
    if not include_inactive:
        query = query.where(Staff.is_active == True)  # noqa: E712
    return list(session.exec(query.order_by(Staff.name)).all())


def get_staff_by_id(session: Session, staff_id: int) -> Staff | None:
    """根据 ID 获取员工"""
    return session.get(Staff, staff_id)


def get_staff_by_name(session: Session, name: str) -> Staff | None:
    """根据姓名获取员工"""
    return session.exec(select(Staff).where(Staff.name == name)).first()


def create_staff(session: Session, data: StaffCreate) -> Staff:
    """创建员工"""
    # 检查姓名是否已存在
    existing = get_staff_by_name(session, data.name)
    if existing:
        raise HTTPException(status_code=400, detail=f"员工 '{data.name}' 已存在")

    staff = Staff(**data.model_dump())
    session.add(staff)
    session.commit()
    session.refresh(staff)
    return staff


def update_staff(session: Session, staff_id: int, data: StaffUpdate) -> Staff:
    """更新员工"""
    staff = get_staff_by_id(session, staff_id)
    if not staff:
        raise HTTPException(status_code=404, detail="员工不存在")

    # 如果更新姓名，检查是否重复
    if data.name and data.name != staff.name:
        existing = get_staff_by_name(session, data.name)
        if existing:
            raise HTTPException(status_code=400, detail=f"员工 '{data.name}' 已存在")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(staff, key, value)

    session.add(staff)
    session.commit()
    session.refresh(staff)
    return staff


def delete_staff(session: Session, staff_id: int) -> bool:
    """删除员工（同时删除相关映射）"""
    staff = get_staff_by_id(session, staff_id)
    if not staff:
        raise HTTPException(status_code=404, detail="员工不存在")

    # 删除相关映射
    mappings = session.exec(
        select(StaffMapping).where(StaffMapping.staff_id == staff_id)
    ).all()
    for mapping in mappings:
        session.delete(mapping)

    session.delete(staff)
    session.commit()
    return True


def sync_staff_from_records(session: Session) -> dict:
    """从通话记录同步员工名单

    扫描 call_records 表中的 staff_name，创建不存在的员工。
    """
    # 获取所有不重复的员工名称
    stmt = (
        select(CallRecord.staff_name)
        .where(CallRecord.staff_name.isnot(None))
        .distinct()
    )
    staff_names = [name for name in session.exec(stmt).all() if name and name.strip()]

    # 获取已存在的员工
    existing_staff = {s.name for s in get_all_staff(session, include_inactive=True)}

    # 创建新员工
    added = 0
    for name in staff_names:
        name = name.strip()
        if name and name not in existing_staff:
            staff = Staff(name=name)
            session.add(staff)
            existing_staff.add(name)
            added += 1

    session.commit()
    return {
        "total_names": len(staff_names),
        "added": added,
        "existing": len(existing_staff) - added,
    }


# ============ Mapping CRUD ============


def get_all_mappings(
    session: Session,
    staff_id: int | None = None,
    include_expired: bool = True,
) -> list[StaffMapping]:
    """获取映射列表"""
    query = select(StaffMapping)
    if staff_id:
        query = query.where(StaffMapping.staff_id == staff_id)
    if not include_expired:
        today = date.today()
        query = query.where(
            and_(
                StaffMapping.effective_from <= today,
                or_(
                    StaffMapping.effective_to.is_(None),
                    StaffMapping.effective_to >= today,
                ),
            )
        )
    return list(
        session.exec(
            query.order_by(StaffMapping.staff_id, StaffMapping.effective_from)
        ).all()
    )


def get_mapping_by_id(session: Session, mapping_id: int) -> StaffMapping | None:
    """根据 ID 获取映射"""
    return session.get(StaffMapping, mapping_id)


def get_current_mapping(
    session: Session, staff_id: int, target_date: date | None = None
) -> StaffMapping | None:
    """获取员工在指定日期的有效映射"""
    target = target_date or date.today()
    return session.exec(
        select(StaffMapping).where(
            and_(
                StaffMapping.staff_id == staff_id,
                StaffMapping.effective_from <= target,
                or_(
                    StaffMapping.effective_to.is_(None),
                    StaffMapping.effective_to >= target,
                ),
            )
        )
    ).first()


def check_mapping_overlap(
    session: Session,
    staff_id: int,
    from_date: date,
    to_date: date | None,
    exclude_id: int | None = None,
) -> StaffMapping | None:
    """检查时间段是否与现有映射重叠

    返回重叠的映射记录，如果无重叠返回 None。
    """
    query = select(StaffMapping).where(StaffMapping.staff_id == staff_id)
    if exclude_id:
        query = query.where(StaffMapping.id != exclude_id)

    existing_mappings = session.exec(query).all()

    for mapping in existing_mappings:
        # 检查时间段重叠
        # 新的 [from_date, to_date] 与现有 [mapping.effective_from, mapping.effective_to]
        existing_from = mapping.effective_from
        existing_to = mapping.effective_to or date(9999, 12, 31)  # 无结束日期视为无限远
        new_to = to_date or date(9999, 12, 31)

        # 两个区间重叠的条件：start1 <= end2 AND start2 <= end1
        if from_date <= existing_to and existing_from <= new_to:
            return mapping

    return None


def create_mapping(session: Session, data: StaffMappingCreate) -> StaffMapping:
    """创建映射"""
    # 检查员工是否存在
    staff = get_staff_by_id(session, data.staff_id)
    if not staff:
        raise HTTPException(status_code=404, detail="员工不存在")

    # 检查时间段冲突
    overlap = check_mapping_overlap(
        session, data.staff_id, data.effective_from, data.effective_to
    )
    if overlap:
        raise HTTPException(
            status_code=400,
            detail=f"时间段与现有映射冲突（{overlap.effective_from} ~ {overlap.effective_to or '至今'}）",
        )

    mapping = StaffMapping(**data.model_dump())
    session.add(mapping)
    session.commit()
    session.refresh(mapping)
    return mapping


def update_mapping(
    session: Session, mapping_id: int, data: StaffMappingUpdate
) -> StaffMapping:
    """更新映射"""
    mapping = get_mapping_by_id(session, mapping_id)
    if not mapping:
        raise HTTPException(status_code=404, detail="映射不存在")

    update_data = data.model_dump(exclude_unset=True)

    # 如果更新时间段，检查冲突
    new_from = update_data.get("effective_from", mapping.effective_from)
    new_to = update_data.get("effective_to", mapping.effective_to)
    overlap = check_mapping_overlap(
        session, mapping.staff_id, new_from, new_to, exclude_id=mapping_id
    )
    if overlap:
        raise HTTPException(
            status_code=400,
            detail=f"时间段与现有映射冲突（{overlap.effective_from} ~ {overlap.effective_to or '至今'}）",
        )

    for key, value in update_data.items():
        setattr(mapping, key, value)

    session.add(mapping)
    session.commit()
    session.refresh(mapping)
    return mapping


def delete_mapping(session: Session, mapping_id: int) -> bool:
    """删除映射"""
    mapping = get_mapping_by_id(session, mapping_id)
    if not mapping:
        raise HTTPException(status_code=404, detail="映射不存在")

    session.delete(mapping)
    session.commit()
    return True


# ============ Apply to Records ============


def apply_mappings_to_records(
    session: Session,
    start_date: date | None = None,
    end_date: date | None = None,
    dry_run: bool = False,
) -> dict:
    """将映射回写到通话记录

    根据 staff_name 匹配员工，根据 call_time 匹配对应时间段的映射。

    Args:
        session: 数据库会话
        start_date: 开始日期（基于 call_time）
        end_date: 结束日期
        dry_run: 仅预览，不实际更新

    Returns:
        dict: {"updated_count": int, "skipped_count": int, "details": list}
    """
    result = {"updated_count": 0, "skipped_count": 0, "details": []}

    # 构建查询
    query = select(CallRecord).where(CallRecord.staff_name.isnot(None))
    if start_date:
        query = query.where(CallRecord.call_time >= start_date)
    if end_date:
        query = query.where(CallRecord.call_time <= end_date)

    records = session.exec(query).all()

    # 预加载所有员工和映射
    all_staff = {s.name: s for s in get_all_staff(session, include_inactive=True)}
    all_mappings = get_all_mappings(session)

    # 按员工分组映射
    staff_mappings: dict[int, list[StaffMapping]] = {}
    for mapping in all_mappings:
        if mapping.staff_id not in staff_mappings:
            staff_mappings[mapping.staff_id] = []
        staff_mappings[mapping.staff_id].append(mapping)

    for record in records:
        staff_name = record.staff_name.strip() if record.staff_name else None
        if not staff_name:
            result["skipped_count"] += 1
            continue

        # 匹配员工
        staff = all_staff.get(staff_name)
        if not staff:
            result["skipped_count"] += 1
            if dry_run:
                result["details"].append(
                    {
                        "record_id": record.id,
                        "staff_name": staff_name,
                        "status": "skipped",
                        "reason": "员工不存在",
                    }
                )
            continue

        # 根据通话时间找对应的映射
        call_date = record.call_time.date() if record.call_time else None
        if not call_date:
            result["skipped_count"] += 1
            continue

        mappings = staff_mappings.get(staff.id, [])
        matched_mapping = None
        for mapping in mappings:
            effective_to = mapping.effective_to or date(9999, 12, 31)
            if mapping.effective_from <= call_date <= effective_to:
                matched_mapping = mapping
                break

        if not matched_mapping:
            result["skipped_count"] += 1
            if dry_run:
                result["details"].append(
                    {
                        "record_id": record.id,
                        "staff_name": staff_name,
                        "call_date": str(call_date),
                        "status": "skipped",
                        "reason": "无有效映射",
                    }
                )
            continue

        # 更新记录
        if not dry_run:
            record.staff_id = staff.id
            record.mapped_position = matched_mapping.position
            record.mapped_department = matched_mapping.department
            record.mapped_campus = matched_mapping.campus
            session.add(record)

        result["updated_count"] += 1
        if dry_run:
            result["details"].append(
                {
                    "record_id": record.id,
                    "staff_name": staff_name,
                    "call_date": str(call_date),
                    "status": "will_update",
                    "mapping": {
                        "position": matched_mapping.position,
                        "department": matched_mapping.department,
                        "campus": matched_mapping.campus,
                    },
                }
            )

    if not dry_run:
        session.commit()
        logger.info(
            f"映射回写完成: 更新 {result['updated_count']}，跳过 {result['skipped_count']}"
        )

    return result
