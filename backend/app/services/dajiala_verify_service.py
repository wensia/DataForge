"""极致了API验证服务

验证极致了API密钥是否有效并获取账户信息。
"""

import httpx


async def verify_dajiala_credentials(
    api_key: str,
    verify_code: str | None = None,
    test_biz: str | None = None,
) -> dict:
    """验证极致了API密钥

    通过调用 post_condition 接口验证密钥有效性。

    Args:
        api_key: API 密钥
        verify_code: 附加码(可选)
        test_biz: 测试用公众号 biz(可选，如果不提供会使用默认值)

    Returns:
        dict: {
            "success": bool,
            "message": str,
            "remain_money": float | None,
        }
    """
    try:
        url = "https://www.dajiala.com/fbmain/monitor/v3/post_condition"

        # 构造请求参数
        params = {"key": api_key}

        if verify_code:
            params["verifycode"] = verify_code

        # 使用测试 biz 或默认值
        # 使用一个常见的公众号 biz 进行测试
        if test_biz:
            params["biz"] = test_biz
        else:
            # 默认使用人民日报的 biz 进行测试
            params["biz"] = "MjM5MjAxNjM0MA=="

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, params=params)
            result = response.json()

            # 检查响应
            code = result.get("code")
            remain_money = result.get("remain_money")

            # 优先检查 remain_money - 如果有余额信息，说明 key 是有效的
            # code 101 "get articles failed" 只是表示测试公众号没有文章，不代表 key 无效
            if remain_money is not None:
                return {
                    "success": True,
                    "message": "验证成功",
                    "remain_money": remain_money,
                }

            if code == 0:
                return {
                    "success": True,
                    "message": "验证成功",
                    "remain_money": remain_money,
                }
            elif code == 10002:
                return {
                    "success": False,
                    "message": "key或附加码不正确",
                    "remain_money": None,
                }
            elif code == 20001:
                return {
                    "success": False,
                    "message": "金额不足，请充值",
                    "remain_money": 0,
                }
            else:
                error_msg = result.get("msg") or result.get("message") or "未知错误"
                return {
                    "success": False,
                    "message": f"验证失败: {error_msg} (code: {code})",
                    "remain_money": None,
                }

    except httpx.TimeoutException:
        return {
            "success": False,
            "message": "连接超时，请稍后重试",
            "remain_money": None,
        }
    except httpx.RequestError as e:
        return {
            "success": False,
            "message": f"网络请求失败: {str(e)}",
            "remain_money": None,
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"验证失败: {str(e)}",
            "remain_money": None,
        }
