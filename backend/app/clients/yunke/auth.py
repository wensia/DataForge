"""云客登录认证API"""

from typing import Any

import httpx
from loguru import logger

from app.clients.yunke.base import (
    create_client,
    get_browser_headers,
    get_common_headers,
)


async def get_secure_key(
    phone: str,
    cookies: dict[str, str] | None = None,
    base_url: str | None = None,
) -> dict[str, Any]:
    """获取RSA公钥（modulus/public_exponent）

    Args:
        phone: 手机号
        cookies: 可选的cookies
        base_url: 自定义API基础URL（不同公司使用不同域名）

    Returns:
        dict: 包含modulus、public_exponent和cookies的字典

    Raises:
        httpx.HTTPStatusError: 请求失败时抛出
    """
    headers = get_common_headers(base_url)
    headers.update(get_browser_headers())

    async with create_client(cookies, base_url) as client:
        try:
            response = await client.post(
                "/usercenter/login/getSecureKey",
                json={"phone": phone},
                headers=headers,
            )
            response.raise_for_status()
            data = response.json()

            # 云客把RSA参数放在 data.data 下
            rsa_data = data.get("data", {}).get("data", data.get("data"))

            logger.info(f"获取RSA公钥成功: phone={phone}")

            return {
                "modulus": rsa_data["modulus"],
                "public_exponent": rsa_data["public_exponent"],
                "cookies": dict(response.cookies),
            }
        except httpx.HTTPStatusError as e:
            logger.error(f"获取RSA公钥失败: {e.response.status_code}")
            raise
        except Exception as e:
            logger.error(f"获取RSA公钥异常: {e}")
            raise


def encrypt_with_rsa(text: str, modulus: str, public_exponent: str) -> str:
    """RSA加密（JS同款"无填充"方式）

    使用 m^e mod n 计算，返回十六进制字符串

    Args:
        text: 待加密的文本
        modulus: RSA模数（十六进制）
        public_exponent: RSA公钥指数（十六进制）

    Returns:
        str: 加密后的十六进制字符串
    """
    n = int(modulus, 16)
    e = int(public_exponent, 16)
    m = int.from_bytes(text.encode("utf-8"), "big")
    c = pow(m, e, n)
    encrypted = format(c, "x")

    # 确保长度为偶数（不足补0）
    return encrypted if len(encrypted) % 2 == 0 else "0" + encrypted


async def check_and_get_users(
    account: str,
    password: str,
    cookies: dict[str, str] | None = None,
    base_url: str | None = None,
) -> dict[str, Any]:
    """检查账号并获取用户所属公司列表

    用于登录前获取用户可选择的公司代码。
    返回的公司列表中包含每个公司的 domain，用于后续登录时使用正确的 API 地址。

    Args:
        account: 手机号
        password: 密码（明文）
        cookies: 可选的cookies
        base_url: 自定义API基础URL（可从任意云客域名调用此API）

    Returns:
        dict: 包含用户公司列表和cookies的字典
        - json.data[].domain: 公司对应的API域名，登录时应使用此域名

    Raises:
        httpx.HTTPStatusError: 请求失败时抛出
    """
    headers = get_common_headers(base_url)
    headers.update(get_browser_headers())

    # 初始化cookies
    init_cookies = cookies or {}
    init_cookies.update(
        {
            "pc_register": "1",
            "i18next": "zh-CN",
        }
    )

    # 使用同一个 client 保持 session（此API可从任意云客域名调用）
    async with create_client(init_cookies, base_url) as client:
        # 0. 先访问登录页面初始化session
        try:
            init_response = await client.get(
                "/cms/auth/login",
                headers={"user-agent": headers["user-agent"]},
            )
            logger.debug(f"初始化登录页面: status={init_response.status_code}")
            logger.debug(f"初始化后cookies: {dict(client.cookies)}")
        except Exception as e:
            logger.warning(f"初始化登录页面失败（继续执行）: {e}")

        # 1. 获取RSA公钥（newuc 使用 GET 请求！）
        key_response = await client.get(
            "/newuc/login/getSecureKey",
            params={"account": account},
            headers=headers,
        )
        key_response.raise_for_status()
        key_data = key_response.json()

        # 解析RSA参数
        rsa_data = key_data.get("data", {})
        modulus = rsa_data["modulus"]
        public_exponent = rsa_data["public_exponent"]

        logger.info(f"获取newuc RSA公钥成功: account={account}")
        logger.debug(f"当前cookies: {dict(client.cookies)}")

        # 2. 加密密码
        encrypted_password = encrypt_with_rsa(password, modulus, public_exponent)

        # 3. 构建请求
        payload = {
            "method": "PASSWD",
            "scope": "company",
            "account": account,
            "smsCode": "",
            "passwd": encrypted_password,
        }

        logger.debug(f"checkAndGetUsers请求: account={account}")

        # 4. 调用checkAndGetUsers
        try:
            response = await client.post(
                "/newuc/login/checkAndGetUsers",
                json=payload,
                headers=headers,
            )
            response.raise_for_status()

            result = response.json()
            logger.info(
                f"获取用户公司列表完成: account={account}, code={result.get('code')}"
            )
            logger.debug(f"checkAndGetUsers完整响应: {result}")

            return {
                "json": result,
                "cookies": dict(response.cookies),
            }
        except httpx.HTTPStatusError as e:
            logger.error(f"获取用户公司列表失败: {e.response.status_code}")
            raise
        except Exception as e:
            logger.error(f"获取用户公司列表异常: {e}")
            raise


async def password_login(
    phone: str,
    password: str,
    company_code: str = "2fy7qa",
    login_type: str = "yunkecn",
    domain: str | None = None,
) -> dict[str, Any]:
    """密码登录

    完整登录流程：获取密钥 -> RSA加密密码 -> 登录

    Args:
        phone: 手机号
        password: 密码（明文）
        company_code: 公司代码，默认 "2fy7qa"
        login_type: 登录类型，默认 "yunkecn"
        domain: 公司域名（不同公司使用不同API域名）

    Returns:
        dict: 包含登录响应JSON和cookies的字典

    Raises:
        httpx.HTTPStatusError: 请求失败时抛出
    """
    logger.info(
        f"开始登录: phone={phone}, company_code={company_code}, domain={domain}"
    )

    # 1. 获取RSA公钥（使用对应公司的域名）
    key_data = await get_secure_key(phone, base_url=domain)

    # 2. 加密密码
    encrypted_password = encrypt_with_rsa(
        password,
        key_data["modulus"],
        key_data["public_exponent"],
    )

    # 3. 构建登录请求
    payload = {
        "phone": phone,
        "password": encrypted_password,
        "loginType": login_type,
        "companyCode": company_code,
        "smsCode": "",
        "validCode": "",
        "codeUuid": "",
    }

    headers = get_common_headers(domain)

    # 使用对应公司的域名发起登录请求
    async with create_client(key_data["cookies"], domain) as client:
        try:
            response = await client.post(
                "/usercenter/login/pcLogin",
                json=payload,
                headers=headers,
            )
            response.raise_for_status()

            result = response.json()
            logger.info(
                f"登录请求完成: phone={phone}, company_code={company_code}, domain={domain}, code={result.get('code')}"
            )

            return {
                "json": result,
                "cookies": dict(response.cookies),
            }
        except httpx.HTTPStatusError as e:
            logger.error(f"登录失败: {e.response.status_code}, domain={domain}")
            raise
        except Exception as e:
            logger.error(f"登录异常: {e}, domain={domain}")
            raise
