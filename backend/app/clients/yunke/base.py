"""云客API基础配置"""

import httpx

# 云客API基础URL
BASE_URL = "https://crm.yunkecn.com"

# 默认超时配置
DEFAULT_TIMEOUT = httpx.Timeout(
    connect=10.0,
    read=30.0,
    write=10.0,
    pool=5.0,
)


def get_common_headers(base_url: str | None = None) -> dict[str, str]:
    """获取通用请求头（与浏览器请求完全一致）

    Args:
        base_url: 自定义域名，用于设置 origin 和 referer

    Returns:
        dict: 通用请求头字典
    """
    domain = base_url or BASE_URL
    return {
        "accept": "application/json, text/plain, */*",
        "accept-language": "zh-CN",
        "channel": "4",
        "content-type": "application/json",
        "dnt": "1",
        "origin": domain,
        "priority": "u=1, i",
        "referer": f"{domain}/cms/auth/login",
        "source": "yunkepc",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0",
    }


def get_browser_headers() -> dict[str, str]:
    """获取浏览器相关请求头

    Returns:
        dict: 浏览器请求头字典
    """
    return {
        "sec-ch-ua": '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty",
    }


def create_client(
    cookies: dict[str, str] | None = None,
    base_url: str | None = None,
) -> httpx.AsyncClient:
    """创建云客API异步客户端

    Args:
        cookies: 可选的cookies字典
        base_url: 自定义API基础URL，默认使用 BASE_URL

    Returns:
        httpx.AsyncClient: 异步HTTP客户端
    """
    return httpx.AsyncClient(
        base_url=base_url or BASE_URL,
        timeout=DEFAULT_TIMEOUT,
        verify=False,  # 云客API可能存在证书问题
        cookies=cookies or {},
    )
