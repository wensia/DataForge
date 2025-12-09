"""员工映射管理 API 路由

提供员工和映射的 CRUD 操作，以及回写通话记录功能。
"""

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app.database import get_session
from app.models.staff import (
    CAMPUS_OPTIONS,
    ApplyToRecordsRequest,
    ApplyToRecordsResponse,
    StaffCreate,
    StaffMappingCreate,
    StaffMappingResponse,
    StaffMappingUpdate,
    StaffResponse,
    StaffUpdate,
    StaffWithMappings,
)
from app.schemas.response import ResponseModel
from app.services import staff_mapping_service as svc
from app.utils.jwt_auth import require_admin

router = APIRouter(prefix="/staff-mapping", tags=["员工映射"])


# ============ 员工接口 ============


@router.get("/staff", response_model=ResponseModel)
async def get_staff_list(
    include_inactive: bool = Query(False, description="是否包含离职员工"),
    session: Session = Depends(get_session),
) -> ResponseModel:
    """获取员工列表（含当前映射）"""
    staff_list = svc.get_all_staff(session, include_inactive=include_inactive)

    # 为每个员工获取当前映射
    result = []
    for staff in staff_list:
        current_mapping = svc.get_current_mapping(session, staff.id)
        staff_data = StaffResponse(
            id=staff.id,
            name=staff.name,
            phone=staff.phone,
            is_active=staff.is_active,
            created_at=staff.created_at,
            updated_at=staff.updated_at,
            current_mapping=StaffMappingResponse(
                id=current_mapping.id,
                staff_id=current_mapping.staff_id,
                position=current_mapping.position,
                department=current_mapping.department,
                campus=current_mapping.campus,
                effective_from=current_mapping.effective_from,
                effective_to=current_mapping.effective_to,
                created_at=current_mapping.created_at,
                updated_at=current_mapping.updated_at,
            )
            if current_mapping
            else None,
        )
        result.append(staff_data)

    return ResponseModel(data=result)


@router.get("/staff/{staff_id}", response_model=ResponseModel)
async def get_staff_detail(
    staff_id: int,
    session: Session = Depends(get_session),
) -> ResponseModel:
    """获取员工详情（含所有映射历史）"""
    staff = svc.get_staff_by_id(session, staff_id)
    if not staff:
        return ResponseModel(code=404, message="员工不存在")

    mappings = svc.get_all_mappings(session, staff_id=staff_id)

    result = StaffWithMappings(
        id=staff.id,
        name=staff.name,
        phone=staff.phone,
        is_active=staff.is_active,
        created_at=staff.created_at,
        updated_at=staff.updated_at,
        mappings=[
            StaffMappingResponse(
                id=m.id,
                staff_id=m.staff_id,
                position=m.position,
                department=m.department,
                campus=m.campus,
                effective_from=m.effective_from,
                effective_to=m.effective_to,
                created_at=m.created_at,
                updated_at=m.updated_at,
            )
            for m in mappings
        ],
    )
    return ResponseModel(data=result)


@router.post("/staff", response_model=ResponseModel, dependencies=[Depends(require_admin)])
async def create_staff(
    data: StaffCreate,
    session: Session = Depends(get_session),
) -> ResponseModel:
    """创建员工"""
    staff = svc.create_staff(session, data)
    return ResponseModel(
        message="员工创建成功",
        data=StaffResponse(
            id=staff.id,
            name=staff.name,
            phone=staff.phone,
            is_active=staff.is_active,
            created_at=staff.created_at,
            updated_at=staff.updated_at,
        ),
    )


@router.put("/staff/{staff_id}", response_model=ResponseModel, dependencies=[Depends(require_admin)])
async def update_staff(
    staff_id: int,
    data: StaffUpdate,
    session: Session = Depends(get_session),
) -> ResponseModel:
    """更新员工"""
    staff = svc.update_staff(session, staff_id, data)
    return ResponseModel(
        message="员工更新成功",
        data=StaffResponse(
            id=staff.id,
            name=staff.name,
            phone=staff.phone,
            is_active=staff.is_active,
            created_at=staff.created_at,
            updated_at=staff.updated_at,
        ),
    )


@router.delete("/staff/{staff_id}", response_model=ResponseModel, dependencies=[Depends(require_admin)])
async def delete_staff(
    staff_id: int,
    session: Session = Depends(get_session),
) -> ResponseModel:
    """删除员工（同时删除相关映射）"""
    svc.delete_staff(session, staff_id)
    return ResponseModel(message="员工删除成功")


@router.post("/staff/sync", response_model=ResponseModel, dependencies=[Depends(require_admin)])
async def sync_staff_from_records(
    session: Session = Depends(get_session),
) -> ResponseModel:
    """从通话记录同步员工名单"""
    result = svc.sync_staff_from_records(session)
    return ResponseModel(
        message=f"同步完成：新增 {result['added']} 人",
        data=result,
    )


