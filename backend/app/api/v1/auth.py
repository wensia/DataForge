"""认证管理接口 - 登录/登出/API密钥测试"""

from datetime import datetime

from fastapi import APIRouter, Request
from loguru import logger
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import engine
from app.models.user import User, UserResponse
from app.schemas.response import ResponseModel
from app.utils.auth import generate_api_key
from app.utils.jwt_auth import (
    TokenResponse,
    create_access_token,
    get_password_hash,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["认证管理"])


class LoginRequest(BaseModel):
    """登录请求"""

    email: str
    password: str


class LoginResponse(BaseModel):
    """登录响应"""

    user: UserResponse
    token: TokenResponse


class ProfileUpdateRequest(BaseModel):
    """更新个人资料请求"""

    name: str | None = None
    current_password: str | None = None
    new_password: str | None = None


@router.post("/login", response_model=ResponseModel[LoginResponse])
async def login(data: LoginRequest):
    """用户登录

    使用邮箱和密码登录，返回 JWT token

    Args:
        data: 登录请求数据

    Returns:
        ResponseModel: 包含用户信息和 token 的响应
    """
    with Session(engine) as session:
        # 查找用户
        statement = select(User).where(User.email == data.email)
        user = session.exec(statement).first()

        if not user:
            return ResponseModel.error(code=401, message="邮箱或密码错误")

        if not user.is_active:
            return ResponseModel.error(code=403, message="账号已被禁用")

        # 验证密码
        if not verify_password(data.password, user.password_hash):
            return ResponseModel.error(code=401, message="邮箱或密码错误")

        # 更新最后登录时间
        user.last_login_at = datetime.utcnow()
        session.add(user)
        session.commit()
        session.refresh(user)

        # 生成 token
        token = create_access_token(user.id, user.email, user.role.value)

        logger.info(f"用户登录成功: {user.email}")

        return ResponseModel.success(
            data=LoginResponse(
                user=UserResponse(
                    id=user.id,
                    email=user.email,
                    name=user.name,
                    role=user.role,
                    is_active=user.is_active,
                    created_at=user.created_at,
                    last_login_at=user.last_login_at,
                ),
                token=token,
            ),
            message="登录成功",
        )


@router.get("/me", response_model=ResponseModel[UserResponse])
async def get_current_user(request: Request):
    """获取当前登录用户信息

    需要在请求头中携带 JWT token

    Returns:
        ResponseModel: 当前用户信息
    """
    user_id = getattr(request.state, "user_id", None)

    if not user_id:
        return ResponseModel.error(code=401, message="未登录")

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


@router.put("/me", response_model=ResponseModel[UserResponse])
async def update_current_user(request: Request, data: ProfileUpdateRequest):
    """更新当前登录用户信息

    可以更新用户名称和密码

    Args:
        data: 更新数据

    Returns:
        ResponseModel: 更新后的用户信息
    """
    user_id = getattr(request.state, "user_id", None)

    if not user_id:
        return ResponseModel.error(code=401, message="未登录")

    with Session(engine) as session:
        user = session.get(User, user_id)
        if not user:
            return ResponseModel.error(code=404, message="用户不存在")

        # 更新名称
        if data.name is not None:
            user.name = data.name

        # 更新密码
        if data.new_password:
            if not data.current_password:
                return ResponseModel.error(code=400, message="请输入当前密码")

            if not verify_password(data.current_password, user.password_hash):
                return ResponseModel.error(code=400, message="当前密码错误")

            user.password_hash = get_password_hash(data.new_password)

        user.updated_at = datetime.utcnow()
        session.add(user)
        session.commit()
        session.refresh(user)

        logger.info(f"用户更新个人资料: {user.email}")

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
            message="个人资料更新成功",
        )


@router.get("/test", response_model=ResponseModel[dict])
async def test_api_key(request: Request):
    """测试API密钥

    验证当前请求的API密钥是否有效,并返回客户端信息

    Returns:
        ResponseModel: 包含客户端信息的响应
    """
    # 从请求状态获取客户端信息(由中间件设置)
    client_id = getattr(request.state, "client_id", "unknown")
    client_metadata = getattr(request.state, "client_metadata", {})

    return ResponseModel.success(
        data={
            "client_id": client_id,
            "description": client_metadata.get("description", ""),
            "created_at": client_metadata.get("created_at", ""),
            "message": "API密钥有效",
        },
        message="验证成功",
    )


@router.post("/generate-key", response_model=ResponseModel[dict])
async def generate_new_api_key():
    """生成新的API密钥(仅供开发使用)

    注意: 生产环境应禁用此接口或添加管理员权限验证

    Returns:
        ResponseModel: 包含新生成密钥的响应
    """
    new_key = generate_api_key()

    return ResponseModel.success(
        data={
            "api_key": new_key,
            "length": len(new_key),
            "usage": f"在查询参数中添加: ?api_key={new_key}",
            "example": "curl 'http://localhost:8847/api/v1/accounts?api_key="
            + new_key
            + "'",
        },
        message="密钥生成成功",
    )
