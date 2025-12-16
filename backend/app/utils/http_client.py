"""HTTP 客户端管理

提供 HTTP 客户端工厂，支持 HTTP/2 和连接数限制。

注意：不再使用全局共享的客户端池，因为在 Celery + asyncio 环境中，
跨 asyncio 任务共享 httpx.AsyncClient 会导致 anyio cancel scope 错误：
"Attempted to exit cancel scope in a different task than it was entered in"

参考: https://github.com/agronholm/anyio/issues/798
"""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import httpx


def create_http_client(
    base_url: str | None = None,
    timeout: float = 30.0,
    http2: bool = True,
    verify: bool = True,
) -> httpx.AsyncClient:
    """创建新的 HTTP 客户端

    每次调用都会创建新的客户端实例，调用方负责在使用后关闭客户端。

    Args:
        base_url: 基础 URL
        timeout: 请求超时时间（秒）
        http2: 是否启用 HTTP/2
        verify: 是否验证 SSL 证书

    Returns:
        httpx.AsyncClient: 新的 HTTP 客户端实例
    """
    client_kwargs: dict = {
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
    return httpx.AsyncClient(**client_kwargs)


@asynccontextmanager
async def http_client(
    base_url: str | None = None,
    timeout: float = 30.0,
    http2: bool = True,
    verify: bool = True,
) -> AsyncGenerator[httpx.AsyncClient, None]:
    """HTTP 客户端上下文管理器

    自动管理客户端的生命周期，使用后自动关闭。

    Usage:
        async with http_client() as client:
            response = await client.get("https://example.com")

    Args:
        base_url: 基础 URL
        timeout: 请求超时时间（秒）
        http2: 是否启用 HTTP/2
        verify: 是否验证 SSL 证书

    Yields:
        httpx.AsyncClient: HTTP 客户端实例
    """
    client = create_http_client(base_url, timeout, http2, verify)
    try:
        yield client
    finally:
        await client.aclose()


async def get_http_client(
    base_url: str | None = None,
    timeout: float = 30.0,
    http2: bool = True,
    verify: bool = True,
) -> httpx.AsyncClient:
    """获取 HTTP 客户端（兼容旧接口）

    警告：此函数返回的客户端需要调用方负责关闭。
    建议使用 http_client() 上下文管理器代替。

    Args:
        base_url: 基础 URL
        timeout: 请求超时时间（秒）
        http2: 是否启用 HTTP/2
        verify: 是否验证 SSL 证书

    Returns:
        httpx.AsyncClient: HTTP 客户端实例（需手动关闭）
    """
    return create_http_client(base_url, timeout, http2, verify)


async def close_all_clients() -> None:
    """关闭所有 HTTP 客户端（保留兼容性，现为空操作）

    由于不再使用全局客户端池，此函数现在是空操作。
    保留此函数以兼容可能的调用方。
    """
    pass
