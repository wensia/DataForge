"""ASR 密钥验证服务

验证各 ASR 提供商的 API 密钥是否有效。
"""

import hashlib
import hmac
import time
import uuid
from datetime import UTC, datetime

import httpx


async def verify_tencent(secret_id: str, secret_key: str, app_id: str) -> dict:
    """验证腾讯云 ASR 密钥

    使用腾讯云签名 V3 调用 DescribeTaskStatus API 验证密钥有效性。

    Args:
        secret_id: 腾讯云 SecretId
        secret_key: 腾讯云 SecretKey
        app_id: 应用 ID

    Returns:
        dict: {"success": bool, "message": str, "detail": ...}
    """
    try:
        # 使用签名 V3 调用一个简单的 API
        service = "asr"
        host = "asr.tencentcloudapi.com"
        endpoint = f"https://{host}"
        action = "DescribeTaskStatus"
        version = "2019-06-14"
        region = "ap-guangzhou"

        # 构造请求参数（查询一个不存在的任务，会返回错误但能验证密钥）
        payload = '{"TaskId": 0}'

        # 签名时间
        timestamp = int(time.time())
        date = datetime.fromtimestamp(timestamp, tz=UTC).strftime("%Y-%m-%d")

        # 拼接规范请求串
        http_request_method = "POST"
        canonical_uri = "/"
        canonical_querystring = ""
        ct = "application/json; charset=utf-8"
        canonical_headers = (
            f"content-type:{ct}\nhost:{host}\nx-tc-action:{action.lower()}\n"
        )
        signed_headers = "content-type;host;x-tc-action"
        hashed_request_payload = hashlib.sha256(payload.encode("utf-8")).hexdigest()
        canonical_request = (
            f"{http_request_method}\n{canonical_uri}\n{canonical_querystring}\n"
            f"{canonical_headers}\n{signed_headers}\n{hashed_request_payload}"
        )

        # 拼接待签名字符串
        algorithm = "TC3-HMAC-SHA256"
        credential_scope = f"{date}/{service}/tc3_request"
        hashed_canonical_request = hashlib.sha256(
            canonical_request.encode("utf-8")
        ).hexdigest()
        string_to_sign = (
            f"{algorithm}\n{timestamp}\n{credential_scope}\n{hashed_canonical_request}"
        )

        # 计算签名
        def sign(key, msg):
            return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()

        secret_date = sign(("TC3" + secret_key).encode("utf-8"), date)
        secret_service = sign(secret_date, service)
        secret_signing = sign(secret_service, "tc3_request")
        signature = hmac.new(
            secret_signing, string_to_sign.encode("utf-8"), hashlib.sha256
        ).hexdigest()

        # 构造 Authorization
        authorization = (
            f"{algorithm} Credential={secret_id}/{credential_scope}, "
            f"SignedHeaders={signed_headers}, Signature={signature}"
        )

        # 发送请求
        headers = {
            "Authorization": authorization,
            "Content-Type": ct,
            "Host": host,
            "X-TC-Action": action,
            "X-TC-Timestamp": str(timestamp),
            "X-TC-Version": version,
            "X-TC-Region": region,
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(endpoint, headers=headers, content=payload)
            result = response.json()

            # 检查响应
            if "Response" in result:
                error = result["Response"].get("Error")
                if error:
                    error_code = error.get("Code", "")
                    # AuthFailure 表示密钥无效，其他错误（如任务不存在）表示密钥有效
                    if "AuthFailure" in error_code or "SecretId" in error_code:
                        err_msg = error.get("Message", error_code)
                        return {
                            "success": False,
                            "message": f"密钥验证失败: {err_msg}",
                            "detail": error,
                        }
                    # 其他错误说明密钥有效（只是请求参数有问题）
                    return {
                        "success": True,
                        "message": "密钥验证成功",
                        "detail": {"app_id": app_id},
                    }
                return {
                    "success": True,
                    "message": "密钥验证成功",
                    "detail": result["Response"],
                }
            return {
                "success": False,
                "message": "响应格式异常",
                "detail": result,
            }

    except httpx.TimeoutException:
        return {"success": False, "message": "连接超时", "detail": None}
    except Exception as e:
        return {"success": False, "message": f"验证失败: {str(e)}", "detail": None}


async def verify_alibaba(
    access_key_id: str, access_key_secret: str, app_key: str
) -> dict:
    """验证阿里云智能语音密钥

    通过获取 Token 来验证密钥有效性。

    Args:
        access_key_id: 阿里云 AccessKey ID
        access_key_secret: 阿里云 AccessKey Secret
        app_key: 语音项目 AppKey

    Returns:
        dict: {"success": bool, "message": str, "detail": ...}
    """
    try:
        # 阿里云语音 Token 获取 URL
        url = "https://nls-meta.cn-shanghai.aliyuncs.com/"

        # 构造签名
        timestamp = datetime.now(tz=UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
        nonce = str(uuid.uuid4())

        # 公共请求参数
        params = {
            "AccessKeyId": access_key_id,
            "Action": "CreateToken",
            "Format": "JSON",
            "RegionId": "cn-shanghai",
            "SignatureMethod": "HMAC-SHA1",
            "SignatureNonce": nonce,
            "SignatureVersion": "1.0",
            "Timestamp": timestamp,
            "Version": "2019-02-28",
        }

        # 构造待签名字符串
        def percent_encode(s):
            import urllib.parse

            return urllib.parse.quote(str(s), safe="~")

        sorted_params = sorted(params.items())
        query_string = "&".join(
            f"{percent_encode(k)}={percent_encode(v)}" for k, v in sorted_params
        )
        string_to_sign = f"GET&{percent_encode('/')}&{percent_encode(query_string)}"

        # 计算签名
        signature = hmac.new(
            (access_key_secret + "&").encode("utf-8"),
            string_to_sign.encode("utf-8"),
            hashlib.sha1,
        ).digest()

        import base64

        signature = base64.b64encode(signature).decode("utf-8")
        params["Signature"] = signature

        # 发送请求
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, params=params)
            result = response.json()

            if "Token" in result:
                return {
                    "success": True,
                    "message": "密钥验证成功",
                    "detail": {"app_key": app_key, "token_id": result["Token"]["Id"]},
                }
            elif "Message" in result:
                return {
                    "success": False,
                    "message": f"密钥验证失败: {result['Message']}",
                    "detail": result,
                }
            else:
                return {
                    "success": False,
                    "message": "响应格式异常",
                    "detail": result,
                }

    except httpx.TimeoutException:
        return {"success": False, "message": "连接超时", "detail": None}
    except Exception as e:
        return {"success": False, "message": f"验证失败: {str(e)}", "detail": None}


async def verify_volcengine(
    app_id: str, access_token: str, cluster: str = "volc.seedasr.auc"
) -> dict:
    """验证火山引擎 ASR 密钥

    通过提交一个空的录音文件识别任务来验证密钥有效性。

    Args:
        app_id: 火山引擎 App ID
        access_token: Access Token
        cluster: 集群，默认 volc.seedasr.auc（录音文件识别）

    Returns:
        dict: {"success": bool, "message": str, "detail": ...}
    """
    try:
        # 火山引擎录音文件识别 HTTP API
        url = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit"

        # 构造请求头
        headers = {
            "X-Api-App-Key": app_id,
            "X-Api-Access-Key": access_token,
            "X-Api-Resource-Id": cluster,
            "Content-Type": "application/json",
        }

        # 发送一个空请求来验证密钥（会返回参数错误，但能验证密钥有效性）
        payload = {"url": ""}

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            result = response.json()

            # 检查响应
            # 如果是认证失败，会返回 401/403 或特定错误码
            if response.status_code == 401 or response.status_code == 403:
                return {
                    "success": False,
                    "message": "密钥验证失败: 认证失败",
                    "detail": result,
                }

            # 检查错误码
            error_code = result.get("code", "")
            error_msg = result.get("message", "")

            # 认证相关错误
            if "auth" in str(error_code).lower() or "auth" in error_msg.lower():
                return {
                    "success": False,
                    "message": f"密钥验证失败: {error_msg}",
                    "detail": result,
                }

            # 如果是参数错误（如 url 为空），说明密钥有效
            # 常见错误码：参数错误、url 无效等
            return {
                "success": True,
                "message": "密钥验证成功",
                "detail": {"app_id": app_id, "cluster": cluster},
            }

    except httpx.TimeoutException:
        return {"success": False, "message": "连接超时", "detail": None}
    except Exception as e:
        error_msg = str(e)
        return {
            "success": False,
            "message": f"验证失败: {error_msg}",
            "detail": None,
        }


async def verify_asr_credentials(provider: str, credentials: dict) -> dict:
    """统一验证入口

    Args:
        provider: 提供商 (tencent/alibaba/volcengine)
        credentials: 密钥信息

    Returns:
        dict: {"success": bool, "message": str, "detail": ...}
    """
    if provider == "tencent":
        return await verify_tencent(
            secret_id=credentials.get("secret_id", ""),
            secret_key=credentials.get("secret_key", ""),
            app_id=credentials.get("app_id", ""),
        )
    elif provider == "alibaba":
        return await verify_alibaba(
            access_key_id=credentials.get("access_key_id", ""),
            access_key_secret=credentials.get("access_key_secret", ""),
            app_key=credentials.get("app_key", ""),
        )
    elif provider == "volcengine":
        return await verify_volcengine(
            app_id=credentials.get("app_id", ""),
            access_token=credentials.get("access_token", ""),
            cluster=credentials.get("cluster", "volc.seedasr.auc"),
        )
    else:
        return {
            "success": False,
            "message": f"不支持的提供商: {provider}",
            "detail": None,
        }
