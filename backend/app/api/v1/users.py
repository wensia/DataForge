"""用户管理接口 - 仅管理员可用"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Query, Request
from loguru import logger
from sqlmodel import Session, select

from app.database import engine
from app.models.api_key import ApiKey
from app.models.user import User, UserCreate, UserResponse, UserRole, UserUpdate
from app.schemas.response import ResponseModel
from app.utils.jwt_auth import get_password_hash

router = APIRouter(prefix="/users", tags=["用户管理"])


def require_admin(request: Request) -> bool:
    """检查当前用户是否为管理员"""
    return getattr(request.state, "user_role", None) == UserRole.ADMIN.value


@router.get("", response_model=ResponseModel)
async def list_users(
    request: Request,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    is_active: Optional[bool] = None,
):
    """获取用户列表 (仅管理员)

    Args:
        skip: 跳过的记录数
        limit: 返回的最大记录数
        is_active: 按启用状态筛选

    Returns:
        ResponseModel: 用户列表
    """
    if not require_admin(request):
        return ResponseModel.error(code=403, message="需要管理员权限")

    with Session(engine) as session:
        statement = select(User)
        if is_active is not None:
            statement = statement.where(User.is_active == is_active)
        statement = statement.offset(skip).limit(limit)

        users = session.exec(statement).all()

        return ResponseModel.success(
            data={
                "items": [
                    UserResponse(
                        id=u.id,
                        email=u.email,
                        name=u.name,
                        role=u.role,
                        is_active=u.is_active,
                        created_at=u.created_at,
                        last_login_at=u.last_login_at,
                    )
                    for u in users
                ],
                "total": len(users),
            }
        )


@router.post("", response_model=ResponseModel)
async def create_user(request: Request, data: UserCreate):
    """创建新用户 (仅管理员)

    Args:
        data: 用户创建数据

    Returns:
        ResponseModel: 创建的用户信息
    """
    if not require_admin(request):
        return ResponseModel.error(code=403, message="需要管理员权限")

    with Session(engine) as session:
        # 检查邮箱是否已存在
        existing = session.exec(select(User).where(User.email == data.email)).first()
        if existing:
            return ResponseModel.error(code=400, message="该邮箱已被注册")

        # 创建用户
        user = User(
            email=data.email,
            password_hash=get_password_hash(data.password),
            name=data.name,
            role=data.role,
        )

        session.add(user)
        session.commit()
        session.refresh(user)

        logger.info(f"创建用户: {user.email} (角色: {user.role})")

        return ResponseModel.success(
            data=UserResponse(
                id=user.id,
                email=user.email,
                name=user.name,
                role=user.role,
                is_active=user.is_active,
                created_at=user.created_at,
                last_login_at=user.last_login_at,
            ),
            message="用户创建成功",
        )


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
                name=user.name,
                role=user.role,
                is_active=user.is_active,
                created_at=user.created_at,
                last_login_at=user.last_login_at,
            )
        )


@router.put("/{user_id}", response_model=ResponseModel)
async def update_user(request: Request, user_id: int, data: UserUpdate):
    """更新用户 (仅管理员)

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

        # 更新字段
        if data.email is not None:
            # 检查邮箱是否被其他用户使用
            existing = session.exec(
                select(User).where(User.email == data.email, User.id != user_id)
            ).first()
            if existing:
                return ResponseModel.error(code=400, message="该邮箱已被使用")
            user.email = data.email

        if data.password is not None:
            user.password_hash = get_password_hash(data.password)

        if data.name is not None:
            user.name = data.name

        if data.role is not None:
            user.role = data.role

        if data.is_active is not None:
            user.is_active = data.is_active

        user.updated_at = datetime.utcnow()

        session.add(user)
        session.commit()
        session.refresh(user)

        logger.info(f"更新用户: {user.email}")

        return ResponseModel.success(
            data=UserResponse(
                id=user.id,
                email=user.email,
                name=user.name,
                role=user.role,
                is_active=user.is_active,
                created_at=user.created_at,
                last_login_at=user.last_login_at,
            ),
            message="用户更新成功",
        )


@router.delete("/{user_id}", response_model=ResponseModel)
async def delete_user(request: Request, user_id: int):
    """删除用户 (仅管理员)

    Args:
        user_id: 用户ID

    Returns:
        ResponseModel: 删除结果
    """
    if not require_admin(request):
        return ResponseModel.error(code=403, message="需要管理员权限")

    # 防止删除自己
    current_user_id = getattr(request.state, "user_id", None)
    if current_user_id == user_id:
        return ResponseModel.error(code=400, message="不能删除自己的账号")

    with Session(engine) as session:
        user = session.get(User, user_id)
        if not user:
            return ResponseModel.error(code=404, message="用户不存在")

        email = user.email
        session.delete(user)
        session.commit()

        logger.info(f"删除用户: {email}")

        return ResponseModel.success(data={"id": user_id}, message="用户删除成功")


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
                        "key": k.key[:8] + "..." + k.key[-4:] if len(k.key) > 12 else k.key,
                        "name": k.name,
                        "is_active": k.is_active,
                        "created_at": k.created_at.isoformat() if k.created_at else None,
                    }
                    for k in api_keys
                ],
                "total": len(api_keys),
            }
        )
