"""录音文件代理接口"""

from hashlib import md5

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from loguru import logger
from pydantic import BaseModel

from app.utils.cache import record_cache

router = APIRouter(prefix="/record-proxy", tags=["录音代理"])


class ProxyRequest(BaseModel):
    """代理请求参数"""

    url: str


@router.post("/stream")
async def proxy_record(request: ProxyRequest):
    """代理获取录音文件（带 3 分钟缓存）

    通过后端代理下载录音文件，解决阿里云 OSS 跨域限制问题

    Args:
        request: 包含录音 URL 的请求体

    Returns:
        StreamingResponse: 音频流
    """
    cache_key = md5(request.url.encode()).hexdigest()

    # 尝试从缓存获取
    cached = record_cache.get(cache_key)
    if cached:
        logger.info(f"录音缓存命中: {cache_key[:8]}...")
        return StreamingResponse(
            iter([cached]),
            media_type="audio/mpeg",
        )

    # 下载文件
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(request.url)
            response.raise_for_status()
            content = response.content
    except httpx.TimeoutException:
        logger.error(f"下载录音超时: {request.url}")
        raise HTTPException(status_code=504, detail="下载录音超时")
    except httpx.HTTPStatusError as e:
        logger.error(f"下载录音失败: {e.response.status_code} - {request.url}")
        raise HTTPException(
            status_code=502, detail=f"下载录音失败: {e.response.status_code}"
        )
    except Exception as e:
        logger.error(f"下载录音失败: {e}")
        raise HTTPException(status_code=502, detail="下载录音失败")

    # 存入缓存
    record_cache.set(cache_key, content)
    logger.info(f"录音已缓存: {cache_key[:8]}... ({len(content)} bytes)")

    return StreamingResponse(
        iter([content]),
        media_type="audio/mpeg",
    )
