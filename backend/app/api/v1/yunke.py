"""云客API路由"""

import json

import httpx
from fastapi import APIRouter
from loguru import logger

from app.clients.yunke import (
    ReportClient,
    YunkeApiException,
    YunkePasswordException,
    check_and_get_users,
    get_secure_key,
    password_login,
)
from app.schemas.response import ResponseModel
from app.schemas.yunke import (
    YunkeCallReportData,
    YunkeCallReportRequest,
    YunkeCheckUsersData,
    YunkeCheckUsersRequest,
    YunkeLoginData,
    YunkeLoginRequest,
    YunkeSecureKeyData,
    YunkeSecureKeyRequest,
)
from app.services.account_service import auto_login, get_account_by_id

router = APIRouter(prefix="/yunke", tags=["云客API"])


@router.post("/login", response_model=ResponseModel[YunkeLoginData])
async def yunke_login(request: YunkeLoginRequest):
    """云客登录接口

    使用手机号和密码登录云客CRM系统

    Args:
        request: 登录请求参数

    Returns:
        ResponseModel: 包含登录结果和cookies的响应
    """
    try:
        result = await password_login(
            phone=request.phone,
            password=request.password,
            company_code=request.company_code,
            login_type=request.login_type,
        )

        # 检查云客返回的业务状态码（云客成功码是 "10000" 或 10000）
        yunke_code = result["json"].get("code")
        yunke_success = result["json"].get("success", False)
        
        if not yunke_success and str(yunke_code) != "10000":
            message = result["json"].get("message", "登录失败")
            logger.warning(f"云客登录业务失败: {message}")
            return ResponseModel.error(code=int(yunke_code) if yunke_code else 400, message=message)

        return ResponseModel.success(
            data=YunkeLoginData(
                json=result["json"],
                cookies=result["cookies"],
            ),
            message="登录成功",
        )
    except httpx.HTTPStatusError as e:
        logger.error(f"云客登录HTTP错误: {e.response.status_code}")
        return ResponseModel.error(
            code=e.response.status_code,
            message=f"云客服务请求失败: {e.response.status_code}",
        )
    except Exception as e:
        logger.error(f"云客登录异常: {e}")
        return ResponseModel.error(code=500, message=f"登录异常: {str(e)}")


@router.post("/secure-key", response_model=ResponseModel[YunkeSecureKeyData])
async def yunke_get_secure_key(request: YunkeSecureKeyRequest):
    """获取云客RSA公钥

    用于密码加密的RSA公钥获取

    Args:
        request: 请求参数（手机号）

    Returns:
        ResponseModel: 包含RSA公钥信息的响应
    """
    try:
        result = await get_secure_key(phone=request.phone)

        return ResponseModel.success(
            data=YunkeSecureKeyData(
                modulus=result["modulus"],
                public_exponent=result["public_exponent"],
                cookies=result["cookies"],
            ),
            message="获取公钥成功",
        )
    except httpx.HTTPStatusError as e:
        logger.error(f"获取公钥HTTP错误: {e.response.status_code}")
        return ResponseModel.error(
            code=e.response.status_code,
            message=f"云客服务请求失败: {e.response.status_code}",
        )
    except Exception as e:
        logger.error(f"获取公钥异常: {e}")
        return ResponseModel.error(code=500, message=f"获取公钥异常: {str(e)}")


@router.post("/check-users", response_model=ResponseModel[YunkeCheckUsersData])
async def yunke_check_and_get_users(request: YunkeCheckUsersRequest):
    """获取用户所属公司列表

    检查账号并获取用户可选择的公司代码，用于登录前选择公司

    Args:
        request: 请求参数（手机号、密码）

    Returns:
        ResponseModel: 包含用户公司列表的响应
    """
    try:
        result = await check_and_get_users(
            account=request.account,
            password=request.password,
        )

        # 检查云客返回的业务状态码（newuc 成功码是 10000）
        yunke_code = result["json"].get("code")
        if str(yunke_code) != "10000" and yunke_code != 10000:
            # 云客的错误消息可能在 message 或 msg 字段
            message = result["json"].get("message") or result["json"].get("msg", "获取公司列表失败")
            logger.warning(f"获取公司列表业务失败: code={yunke_code}, message={message}")
            return ResponseModel.error(code=int(yunke_code) if yunke_code else 400, message=message)

        return ResponseModel.success(
            data=YunkeCheckUsersData(
                json=result["json"],
                cookies=result["cookies"],
            ),
            message="获取公司列表成功",
        )
    except httpx.HTTPStatusError as e:
        logger.error(f"获取公司列表HTTP错误: {e.response.status_code}")
        return ResponseModel.error(
            code=e.response.status_code,
            message=f"云客服务请求失败: {e.response.status_code}",
        )
    except Exception as e:
        logger.error(f"获取公司列表异常: {e}")
        return ResponseModel.error(code=500, message=f"获取公司列表异常: {str(e)}")


@router.post("/report/call", response_model=ResponseModel[YunkeCallReportData])
async def yunke_call_report(request: YunkeCallReportRequest):
    """获取通话报表

    获取指定时间范围内的通话统计数据，支持外呼/呼入/全部类型

    Args:
        request: 报表请求参数

    Returns:
        ResponseModel: 包含通话报表数据的响应
    """
    # 获取账号信息
    account_data = get_account_by_id(request.account_id)
    if not account_data:
        return ResponseModel.error(code=404, message="账号不存在")

    account, company = account_data

    # 检查账号是否已登录
    if not account.cookies or not account.user_id:
        # 尝试自动登录
        login_result = await auto_login(request.account_id)
        if not login_result["success"]:
            return ResponseModel.error(
                code=401,
                message=f"账号未登录且自动登录失败: {login_result.get('message', '未知错误')}",
            )
        # 重新获取账号信息
        account_data = get_account_by_id(request.account_id)
        if not account_data:
            return ResponseModel.error(code=500, message="获取账号信息失败")
        account, company = account_data

    # 解析cookies
    try:
        cookies = json.loads(account.cookies) if account.cookies else {}
    except json.JSONDecodeError:
        return ResponseModel.error(code=500, message="账号cookies解析失败")

    # 创建自动登录回调
    async def auto_login_callback():
        return await auto_login(request.account_id)

    # 创建报表客户端
    client = ReportClient(
        phone=account.phone,
        company_code=company.company_code,
        user_id=account.user_id or "",
        cookies=cookies,
        domain=company.domain if company.domain else None,
        auto_login_callback=auto_login_callback,
    )

    try:
        result = await client.get_call_index_detail(
            start_date=request.start_date,
            end_date=request.end_date,
            depart_id=request.depart_id,
            child_module=request.child_module,
            search_user_id=request.search_user_id,
            option=request.option,
            page=request.page,
            page_size=request.page_size,
        )

        return ResponseModel.success(
            data=YunkeCallReportData(json=result),
            message="获取通话报表成功",
        )

    except YunkePasswordException as e:
        logger.error(f"通话报表请求密码错误: {e.message}")
        return ResponseModel.error(code=401, message=f"密码错误: {e.message}")

    except YunkeApiException as e:
        logger.error(f"通话报表请求失败: {e.message}")
        return ResponseModel.error(code=400, message=f"获取报表失败: {e.message}")

    except httpx.HTTPStatusError as e:
        logger.error(f"通话报表HTTP错误: {e.response.status_code}")
        return ResponseModel.error(
            code=e.response.status_code,
            message=f"云客服务请求失败: {e.response.status_code}",
        )

    except Exception as e:
        logger.error(f"通话报表异常: {e}")
        return ResponseModel.error(code=500, message=f"获取报表异常: {str(e)}")

