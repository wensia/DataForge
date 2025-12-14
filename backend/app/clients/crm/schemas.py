"""CRM Open API 数据模型"""

from datetime import datetime

from pydantic import BaseModel


class CRMIdentity(BaseModel):
    """CRM 用户身份"""

    identity_id: str
    campus_id: str
    campus_name: str
    department_id: str
    department_name: str
    position_id: str
    position_name: str
    position_level: int
    is_active: bool
    can_manage_leads: bool = False
    can_access_pool: bool = False


class CRMUser(BaseModel):
    """CRM 用户信息"""

    id: str
    username: str
    name: str
    email: str | None = None
    phone: str | None = None
    is_superuser: bool = False
    is_active: bool = True
    joined_at: datetime | None = None
    identities: list[CRMIdentity] = []


class CRMLoginResponse(BaseModel):
    """CRM 登录响应"""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: CRMUser


class CRMTokenInfo(BaseModel):
    """CRM Token 验证信息"""

    valid: bool
    user_id: str | None = None
    username: str | None = None
    expires_at: datetime | None = None
    remaining_seconds: int = 0


class CRMCampus(BaseModel):
    """CRM 校区"""

    id: str
    name: str
    address: str | None = None
    contact_phone: str | None = None
    is_active: bool = True
    area_id: str | None = None
    area_name: str | None = None


class CRMDepartment(BaseModel):
    """CRM 部门"""

    id: str
    name: str
    description: str | None = None
    sort_order: int = 0
    is_active: bool = True


class CRMPosition(BaseModel):
    """CRM 职位"""

    id: str
    name: str
    level: int
    description: str | None = None
    is_active: bool = True


class CRMPaginatedResponse(BaseModel):
    """CRM 分页响应"""

    items: list
    total: int
