"""极致了公众号文章采集服务

调用极致了 API 获取公众号历史发文列表。
"""

from datetime import datetime

import httpx


async def fetch_wechat_articles(
    api_key: str,
    biz: str | None = None,
    url: str | None = None,
    name: str | None = None,
    verify_code: str | None = None,
    page: int = 1,
) -> dict:
    """获取公众号历史发文列表

    通过调用极致了 post_history 接口获取公众号历史文章。

    Args:
        api_key: API 密钥
        biz: 公众号 biz (与 url/name 三选一)
        url: 公众号文章链接 (与 biz/name 三选一)
        name: 公众号名称 (与 biz/url 三选一)
        verify_code: 附加码(可选)
        page: 页码，默认 1

    Returns:
        dict: {
            "success": bool,
            "message": str,
            "article_list": list,
            "has_next": bool,
            "remain_money": float | None,
            "account_name": str | None,
            "account_biz": str | None,
        }
    """
    try:
        api_url = "https://www.dajiala.com/fbmain/monitor/v3/post_history"

        # 构造请求参数
        params = {"key": api_key, "p": page}

        if verify_code:
            params["verifycode"] = verify_code

        # biz/url/name 三选一
        if biz:
            params["biz"] = biz
        elif url:
            params["url"] = url
        elif name:
            params["name"] = name
        else:
            return {
                "success": False,
                "message": "必须提供 biz、url 或 name 中的一个",
                "article_list": [],
                "has_next": False,
                "remain_money": None,
                "account_name": None,
                "account_biz": None,
            }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(api_url, params=params)
            result = response.json()

            # 检查响应
            code = result.get("code")
            remain_money = result.get("remain_money")
            article_list = result.get("article_list", [])
            has_next = result.get("has_next", False)
            account_name = result.get("account_name") or result.get("name")
            account_biz = result.get("biz")

            if code == 0:
                # 转换文章数据
                articles = []
                for article in article_list:
                    post_time_str = article.get("post_time", "")
                    try:
                        post_time = datetime.strptime(post_time_str, "%Y-%m-%d %H:%M:%S")
                    except (ValueError, TypeError):
                        post_time = datetime.now()

                    articles.append(
                        {
                            "title": article.get("title", ""),
                            "url": article.get("url", ""),
                            "cover_url": article.get("cover_url"),
                            "post_time": post_time,
                            "position": article.get("position"),
                            "is_original": bool(article.get("original")),
                            "item_show_type": article.get("item_show_type"),
                            "raw_data": article,
                        }
                    )

                return {
                    "success": True,
                    "message": "获取成功",
                    "article_list": articles,
                    "has_next": has_next,
                    "remain_money": remain_money,
                    "account_name": account_name,
                    "account_biz": account_biz,
                }
            elif code == 10002:
                return {
                    "success": False,
                    "message": "key或附加码不正确",
                    "article_list": [],
                    "has_next": False,
                    "remain_money": None,
                    "account_name": None,
                    "account_biz": None,
                }
            elif code == 20001:
                return {
                    "success": False,
                    "message": "金额不足，请充值",
                    "article_list": [],
                    "has_next": False,
                    "remain_money": 0,
                    "account_name": None,
                    "account_biz": None,
                }
            else:
                error_msg = result.get("msg") or result.get("message") or "未知错误"
                return {
                    "success": False,
                    "message": f"获取失败: {error_msg} (code: {code})",
                    "article_list": [],
                    "has_next": False,
                    "remain_money": remain_money,
                    "account_name": None,
                    "account_biz": None,
                }

    except httpx.TimeoutException:
        return {
            "success": False,
            "message": "连接超时，请稍后重试",
            "article_list": [],
            "has_next": False,
            "remain_money": None,
            "account_name": None,
            "account_biz": None,
        }
    except httpx.RequestError as e:
        return {
            "success": False,
            "message": f"网络请求失败: {str(e)}",
            "article_list": [],
            "has_next": False,
            "remain_money": None,
            "account_name": None,
            "account_biz": None,
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"获取失败: {str(e)}",
            "article_list": [],
            "has_next": False,
            "remain_money": None,
            "account_name": None,
            "account_biz": None,
        }
