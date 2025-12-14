"""流式响应的部分验证支持

利用 Pydantic 2.10+ 的实验性部分验证功能，
支持对 LLM 流式输出进行渐进式验证。
"""

from collections.abc import AsyncGenerator

from pydantic import BaseModel, TypeAdapter


class StreamChunk(BaseModel):
    """流式响应片段"""

    content: str = ""
    finished: bool = False
    error: str | None = None


# TypeAdapter 支持部分验证
stream_chunk_adapter = TypeAdapter(StreamChunk)


async def validate_stream_chunks(
    chunks: AsyncGenerator[str, None],
) -> AsyncGenerator[StreamChunk, None]:
    """渐进式验证流式响应

    使用 Pydantic 2.10+ 的实验性部分验证功能，
    在流式数据到达时进行渐进式验证。

    Args:
        chunks: 异步生成器，产出 JSON 字符串片段

    Yields:
        StreamChunk: 验证后的流式响应片段
    """
    accumulated = ""
    async for chunk in chunks:
        accumulated += chunk
        try:
            # Pydantic 2.10+ 部分验证（实验性功能）
            partial = stream_chunk_adapter.validate_json(
                accumulated,
                experimental_allow_partial=True,
            )
            yield partial
        except Exception:
            # 解析失败时返回原始内容
            yield StreamChunk(content=chunk)
