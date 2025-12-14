"""组织架构数据接口 - 从 CRM 获取校区、部门、职位信息"""

from fastapi import APIRouter, Query
from loguru import logger
from pydantic import BaseModel

from app.clients.crm import (
    CRMCampus,
    CRMClient,
    CRMClientError,
    CRMDepartment,
    CRMPosition,
)
from app.config import settings
from app.schemas.response import ResponseModel

router = APIRouter(prefix="/organization", tags=["组织架构"])


class CampusListResponse(BaseModel):
    """校区列表响应"""

    items: list[CRMCampus]
    total: int


class DepartmentListResponse(BaseModel):
    """部门列表响应"""

    items: list[CRMDepartment]
    total: int


class PositionListResponse(BaseModel):
    """职位列表响应"""

    items: list[CRMPosition]
    total: int


def _check_crm_config() -> ResponseModel | None:
    """检查 CRM 配置是否完整"""
    if not settings.crm_base_url or not settings.crm_service_key:
        return ResponseModel.error(code=503, message="CRM 服务未配置")
    return None


@router.get("/campuses", response_model=ResponseModel[CampusListResponse])
async def get_campuses(
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(100, ge=1, le=500, description="每页数量"),
    is_active: bool | None = Query(None, description="筛选是否启用"),
):
    """获取校区列表

    从 CRM 系统获取校区数据，支持分页和筛选。

    Args:
        page: 页码，从 1 开始
        size: 每页数量，最大 500
        is_active: 筛选是否启用的校区

    Returns:
        ResponseModel: 包含校区列表和总数
    """
    if error := _check_crm_config():
        return error

    try:
        crm_client = CRMClient()
        items, total = await crm_client.get_campuses(
            page=page, size=size, is_active=is_active
        )

        logger.debug(f"获取校区列表成功: {total} 个校区")

        return ResponseModel.success(
            data=CampusListResponse(items=items, total=total),
            message="获取成功",
        )

    except CRMClientError as e:
        logger.warning(f"获取校区列表失败: {e.message}")
        return ResponseModel.error(code=e.status_code, message=e.message)
    except Exception as e:
        logger.error(f"获取校区列表异常: {e}")
        return ResponseModel.error(code=500, message="获取校区列表失败")


@router.get("/departments", response_model=ResponseModel[DepartmentListResponse])
async def get_departments(
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(100, ge=1, le=500, description="每页数量"),
    is_active: bool | None = Query(None, description="筛选是否启用"),
):
    """获取部门列表

    从 CRM 系统获取部门数据，支持分页和筛选。

    Args:
        page: 页码，从 1 开始
        size: 每页数量，最大 500
        is_active: 筛选是否启用的部门

    Returns:
        ResponseModel: 包含部门列表和总数
    """
    if error := _check_crm_config():
        return error

    try:
        crm_client = CRMClient()
        items, total = await crm_client.get_departments(
            page=page, size=size, is_active=is_active
        )

        logger.debug(f"获取部门列表成功: {total} 个部门")

        return ResponseModel.success(
            data=DepartmentListResponse(items=items, total=total),
            message="获取成功",
        )

    except CRMClientError as e:
        logger.warning(f"获取部门列表失败: {e.message}")
        return ResponseModel.error(code=e.status_code, message=e.message)
    except Exception as e:
        logger.error(f"获取部门列表异常: {e}")
        return ResponseModel.error(code=500, message="获取部门列表失败")


@router.get("/positions", response_model=ResponseModel[PositionListResponse])
async def get_positions(
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(100, ge=1, le=500, description="每页数量"),
    is_active: bool | None = Query(None, description="筛选是否启用"),
):
    """获取职位列表

    从 CRM 系统获取职位数据，支持分页和筛选。

    Args:
        page: 页码，从 1 开始
        size: 每页数量，最大 500
        is_active: 筛选是否启用的职位

    Returns:
        ResponseModel: 包含职位列表和总数
    """
    if error := _check_crm_config():
        return error

    try:
        crm_client = CRMClient()
        items, total = await crm_client.get_positions(
            page=page, size=size, is_active=is_active
        )

        logger.debug(f"获取职位列表成功: {total} 个职位")

        return ResponseModel.success(
            data=PositionListResponse(items=items, total=total),
            message="获取成功",
        )

    except CRMClientError as e:
        logger.warning(f"获取职位列表失败: {e.message}")
        return ResponseModel.error(code=e.status_code, message=e.message)
    except Exception as e:
        logger.error(f"获取职位列表异常: {e}")
        return ResponseModel.error(code=500, message="获取职位列表失败")
