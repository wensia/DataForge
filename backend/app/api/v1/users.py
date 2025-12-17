"""用户管理接口 - 仅管理员可用"""

from datetime import datetime

from fastapi import APIRouter, Query, Request
from loguru import logger
from pydantic import BaseModel
from sqlmodel import Session, select

from app.clients.crm import CRMClient, CRMClientError
from app.config import settings
from app.database import engine
from app.models.api_key import ApiKey
from app.models.user import (
    User,
    UserIdentity,
    UserResponse,
    UserRole,
    UserUpdate,
    UserWithIdentities,
)
from app.schemas.response import ResponseModel

router = APIRouter(prefix="/users", tags=["用户管理"])


class CRMUserListResponse(BaseModel):
    """CRM 用户列表响应"""

    items: list[UserWithIdentities]
    total: int


def require_admin(request: Request) -> bool:
    """检查当前用户是否为管理员"""
    return getattr(request.state, "user_role", None) == UserRole.ADMIN.value


@router.get("", response_model=ResponseModel[CRMUserListResponse])
async def list_users(
    request: Request,
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(100, ge=1, le=500, description="每页数量"),
    search: str | None = Query(None, description="搜索关键词"),
    is_active: bool | None = Query(None, description="按启用状态筛选"),
    campus_id: str | None = Query(None, description="按校区筛选"),
    department_id: str | None = Query(None, description="按部门筛选"),
):
    """获取用户列表 (从 CRM 获取)

    Args:
        page: 页码
        size: 每页数量
        search: 搜索关键词（姓名/用户名）
        is_active: 按启用状态筛选
        campus_id: 按校区筛选
        department_id: 按部门筛选

    Returns:
        ResponseModel: 用户列表（包含身份信息）
    """
    # 检查 CRM 配置
    if not settings.crm_base_url or not settings.crm_service_key:
        return ResponseModel.error(code=503, message="CRM 服务未配置")

    try:
        crm_client = CRMClient()
        crm_users, total = await crm_client.get_users(
            page=page,
            size=size,
            search=search,
            is_active=is_active,
            campus_id=campus_id,
            department_id=department_id,
        )

        # 获取所有 CRM 用户的 crm_id
        crm_ids = [u.id for u in crm_users]

        # 查询本地已存在的用户记录
        with Session(engine) as session:
            existing_users = session.exec(
                select(User).where(User.crm_id.in_(crm_ids))
            ).all()
            local_user_map = {u.crm_id: u for u in existing_users}

        # 转换为响应格式
        items = []
        for u in crm_users:
            # 查找或创建本地用户记录
            local_user = local_user_map.get(u.id)
            if not local_user:
                # 创建本地用户记录
                with Session(engine) as session:
                    local_user = User(
                        email=u.email
                        if u.email
                        else None,  # 空字符串转为 None 避免唯一性冲突
                        username=u.username,
                        crm_id=u.id,
                        name=u.name,
                        phone=u.phone,
                        role=UserRole.ADMIN if u.is_superuser else UserRole.USER,
                        is_active=u.is_active,
                        ai_enabled=False,
                        created_at=u.joined_at or datetime.utcnow(),
                    )
                    session.add(local_user)
                    session.commit()
                    session.refresh(local_user)
                    local_user_map[u.id] = local_user

            identities = [
                UserIdentity(
                    identity_id=i.identity_id,
                    campus_id=i.campus_id,
                    campus_name=i.campus_name,
                    department_id=i.department_id,
                    department_name=i.department_name,
                    position_id=i.position_id,
                    position_name=i.position_name,
                    position_level=i.position_level,
                    is_active=i.is_active,
                )
                for i in u.identities
            ]
            items.append(
                UserWithIdentities(
                    id=local_user.id,  # 使用本地用户 ID
                    email=u.email,
                    username=u.username,
                    crm_id=u.id,
                    name=u.name,
                    phone=u.phone,
                    role=local_user.role,  # 使用本地角色设置
                    is_active=local_user.is_active,  # 使用本地启用状态
                    ai_enabled=local_user.ai_enabled,  # 使用本地 AI 设置
                    analysis_enabled=local_user.analysis_enabled,  # 数据分析权限
                    call_type_filter=local_user.call_type_filter,  # 通话类型过滤（已废弃）
                    data_filters=local_user.data_filters,  # 数据筛选条件
                    created_at=u.joined_at or datetime.utcnow(),
                    last_login_at=local_user.last_login_at,
                    identities=identities,
                )
            )

        logger.debug(f"获取 CRM 用户列表: {total} 个用户")

        return ResponseModel.success(
            data=CRMUserListResponse(items=items, total=total),
            message="获取成功",
        )

    except CRMClientError as e:
        logger.warning(f"获取 CRM 用户列表失败: {e.message}")
        return ResponseModel.error(code=e.status_code, message=e.message)
    except Exception as e:
        logger.error(f"获取用户列表异常: {e}")
        return ResponseModel.error(code=500, message="获取用户列表失败")


@router.get("/{user_id}", response_model=ResponseModel)
async def get_user(request: Request, user_id: int):
    """获取用户详情 (仅管理员)

    Args:
        user_id: 用户ID

    Returns:
        ResponseModel: 用户信息
    """
    if not require_admin(request):
        return ResponseModel.error(code=403, message="需要管理员权限")

    with Session(engine) as session:
        user = session.get(User, user_id)
        if not user:
            return ResponseModel.error(code=404, message="用户不存在")

        return ResponseModel.success(
            data=UserResponse(
                id=user.id,
                email=user.email,
                username=user.username,
                crm_id=user.crm_id,
                name=user.name,
                phone=user.phone,
                role=user.role,
                is_active=user.is_active,
                ai_enabled=user.ai_enabled,
                analysis_enabled=user.analysis_enabled,
                call_type_filter=user.call_type_filter,
                data_filters=user.data_filters,
                created_at=user.created_at,
                last_login_at=user.last_login_at,
            )
        )


