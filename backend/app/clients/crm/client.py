"""CRM Open API 客户端"""

import httpx
from loguru import logger

from app.clients.crm.schemas import (
    CRMCampus,
    CRMDepartment,
    CRMLoginResponse,
    CRMPosition,
    CRMTokenInfo,
    CRMUser,
)
from app.config import settings


class CRMClientError(Exception):
    """CRM 客户端错误"""

    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class CRMClient:
    """CRM Open API 客户端

    用于调用 CRM 系统的开放 API，实现用户认证和组织架构数据共享。
    """

    def __init__(
        self,
        base_url: str | None = None,
        service_key: str | None = None,
        timeout: float = 30.0,
    ):
        self.base_url = (base_url or settings.crm_base_url).rstrip("/")
        self.service_key = service_key or settings.crm_service_key
        self.timeout = timeout
        self._access_token: str | None = None
        self._refresh_token: str | None = None

    def _headers(self, with_auth: bool = False) -> dict[str, str]:
        """构建请求头"""
        headers = {
            "Content-Type": "application/json",
            "X-Service-Key": self.service_key,
        }
        if with_auth and self._access_token:
            headers["Authorization"] = f"Bearer {self._access_token}"
        return headers

    def _handle_response(self, response: httpx.Response) -> dict:
        """处理响应"""
        if response.status_code == 401:
            raise CRMClientError("认证失败", 401)
        if response.status_code == 403:
            raise CRMClientError("权限不足", 403)
        if response.status_code == 429:
            raise CRMClientError("请求过于频繁", 429)
        if response.status_code >= 500:
            raise CRMClientError("CRM 服务器错误", response.status_code)

        data = response.json()
        if not data.get("success", True):
            raise CRMClientError(data.get("message", "请求失败"), response.status_code)
        return data

    async def login(self, username: str, password: str) -> CRMLoginResponse:
        """用户登录

        Args:
            username: 用户名
            password: 密码

        Returns:
            CRMLoginResponse: 登录响应，包含 token 和用户信息
        """
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/auth/login",
                headers=self._headers(),
                json={"username": username, "password": password},
            )

            data = self._handle_response(response)

            # 保存 token
            result = CRMLoginResponse(**data["data"])
            self._access_token = result.access_token
            self._refresh_token = result.refresh_token

            logger.info(f"CRM 用户登录成功: {result.user.name}")
            return result

    async def verify_token(self, token: str) -> CRMTokenInfo:
        """验证 Token

        Args:
            token: 要验证的访问令牌

        Returns:
            CRMTokenInfo: Token 信息
        """
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/auth/verify-token",
                headers=self._headers(),
                json={"token": token},
            )

            data = self._handle_response(response)
            return CRMTokenInfo(**data["data"])

    async def refresh_token(self, refresh_token: str | None = None) -> str:
        """刷新访问令牌

        Args:
            refresh_token: 刷新令牌，不传则使用内部保存的

        Returns:
            str: 新的访问令牌
        """
        token = refresh_token or self._refresh_token
        if not token:
            raise CRMClientError("没有可用的刷新令牌", 400)

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/auth/refresh",
                headers=self._headers(),
                json={"refresh_token": token},
            )

            data = self._handle_response(response)
            self._access_token = data["data"]["access_token"]
            logger.info("CRM Token 刷新成功")
            return self._access_token

    async def get_current_user(self, access_token: str | None = None) -> CRMUser:
        """获取当前用户信息

        Args:
            access_token: 访问令牌，不传则使用内部保存的

        Returns:
            CRMUser: 用户信息
        """
        if access_token:
            self._access_token = access_token

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                f"{self.base_url}/users/me",
                headers=self._headers(with_auth=True),
            )

            data = self._handle_response(response)
            return CRMUser(**data["data"])

    async def get_campuses(
        self, page: int = 1, size: int = 100, is_active: bool | None = None
    ) -> tuple[list[CRMCampus], int]:
        """获取校区列表

        Args:
            page: 页码
            size: 每页数量
            is_active: 筛选是否启用

        Returns:
            tuple[list[CRMCampus], int]: 校区列表和总数
        """
        params = {"page": page, "size": size}
        if is_active is not None:
            params["is_active"] = is_active

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                f"{self.base_url}/organization/campuses",
                headers=self._headers(),
                params=params,
            )

            data = self._handle_response(response)
            items = [CRMCampus(**item) for item in data["data"]["items"]]
            return items, data["data"]["total"]

    async def get_departments(
        self, page: int = 1, size: int = 100, is_active: bool | None = None
    ) -> tuple[list[CRMDepartment], int]:
        """获取部门列表

        Args:
            page: 页码
            size: 每页数量
            is_active: 筛选是否启用

        Returns:
            tuple[list[CRMDepartment], int]: 部门列表和总数
        """
        params = {"page": page, "size": size}
        if is_active is not None:
            params["is_active"] = is_active

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                f"{self.base_url}/organization/departments",
                headers=self._headers(),
                params=params,
            )

            data = self._handle_response(response)
            items = [CRMDepartment(**item) for item in data["data"]["items"]]
            return items, data["data"]["total"]

    async def get_positions(
        self, page: int = 1, size: int = 100, is_active: bool | None = None
    ) -> tuple[list[CRMPosition], int]:
        """获取职位列表

        Args:
            page: 页码
            size: 每页数量
            is_active: 筛选是否启用

        Returns:
            tuple[list[CRMPosition], int]: 职位列表和总数
        """
        params = {"page": page, "size": size}
        if is_active is not None:
            params["is_active"] = is_active

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                f"{self.base_url}/organization/positions",
                headers=self._headers(),
                params=params,
            )

            data = self._handle_response(response)
            items = [CRMPosition(**item) for item in data["data"]["items"]]
            return items, data["data"]["total"]


# 单例客户端
crm_client = CRMClient()