# ============ 映射接口 ============


@router.get("/mappings", response_model=ResponseModel)
async def get_mappings(
    staff_id: int | None = Query(None, description="按员工筛选"),
    include_expired: bool = Query(True, description="是否包含已过期映射"),
    session: Session = Depends(get_session),
) -> ResponseModel:
    """获取映射列表"""
    mappings = svc.get_all_mappings(session, staff_id=staff_id, include_expired=include_expired)
    result = [
        StaffMappingResponse(
            id=m.id,
            staff_id=m.staff_id,
            position=m.position,
            department=m.department,
            campus=m.campus,
            effective_from=m.effective_from,
            effective_to=m.effective_to,
            created_at=m.created_at,
            updated_at=m.updated_at,
        )
        for m in mappings
    ]
    return ResponseModel(data=result)


@router.get("/mappings/at-time", response_model=ResponseModel)
async def get_mappings_at_time(
    target_date: date = Query(..., description="查询日期"),
    session: Session = Depends(get_session),
) -> ResponseModel:
    """查询指定日期的所有有效映射"""
    staff_list = svc.get_all_staff(session, include_inactive=True)
    result = []

    for staff in staff_list:
        mapping = svc.get_current_mapping(session, staff.id, target_date=target_date)
        if mapping:
            result.append({
                "staff_id": staff.id,
                "staff_name": staff.name,
                "mapping": StaffMappingResponse(
                    id=mapping.id,
                    staff_id=mapping.staff_id,
                    position=mapping.position,
                    department=mapping.department,
                    campus=mapping.campus,
                    effective_from=mapping.effective_from,
                    effective_to=mapping.effective_to,
                    created_at=mapping.created_at,
                    updated_at=mapping.updated_at,
                ),
            })

    return ResponseModel(data=result)


@router.post("/mappings", response_model=ResponseModel, dependencies=[Depends(require_admin)])
async def create_mapping(
    data: StaffMappingCreate,
    session: Session = Depends(get_session),
) -> ResponseModel:
    """创建映射"""
    mapping = svc.create_mapping(session, data)
    return ResponseModel(
        message="映射创建成功",
        data=StaffMappingResponse(
            id=mapping.id,
            staff_id=mapping.staff_id,
            position=mapping.position,
            department=mapping.department,
            campus=mapping.campus,
            effective_from=mapping.effective_from,
            effective_to=mapping.effective_to,
            created_at=mapping.created_at,
            updated_at=mapping.updated_at,
        ),
    )


@router.put("/mappings/{mapping_id}", response_model=ResponseModel, dependencies=[Depends(require_admin)])
async def update_mapping(
    mapping_id: int,
    data: StaffMappingUpdate,
    session: Session = Depends(get_session),
) -> ResponseModel:
    """更新映射"""
    mapping = svc.update_mapping(session, mapping_id, data)
    return ResponseModel(
        message="映射更新成功",
        data=StaffMappingResponse(
            id=mapping.id,
            staff_id=mapping.staff_id,
            position=mapping.position,
            department=mapping.department,
            campus=mapping.campus,
            effective_from=mapping.effective_from,
            effective_to=mapping.effective_to,
            created_at=mapping.created_at,
            updated_at=mapping.updated_at,
        ),
    )


@router.delete("/mappings/{mapping_id}", response_model=ResponseModel, dependencies=[Depends(require_admin)])
async def delete_mapping(
    mapping_id: int,
    session: Session = Depends(get_session),
) -> ResponseModel:
    """删除映射"""
    svc.delete_mapping(session, mapping_id)
    return ResponseModel(message="映射删除成功")


# ============ 选项接口 ============


@router.get("/options/campuses", response_model=ResponseModel)
async def get_campus_options() -> ResponseModel:
    """获取校区选项列表"""
    return ResponseModel(data=CAMPUS_OPTIONS)


# ============ 回写接口 ============


@router.post("/apply/to-records", response_model=ResponseModel, dependencies=[Depends(require_admin)])
async def apply_to_records(
    data: ApplyToRecordsRequest,
    session: Session = Depends(get_session),
) -> ResponseModel:
    """将映射回写到通话记录"""
    result = svc.apply_mappings_to_records(
        session=session,
        start_date=data.start_date,
        end_date=data.end_date,
        dry_run=data.dry_run,
    )

    message = f"{'预览' if data.dry_run else '回写'}完成：将更新 {result['updated_count']} 条，跳过 {result['skipped_count']} 条"
    return ResponseModel(
        message=message,
        data=ApplyToRecordsResponse(
            updated_count=result["updated_count"],
            skipped_count=result["skipped_count"],
            details=result.get("details", []),
        ),
    )