@router.put("/{user_id}", response_model=ResponseModel)
async def update_user(request: Request, user_id: int, data: UserUpdate):
    """更新用户本地扩展信息 (仅管理员)

    仅可更新本地扩展字段（角色、启用状态、AI功能），
    用户基本信息由 CRM 系统管理。

    Args:
        user_id: 用户ID
        data: 更新数据

    Returns:
        ResponseModel: 更新后的用户信息
    """
    if not require_admin(request):
        return ResponseModel.error(code=403, message="需要管理员权限")

    with Session(engine) as session:
        user = session.get(User, user_id)
        if not user:
            return ResponseModel.error(code=404, message="用户不存在")

        # 只更新本地扩展字段
        if data.role is not None:
            user.role = data.role

        if data.is_active is not None:
            user.is_active = data.is_active

        if data.ai_enabled is not None:
            user.ai_enabled = data.ai_enabled

        if data.analysis_enabled is not None:
            user.analysis_enabled = data.analysis_enabled

        if data.call_type_filter is not None:
            # 空字符串转为 None 表示不限制（已废弃，保留兼容）
            user.call_type_filter = (
                data.call_type_filter if data.call_type_filter else None
            )

        # 处理 data_filters（新的筛选条件配置）
        if data.data_filters is not None:
            # 清理空值：移除值为 None 或空列表的键
            cleaned_filters = {}
            for key, value in data.data_filters.items():
                if value is not None:
                    if isinstance(value, list) and len(value) == 0:
                        continue
                    if isinstance(value, str) and value == "":
                        continue
                    cleaned_filters[key] = value
            user.data_filters = cleaned_filters if cleaned_filters else None

        user.updated_at = datetime.utcnow()

        session.add(user)
        session.commit()
        session.refresh(user)

        logger.info(f"更新用户: {user.username or user.email}")

        return ResponseModel.success(
            data=UserResponse(
                id=user.id,
                email=user.email,
                username=user.username,
                crm_id=user.crm_id,
                name=user.name,
                phone=user.phone,
                role=user.role,
                is_active=user.is_active,
                ai_enabled=user.ai_enabled,
                analysis_enabled=user.analysis_enabled,
                call_type_filter=user.call_type_filter,
                data_filters=user.data_filters,
                created_at=user.created_at,
                last_login_at=user.last_login_at,
            ),
            message="用户更新成功",
        )


@router.post("/{user_id}/api-keys/{key_id}", response_model=ResponseModel)
async def assign_api_key_to_user(request: Request, user_id: int, key_id: int):
    """为用户分配 API 密钥 (仅管理员)

    Args:
        user_id: 用户ID
        key_id: API密钥ID

    Returns:
        ResponseModel: 分配结果
    """
    if not require_admin(request):
        return ResponseModel.error(code=403, message="需要管理员权限")

    with Session(engine) as session:
        user = session.get(User, user_id)
        if not user:
            return ResponseModel.error(code=404, message="用户不存在")

        api_key = session.get(ApiKey, key_id)
        if not api_key:
            return ResponseModel.error(code=404, message="API密钥不存在")

        api_key.owner_id = user_id
        session.add(api_key)
        session.commit()

        logger.info(f"为用户 {user.email} 分配 API 密钥 {key_id}")

        return ResponseModel.success(message=f"API密钥已分配给用户 {user.email}")


@router.delete("/{user_id}/api-keys/{key_id}", response_model=ResponseModel)
async def unassign_api_key_from_user(request: Request, user_id: int, key_id: int):
    """取消用户的 API 密钥分配 (仅管理员)

    Args:
        user_id: 用户ID
        key_id: API密钥ID

    Returns:
        ResponseModel: 取消分配结果
    """
    if not require_admin(request):
        return ResponseModel.error(code=403, message="需要管理员权限")

    with Session(engine) as session:
        api_key = session.get(ApiKey, key_id)
        if not api_key:
            return ResponseModel.error(code=404, message="API密钥不存在")

        if api_key.owner_id != user_id:
            return ResponseModel.error(code=400, message="该密钥不属于此用户")

        api_key.owner_id = None
        session.add(api_key)
        session.commit()

        logger.info(f"取消用户 {user_id} 的 API 密钥 {key_id} 分配")

        return ResponseModel.success(message="API密钥分配已取消")


@router.get("/{user_id}/api-keys", response_model=ResponseModel)
async def get_user_api_keys(request: Request, user_id: int):
    """获取用户的 API 密钥列表 (仅管理员)

    Args:
        user_id: 用户ID

    Returns:
        ResponseModel: API密钥列表
    """
    if not require_admin(request):
        return ResponseModel.error(code=403, message="需要管理员权限")

    with Session(engine) as session:
        user = session.get(User, user_id)
        if not user:
            return ResponseModel.error(code=404, message="用户不存在")

        statement = select(ApiKey).where(ApiKey.owner_id == user_id)
        api_keys = session.exec(statement).all()

        return ResponseModel.success(
            data={
                "items": [
                    {
                        "id": k.id,
                        "key": k.key[:8] + "..." + k.key[-4:]
                        if len(k.key) > 12
                        else k.key,
                        "name": k.name,
                        "is_active": k.is_active,
                        "created_at": k.created_at.isoformat()
                        if k.created_at
                        else None,
                    }
                    for k in api_keys
                ],
                "total": len(api_keys),
            }
        )
