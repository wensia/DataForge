"""头像下载服务

下载微信公众号头像到本地，解决防盗链问题。
"""

import hashlib
from pathlib import Path

from loguru import logger

from app.config import settings
from app.utils.http_client import http_client


# 头像保存目录（相对于 backend）
AVATAR_DIR = Path(settings.uploads_dir) / "avatars"


def get_avatar_path(biz: str, ext: str = ".jpg") -> Path:
    """获取头像保存路径

    使用 biz 的 MD5 哈希作为文件名，避免文件名问题。
    """
    filename = hashlib.md5(biz.encode()).hexdigest() + ext
    return AVATAR_DIR / filename


def get_avatar_url(biz: str, ext: str = ".jpg") -> str:
    """获取头像的 URL 路径（用于前端访问）"""
    filename = hashlib.md5(biz.encode()).hexdigest() + ext
    return f"/uploads/avatars/{filename}"


async def download_avatar(avatar_url: str, biz: str) -> str | None:
    """下载头像到本地

    Args:
        avatar_url: 头像原始 URL
        biz: 公众号 biz（用于生成文件名）

    Returns:
        本地 URL 路径，如 /uploads/avatars/xxx.jpg
        下载失败返回 None
    """
    if not avatar_url:
        return None

    try:
        # 确保目录存在
        AVATAR_DIR.mkdir(parents=True, exist_ok=True)

        # 确定文件扩展名
        ext = ".jpg"
        if ".png" in avatar_url.lower():
            ext = ".png"
        elif ".gif" in avatar_url.lower():
            ext = ".gif"
        elif ".webp" in avatar_url.lower():
            ext = ".webp"

        save_path = get_avatar_path(biz, ext)

        # 如果已存在，直接返回
        if save_path.exists():
            logger.debug(f"头像已存在: {save_path}")
            return get_avatar_url(biz, ext)

        # 下载头像（禁用 HTTP/2 避免依赖 h2 包）
        async with http_client(timeout=30.0, http2=False) as client:
            # 添加 Referer 头绕过部分防盗链
            headers = {
                "Referer": "https://mp.weixin.qq.com/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            }
            response = await client.get(avatar_url, headers=headers, follow_redirects=True)
            response.raise_for_status()

            # 保存文件
            save_path.write_bytes(response.content)
            logger.info(f"头像下载成功: {biz} -> {save_path}")

            return get_avatar_url(biz, ext)

    except Exception as e:
        logger.warning(f"头像下载失败: {avatar_url}, 错误: {e}")
        return None


async def download_avatar_if_needed(
    avatar_url: str | None,
    biz: str,
    existing_local: str | None = None
) -> str | None:
    """按需下载头像

    如果已有本地头像且文件存在，直接返回；否则尝试下载。

    Args:
        avatar_url: 头像原始 URL
        biz: 公众号 biz
        existing_local: 现有的本地头像路径

    Returns:
        本地 URL 路径或 None
    """
    # 检查现有本地头像是否有效
    if existing_local:
        # 从 URL 提取文件路径
        local_file = Path(settings.uploads_dir) / existing_local.lstrip("/uploads/")
        if local_file.exists():
            return existing_local

    # 尝试下载
    if avatar_url:
        return await download_avatar(avatar_url, biz)

    return None
