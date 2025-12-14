"""CRM Open API 客户端模块"""

from app.clients.crm.client import CRMClient, CRMClientError
from app.clients.crm.schemas import (
    CRMCampus,
    CRMDepartment,
    CRMIdentity,
    CRMLoginResponse,
    CRMPosition,
    CRMTokenInfo,
    CRMUser,
)

__all__ = [
    "CRMClient",
    "CRMClientError",
    "CRMUser",
    "CRMIdentity",
    "CRMLoginResponse",
    "CRMTokenInfo",
    "CRMCampus",
    "CRMDepartment",
    "CRMPosition",
]
