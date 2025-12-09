"""JWT 认证工具函数"""

from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from jose import JWTError, jwt
from loguru import logger
from pydantic import BaseModel

from app.config import settings


class TokenPayload(BaseModel):
    """JWT token 载荷"""

    sub: int | str  # user_id (支持整数或字符串格式，兼容旧token)
    email: str
    role: str
    exp: datetime

    @property
    def user_id(self) -> int:
        """获取用户ID（整数）"""
        return int(self.sub)


class TokenResponse(BaseModel):
    """Token 响应模型"""

    access_token: str
    token_type: str = "bearer"
    expires_in: int  # 秒


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码"""
    return bcrypt.checkpw(
        plain_password.encode("utf-8"), hashed_password.encode("utf-8")
    )


def get_password_hash(password: str) -> str:
    """生成密码哈希"""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def create_access_token(user_id: int, email: str, role: str) -> TokenResponse:
    """创建 JWT access token"""
    expire = datetime.utcnow() + timedelta(hours=settings.jwt_expire_hours)

    payload = {
        "sub": str(user_id),  # JWT 规范要求 sub 必须是字符串
        "email": email,
        "role": role,
        "exp": expire,
    }

    token = jwt.encode(payload, settings.jwt_secret_key, algorithm="HS256")

    return TokenResponse(
        access_token=token, expires_in=settings.jwt_expire_hours * 3600
    )


def decode_token(token: str) -> Optional[TokenPayload]:
    """解码并验证 JWT token"""
    try:
        # 禁用 sub claim 验证，因为旧 token 中 sub 是整数
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=["HS256"],
            options={"verify_sub": False},
        )
        logger.debug(f"JWT 解码成功: user_id={payload.get('sub')}, email={payload.get('email')}")
        return TokenPayload(**payload)
    except JWTError as e:
        logger.warning(f"JWT 解码失败: {type(e).__name__}: {e}")
        return None
