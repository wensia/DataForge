"""云客API客户端基类

提供统一的API调用接口，支持自动登录重试机制。
"""

import json
from abc import ABC
from enum import Enum
from typing import Any, Callable, Optional

import httpx
from loguru import logger

from app.clients.yunke.base import (
    BASE_URL,
    DEFAULT_TIMEOUT,
    get_browser_headers,
    get_common_headers,
)


class LoginErrorCode(Enum):
    """登录相关错误码"""
    
    # 登录失效，需要重新登录
    TOKEN_EXPIRED = "10001"  # token过期
    SESSION_EXPIRED = "10002"  # session过期
    UNAUTHORIZED = "401"  # 未授权
    NOT_LOGGED_IN = "10003"  # 未登录
    
    # 密码错误，不应重试
    PASSWORD_ERROR = "10004"  # 密码错误
    ACCOUNT_LOCKED = "10005"  # 账号锁定
    ACCOUNT_DISABLED = "10006"  # 账号禁用


# 需要重新登录的错误码
RELOGIN_ERROR_CODES = {
    LoginErrorCode.TOKEN_EXPIRED.value,
    LoginErrorCode.SESSION_EXPIRED.value,
    LoginErrorCode.UNAUTHORIZED.value,
    LoginErrorCode.NOT_LOGGED_IN.value,
    "22003",  # 会话过期
    "22004",  # 登录失效
}

# 密码错误，不应重试
PASSWORD_ERROR_CODES = {
    LoginErrorCode.PASSWORD_ERROR.value,
    LoginErrorCode.ACCOUNT_LOCKED.value,
    LoginErrorCode.ACCOUNT_DISABLED.value,
    "22001",  # 密码错误
    "22002",  # 账号锁定
}


