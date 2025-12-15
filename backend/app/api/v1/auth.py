"""认证管理接口 - 登录/登出/API密钥测试"""

from datetime import datetime

from fastapi import APIRouter, Request
from loguru import logger
from pydantic import BaseModel
from sqlmodel import Session, select

from app.clients.crm import CRMClient, CRMClientError
from app.config import settings
from app.database import engine
from app.models.user import (
    User,
    UserIdentity,
    UserResponse,
    UserRole,
    UserWithIdentities,
)
from app.schemas.response import ResponseModel
from app.utils.auth import generate_api_key
from app.utils.jwt_auth import TokenResponse, create_access_token

router = APIRouter(prefix="/auth", tags=["认证管理"])


class LoginRequest(BaseModel):
    """登录请求 - 仅支持 CRM 认证"""

    username: str  # CRM 用户名
    password: str


class LoginResponse(BaseModel):
    """登录响应"""

    user: UserWithIdentities
    token: TokenResponse
    crm_token: str | None = None  # CRM 访问令牌（用于后续调用 CRM API）


class ProfileUpdateRequest(BaseModel):
    """更新个人资料请求"""

    name: str | None = None


async def _login_via_crm(
    username: str, password: str, session: Session
) -> tuple[User, list[UserIdentity], str]:
    """通过 CRM 系统登录

    Args:
        username: CRM 用户名
        password: 密码
        session: 数据库会话

    Returns:
        tuple: (用户对象, 身份列表, CRM 访问令牌)

    Raises:
        CRMClientError: CRM 登录失败时抛出
    """
    crm_client = CRMClient()
    login_result = await crm_client.login(username, password)
    crm_user = login_result.user

    # 查找或创建本地用户
    statement = select(User).where(User.crm_id == crm_user.id)
    user = session.exec(statement).first()

    if not user:
        # 创建新用户
        user = User(
            crm_id=crm_user.id,
            username=crm_user.username,
            name=crm_user.name,
            email=crm_user.email,
            phone=crm_user.phone,
            role=UserRole.ADMIN if crm_user.is_superuser else UserRole.USER,
            is_active=crm_user.is_active,
            crm_synced_at=datetime.utcnow(),
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        logger.info(f"从 CRM 创建新用户: {user.name} (crm_id={user.crm_id})")
    else:
        # 更新用户信息
        user.username = crm_user.username
        user.name = crm_user.name
        user.email = crm_user.email
        user.phone = crm_user.phone
        user.role = UserRole.ADMIN if crm_user.is_superuser else UserRole.USER
        user.is_active = crm_user.is_active
        user.crm_synced_at = datetime.utcnow()
        session.add(user)
        session.commit()
        session.refresh(user)
        logger.debug(f"更新 CRM 用户信息: {user.name}")

    # 转换身份信息
    identities = [
        UserIdentity(
            identity_id=identity.identity_id,
            campus_id=identity.campus_id,
            campus_name=identity.campus_name,
            department_id=identity.department_id,
            department_name=identity.department_name,
            position_id=identity.position_id,
            position_name=identity.position_name,
            position_level=identity.position_level,
            is_active=identity.is_active,
        )
        for identity in crm_user.identities
    ]

    return user, identities, login_result.access_token


@router.post("/login", response_model=ResponseModel[LoginResponse])
async def login(data: LoginRequest):
    """用户登录 - 仅支持 CRM 认证

    通过 CRM 系统验证用户名和密码，成功后创建或更新本地用户记录。

    Args:
        data: 登录请求数据（用户名 + 密码）

    Returns:
        ResponseModel: 包含用户信息和 token 的响应
    """
    # 检查 CRM 配置
    if not settings.crm_base_url or not settings.crm_service_key:
        return ResponseModel.error(code=503, message="CRM 服务未配置")

    with Session(engine) as session:
        user: User | None = None
        identities: list[UserIdentity] = []
        crm_token: str | None = None

        try:
            user, identities, crm_token = await _login_via_crm(
                data.username, data.password, session
            )
        except CRMClientError as e:
            logger.warning(f"CRM 登录失败: {e.message}")
            return ResponseModel.error(code=e.status_code, message=e.message)
        except Exception as e:
            logger.error(f"CRM 登录异常: {e}")
            return ResponseModel.error(code=500, message="登录服务异常，请稍后重试")

        if not user:
            return ResponseModel.error(code=401, message="用户名或密码错误")

        if not user.is_active:
            return ResponseModel.error(code=403, message="账号已被禁用")

        # 更新最后登录时间
        user.last_login_at = datetime.utcnow()
        session.add(user)
        session.commit()
        session.refresh(user)

        # 生成本地 JWT token
        login_identifier = user.email or user.username or str(user.id)
        token = create_access_token(user.id, login_identifier, user.role.value)

        logger.info(f"用户登录成功: {user.name}")

        return ResponseModel.success(
            data=LoginResponse(
                user=UserWithIdentities(
                    id=user.id,
                    email=user.email,
                    username=user.username,
                    crm_id=user.crm_id,
                    name=user.name,
                    phone=user.phone,
                    role=user.role,
                    is_active=user.is_active,
                    ai_enabled=user.ai_enabled,
                    created_at=user.created_at,
                    last_login_at=user.last_login_at,
                    identities=identities,
                ),
                token=token,
                crm_token=crm_token,
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
                username=user.username,
                crm_id=user.crm_id,
                name=user.name,
                phone=user.phone,
                role=user.role,
                is_active=user.is_active,
                ai_enabled=user.ai_enabled,
                created_at=user.created_at,
                last_login_at=user.last_login_at,
            )
        )


@router.put("/me", response_model=ResponseModel[UserResponse])
async def update_current_user(request: Request, data: ProfileUpdateRequest):
    """更新当前登录用户信息

    仅可更新用户显示名称（其他信息由 CRM 系统管理）

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

        user.updated_at = datetime.utcnow()
        session.add(user)
        session.commit()
        session.refresh(user)

        logger.info(f"用户更新个人资料: {user.username or user.email}")

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
