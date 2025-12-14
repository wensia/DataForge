"""HTTP 客户端连接池管理

提供全局 HTTP 客户端池，复用 TCP 连接以提升性能。
支持 HTTP/2 和连接数限制。
"""

import httpx

_http_clients: dict[str, httpx.AsyncClient] = {}


async def get_http_client(
    base_url: str | None = None,
    timeout: float = 30.0,
    http2: bool = True,
    verify: bool = True,
) -> httpx.AsyncClient:
    """获取或创建 HTTP 客户端（连接池复用）

    Args:
        base_url: 基础 URL，用于区分不同服务的客户端
        timeout: 请求超时时间（秒）
        http2: 是否启用 HTTP/2
        verify: 是否验证 SSL 证书

    Returns:
        httpx.AsyncClient: 可复用的 HTTP 客户端
    """
    key = f"{base_url}:{timeout}:{http2}:{verify}"

    if key not in _http_clients:
        client_kwargs = {
            "timeout": httpx.Timeout(timeout),
            "http2": http2,
            "verify": verify,
            "limits": httpx.Limits(
                max_connections=100,
                max_keepalive_connections=20,
            ),
        }
        if base_url:
            client_kwargs["base_url"] = base_url
        _http_clients[key] = httpx.AsyncClient(**client_kwargs)

    return _http_clients[key]


async def close_all_clients() -> None:
    """关闭所有 HTTP 客户端

    应在应用关闭时调用，确保所有连接正确释放。
    """
    for client in _http_clients.values():
        await client.aclose()
    _http_clients.clear()