class YunkeApiException(Exception):
    """云客API异常"""
    
    def __init__(
        self,
        message: str,
        code: str = "",
        is_password_error: bool = False,
        is_login_required: bool = False,
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.is_password_error = is_password_error
        self.is_login_required = is_login_required


class YunkePasswordException(YunkeApiException):
    """密码错误异常，不应重试"""
    
    def __init__(self, message: str = "密码错误", code: str = ""):
        super().__init__(message, code, is_password_error=True)


class YunkeLoginRequiredException(YunkeApiException):
    """需要重新登录异常"""
    
    def __init__(self, message: str = "登录失效", code: str = ""):
        super().__init__(message, code, is_login_required=True)


class YunkeApiClient(ABC):
    """云客API客户端基类
    
    提供统一的API调用接口，支持：
    - 自动管理cookies和token
    - 登录失效时自动重新登录
    - 密码错误时终止请求
    
    使用示例:
        ```python
        class ReportClient(YunkeApiClient):
            async def get_call_report(self, params: dict) -> dict:
                return await self._request(
                    "POST",
                    "/yunke-report-phone/module/getIndexDetail",
                    json=params,
                )
        
        # 使用
        client = ReportClient(
            phone="13800138000",
            company_code="2fy7qa",
            user_id="xxx",
            cookies={"user": "xxx", "userToken": "xxx"},
            domain="https://crm.yunkecn.com",
            auto_login_callback=auto_login_func,
        )
        result = await client.get_call_report(params)
        ```
    """
    
    def __init__(
        self,
        phone: str,
        company_code: str,
        user_id: str,
        cookies: dict[str, str],
        domain: str | None = None,
        auto_login_callback: Optional[Callable[[], Any]] = None,
        max_retry: int = 1,
    ):
        """初始化客户端
        
        Args:
            phone: 手机号
            company_code: 公司代码
            user_id: 云客用户ID
            cookies: 登录后的cookies
            domain: API域名（不同公司使用不同域名）
            auto_login_callback: 自动登录回调函数，返回新的cookies
            max_retry: 登录失效时的最大重试次数
        """
        self.phone = phone
        self.company_code = company_code
        self.user_id = user_id
        self.cookies = cookies
        self.domain = domain or BASE_URL
        self.auto_login_callback = auto_login_callback
        self.max_retry = max_retry
        
        logger.debug(
            f"初始化云客API客户端: phone={phone}, company={company_code}, domain={self.domain}"
        )
    
    def _get_headers(self, referer: str | None = None) -> dict[str, str]:
        """获取请求头
        
        Args:
            referer: 自定义referer路径
            
        Returns:
            dict: 请求头
        """
        headers = get_common_headers(self.domain)
        headers.update(get_browser_headers())
        
        # 添加公司和用户信息
        headers["company"] = self.company_code
        headers["userid"] = self.user_id
        
        # 设置referer
        if referer:
            headers["referer"] = f"{self.domain}{referer}"
        
        return headers
    
    def _check_response(self, response_data: dict) -> None:
        """检查响应是否正常
        
        Args:
            response_data: 响应数据
            
        Raises:
            YunkePasswordException: 密码错误
            YunkeLoginRequiredException: 需要重新登录
            YunkeApiException: 其他API错误
        """
        # 获取响应码
        code = str(response_data.get("code", ""))
        message = response_data.get("message", "") or response_data.get("msg", "")
        success = response_data.get("success", False)
        
        # 成功响应
        if success or code == "10000" or code == "200":
            return
        
        # 密码错误
        if code in PASSWORD_ERROR_CODES:
            logger.warning(f"密码错误: code={code}, message={message}")
            raise YunkePasswordException(message, code)
        
        # 需要重新登录
        if code in RELOGIN_ERROR_CODES:
            logger.info(f"登录失效: code={code}, message={message}")
            raise YunkeLoginRequiredException(message, code)
        
        # 检查消息内容
        error_keywords = ["登录", "过期", "失效", "session", "token"]
        if any(kw in message.lower() for kw in error_keywords):
            logger.info(f"根据消息判断登录失效: message={message}")
            raise YunkeLoginRequiredException(message, code)
        
        # 其他错误（不重试）
        if not success and code and code != "10000":
            logger.warning(f"API返回错误: code={code}, message={message}")
            raise YunkeApiException(message, code)
    
    async def _do_request(
        self,
        method: str,
        path: str,
        headers: dict[str, str] | None = None,
        **kwargs,
    ) -> dict[str, Any]:
        """执行HTTP请求
        
        Args:
            method: HTTP方法
            path: API路径
            headers: 额外请求头
            **kwargs: 传递给httpx的其他参数
            
        Returns:
            dict: 响应数据
        """
        request_headers = self._get_headers()
        if headers:
            request_headers.update(headers)
        
        async with httpx.AsyncClient(
            base_url=self.domain,
            timeout=DEFAULT_TIMEOUT,
            verify=False,
            cookies=self.cookies,
        ) as client:
            response = await client.request(
                method,
                path,
                headers=request_headers,
                **kwargs,
            )
            response.raise_for_status()
            return response.json()
    
    async def _request(
        self,
        method: str,
        path: str,
        headers: dict[str, str] | None = None,
        referer: str | None = None,
        **kwargs,
    ) -> dict[str, Any]:
        """发起API请求，支持自动登录重试
        
        Args:
            method: HTTP方法
            path: API路径
            headers: 额外请求头
            referer: 自定义referer路径
            **kwargs: 传递给httpx的其他参数
            
        Returns:
            dict: 响应数据
            
        Raises:
            YunkePasswordException: 密码错误，不会重试
            YunkeApiException: API调用失败
        """
        request_headers = self._get_headers(referer)
        if headers:
            request_headers.update(headers)
        
        retry_count = 0
        last_error: Exception | None = None
        
        while retry_count <= self.max_retry:
            try:
                logger.debug(
                    f"发起请求: method={method}, path={path}, retry={retry_count}"
                )
                
                response_data = await self._do_request(
                    method, path, request_headers, **kwargs
                )
                
                # 检查响应
                self._check_response(response_data)
                
                return response_data
                
            except YunkePasswordException:
                # 密码错误，直接抛出不重试
                raise
                
            except YunkeLoginRequiredException as e:
                last_error = e
                retry_count += 1
                
                if retry_count > self.max_retry:
                    logger.error(f"登录重试次数已用尽: max_retry={self.max_retry}")
                    raise YunkeApiException(
                        f"登录失效且重试失败: {e.message}",
                        e.code,
                        is_login_required=True,
                    )
                
                # 尝试自动登录
                if self.auto_login_callback:
                    logger.info(f"尝试自动登录: retry={retry_count}")
                    try:
                        result = await self.auto_login_callback()
                        if result and result.get("success"):
                            # 更新cookies
                            new_cookies = result.get("cookies") or result.get("data", {}).get("cookies")
                            if new_cookies:
                                if isinstance(new_cookies, str):
                                    new_cookies = json.loads(new_cookies)
                                self.cookies = new_cookies
                                logger.info("自动登录成功，已更新cookies")
                            
                            # 更新user_id
                            new_user_id = result.get("user_id") or result.get("data", {}).get("id")
                            if new_user_id:
                                self.user_id = new_user_id
                                request_headers["userid"] = new_user_id
                            
                            continue
                        else:
                            message = result.get("message", "登录失败") if result else "登录失败"
                            raise YunkeApiException(f"自动登录失败: {message}")
                    except YunkePasswordException:
                        # 密码错误，直接抛出
                        raise
                    except Exception as login_error:
                        logger.error(f"自动登录异常: {login_error}")
                        raise YunkeApiException(f"自动登录异常: {login_error}")
                else:
                    logger.warning("未配置自动登录回调")
                    raise
                    
            except httpx.HTTPStatusError as e:
                logger.error(f"HTTP请求失败: status={e.response.status_code}")
                raise YunkeApiException(f"HTTP请求失败: {e.response.status_code}")
                
            except Exception as e:
                logger.error(f"请求异常: {e}")
                raise YunkeApiException(f"请求异常: {e}")
        
        # 不应该到达这里
        if last_error:
            raise last_error
        raise YunkeApiException("未知错误")
    
    def update_credentials(
        self,
        cookies: dict[str, str] | None = None,
        user_id: str | None = None,
    ) -> None:
        """更新凭证信息
        
        Args:
            cookies: 新的cookies
            user_id: 新的用户ID
        """
        if cookies:
            self.cookies = cookies
        if user_id:
            self.user_id = user_id
        logger.debug(f"更新凭证: user_id={user_id}, has_cookies={bool(cookies)}")



