"""微信公众号文章链接解析服务

从微信公众号文章 URL 中提取公众号信息（biz、名称、头像等）
"""

import re
from dataclasses import dataclass
from urllib.parse import parse_qs, urlparse

from loguru import logger

from app.utils.http_client import get_http_client


@dataclass
class WechatAccountInfo:
    """公众号信息"""

    biz: str
    name: str
    avatar_url: str | None = None
    user_name: str | None = None  # gh_xxx 格式


class WechatArticleParseError(Exception):
    """文章解析错误"""

    pass


async def parse_wechat_article_url(url: str) -> WechatAccountInfo:
    """
    从微信公众号文章链接解析公众号信息

    支持的 URL 格式:
    - 长链接: https://mp.weixin.qq.com/s?__biz=xxx&mid=...
    - 短链接: https://mp.weixin.qq.com/s/xxx

    Args:
        url: 微信公众号文章链接

    Returns:
        WechatAccountInfo: 解析出的公众号信息

    Raises:
        WechatArticleParseError: 解析失败时抛出
    """
    # 验证 URL 格式
    if not url or not url.startswith("http"):
        raise WechatArticleParseError("无效的 URL 格式")

    parsed_url = urlparse(url)
    if "mp.weixin.qq.com" not in parsed_url.netloc:
        raise WechatArticleParseError("不是微信公众号文章链接")

    # 尝试从 URL 参数中获取 biz
    biz_from_url = None
    if parsed_url.query:
        query_params = parse_qs(parsed_url.query)
        if "__biz" in query_params:
            biz_from_url = query_params["__biz"][0]

    # 获取页面 HTML
    try:
        client = await get_http_client(timeout=15.0, http2=False)
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        }
        response = await client.get(url, headers=headers, follow_redirects=True)
        response.raise_for_status()
        html = response.text
    except Exception as e:
        logger.error(f"获取文章页面失败: {e}")
        raise WechatArticleParseError(f"获取文章页面失败: {e}") from e

    # 从 HTML 中提取信息
    biz = biz_from_url or _extract_biz_from_html(html)
    name = _extract_name_from_html(html)
    avatar_url = _extract_avatar_from_html(html)
    user_name = _extract_user_name_from_html(html)

    if not biz:
        raise WechatArticleParseError("无法从页面中提取 biz")
    if not name:
        raise WechatArticleParseError("无法从页面中提取公众号名称")

    return WechatAccountInfo(
        biz=biz,
        name=name,
        avatar_url=avatar_url,
        user_name=user_name,
    )


def _extract_biz_from_html(html: str) -> str | None:
    """从 HTML 中提取 biz"""
    patterns = [
        # JavaScript 变量形式
        r'var\s+biz\s*=\s*["\']([^"\']+)["\']',
        r'window\.biz\s*=\s*["\']([^"\']+)["\']',
        r'"biz"\s*:\s*"([^"]+)"',
        # URL 参数形式（页面内链接）
        r'__biz=([A-Za-z0-9=]+)',
    ]

    for pattern in patterns:
        match = re.search(pattern, html)
        if match:
            return match.group(1)

    return None


def _extract_name_from_html(html: str) -> str | None:
    """从 HTML 中提取公众号名称"""
    patterns = [
        # JavaScript 变量
        r'var\s+nickname\s*=\s*["\']([^"\']+)["\']',
        r'var\s+nick_name\s*=\s*["\']([^"\']+)["\']',
        r'window\.nick_name\s*=\s*["\']([^"\']+)["\']',
        r'"nick_name"\s*:\s*"([^"]+)"',
        # HTML 元素
        r'id="js_name"[^>]*>([^<]+)<',
        r'class="profile_nickname"[^>]*>([^<]+)<',
        r'<strong[^>]*class="profile_nickname"[^>]*>([^<]+)</strong>',
    ]

    for pattern in patterns:
        match = re.search(pattern, html, re.IGNORECASE)
        if match:
            name = match.group(1).strip()
            # 清理 HTML 实体
            name = name.replace("&nbsp;", " ").strip()
            if name:
                return name

    return None


def _extract_avatar_from_html(html: str) -> str | None:
    """从 HTML 中提取公众号头像 URL

    优先从文章底部的打赏区域提取头像，这是公众号的真实头像
    """
    patterns = [
        # 打赏区域头像（优先级最高，这是公众号真实头像）
        r'class="reward-avatar"[^>]*>\s*<img[^>]+src="([^"]+)"',
        r'class="reward_avatar"[^>]*>\s*<img[^>]+src="([^"]+)"',
        r'reward-avatar[^>]*>.*?<img[^>]+src="([^"]+)"',
        # JavaScript 变量 - round_head_img（公众号头像）
        r'var\s+round_head_img\s*=\s*["\']([^"\']+)["\']',
        r'"round_head_img"\s*:\s*"([^"]+)"',
        # 公众号头像元素
        r'class="profile_avatar"[^>]*>\s*<img[^>]+src="([^"]+)"',
        r'id="js_profile_avatar_img"[^>]+src="([^"]+)"',
        # ori_head_img_url（原始头像）
        r'var\s+ori_head_img_url\s*=\s*["\']([^"\']+)["\']',
        r'"ori_head_img_url"\s*:\s*"([^"]+)"',
    ]

    for pattern in patterns:
        match = re.search(pattern, html, re.IGNORECASE | re.DOTALL)
        if match:
            url = match.group(1)
            # 确保是有效的图片 URL
            if url.startswith("http") and ("mmbiz" in url or "wx" in url):
                return url

    return None


def _extract_user_name_from_html(html: str) -> str | None:
    """从 HTML 中提取公众号原始 ID (gh_xxx 格式)"""
    patterns = [
        r'var\s+user_name\s*=\s*["\']([^"\']+)["\']',
        r'window\.user_name\s*=\s*["\']([^"\']+)["\']',
        r'"user_name"\s*:\s*"([^"]+)"',
        r'gh_[a-zA-Z0-9]+',
    ]

    for pattern in patterns:
        match = re.search(pattern, html)
        if match:
            result = match.group(1) if match.lastindex else match.group(0)
            if result.startswith("gh_"):
                return result

    return None
