"""云客API路由"""

import json

import httpx
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from loguru import logger

from app.clients.yunke import (
    CallLogClient,
    DeptClient,
    RecordClient,
    ReportClient,
    YunkeApiException,
    YunkePasswordException,
    check_and_get_users,
    get_secure_key,
    password_login,
)
from app.schemas.response import ResponseModel
from app.schemas.yunke import (
    YunkeCallLogData,
    YunkeCallLogRequest,
    YunkeCallReportData,
    YunkeCallReportRequest,
    YunkeCheckUsersData,
    YunkeCheckUsersRequest,
    YunkeDeptTreeData,
    YunkeDeptTreeRequest,
    YunkeLoginData,
    YunkeLoginRequest,
    YunkeRecordUrlData,
    YunkeRecordUrlRequest,
    YunkeSecureKeyData,
    YunkeSecureKeyRequest,
    YunkeSyncDeptRequest,
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
            return ResponseModel.error(
                code=int(yunke_code) if yunke_code else 400, message=message
            )

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
            message = result["json"].get("message") or result["json"].get(
                "msg", "获取公司列表失败"
            )
            logger.warning(
                f"获取公司列表业务失败: code={yunke_code}, message={message}"
            )
            return ResponseModel.error(
                code=int(yunke_code) if yunke_code else 400, message=message
            )

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


@router.post("/record/url", response_model=ResponseModel[YunkeRecordUrlData])
async def yunke_get_record_url(request: YunkeRecordUrlRequest):
    """获取录音下载地址

    通过voiceId获取MP3录音文件的下载URL

    Args:
        request: 请求参数（账号ID和voiceId）

    Returns:
        ResponseModel: 包含下载地址的响应
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

    # 创建录音客户端
    client = RecordClient(
        phone=account.phone,
        company_code=company.company_code,
        user_id=account.user_id or "",
        cookies=cookies,
        domain=company.domain if company.domain else None,
        auto_login_callback=auto_login_callback,
    )

    try:
        download_url = await client.get_record_url(request.voice_id)

        return ResponseModel.success(
            data=YunkeRecordUrlData(download_url=download_url),
            message="获取录音下载地址成功",
        )

    except YunkePasswordException as e:
        logger.error(f"获取录音地址密码错误: {e.message}")
        return ResponseModel.error(code=401, message=f"密码错误: {e.message}")

    except YunkeApiException as e:
        logger.error(f"获取录音地址失败: {e.message}")
        return ResponseModel.error(code=400, message=f"获取录音地址失败: {e.message}")

    except httpx.HTTPStatusError as e:
        logger.error(f"获取录音地址HTTP错误: {e.response.status_code}")
        return ResponseModel.error(
            code=e.response.status_code,
            message=f"云客服务请求失败: {e.response.status_code}",
        )

    except Exception as e:
        logger.error(f"获取录音地址异常: {e}")
        return ResponseModel.error(code=500, message=f"获取录音地址异常: {str(e)}")


@router.post("/record/download")
async def yunke_download_record(request: YunkeRecordUrlRequest):
    """代理下载录音文件

    通过后端代理下载 MP3 文件，绕过 OSS 防盗链限制

    Args:
        request: 请求参数（账号ID和voiceId）

    Returns:
        StreamingResponse: MP3 文件流
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

    # 创建录音客户端
    client = RecordClient(
        phone=account.phone,
        company_code=company.company_code,
        user_id=account.user_id or "",
        cookies=cookies,
        domain=company.domain if company.domain else None,
        auto_login_callback=auto_login_callback,
    )

    try:
        # 获取下载地址
        download_url = await client.get_record_url(request.voice_id)

        # 代理下载文件，设置正确的 referer
        domain = company.domain or "https://crm.yunkecn.com"
        async with httpx.AsyncClient(timeout=60.0, verify=False) as http_client:
            response = await http_client.get(
                download_url,
                headers={
                    "Referer": f"{domain}/cms/customer/callDetail",
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                },
            )
            response.raise_for_status()

            # 返回文件流
            return StreamingResponse(
                iter([response.content]),
                media_type="audio/mpeg",
                headers={
                    "Content-Disposition": f'attachment; filename="{request.voice_id}.mp3"',
                    "Content-Length": str(len(response.content)),
                },
            )

    except YunkePasswordException as e:
        logger.error(f"获取录音地址密码错误: {e.message}")
        return ResponseModel.error(code=401, message=f"密码错误: {e.message}")

    except YunkeApiException as e:
        logger.error(f"获取录音地址失败: {e.message}")
        return ResponseModel.error(code=400, message=f"获取录音地址失败: {e.message}")

    except httpx.HTTPStatusError as e:
        logger.error(f"下载录音HTTP错误: {e.response.status_code}")
        return ResponseModel.error(
            code=e.response.status_code,
            message=f"下载录音失败: {e.response.status_code}",
        )

    except Exception as e:
        logger.error(f"下载录音异常: {e}")
        return ResponseModel.error(code=500, message=f"下载录音异常: {str(e)}")


@router.post("/call-logs", response_model=ResponseModel[YunkeCallLogData])
async def yunke_call_logs(request: YunkeCallLogRequest):
    """获取通话记录列表

    根据日期范围获取通话记录，支持筛选外呼/呼入类型

    Args:
        request: 通话记录请求参数

    Returns:
        ResponseModel: 包含通话记录列表的响应
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

    # 创建通话记录客户端
    client = CallLogClient(
        phone=account.phone,
        company_code=company.company_code,
        user_id=account.user_id or "",
        cookies=cookies,
        domain=company.domain if company.domain else None,
        auto_login_callback=auto_login_callback,
    )

    try:
        result = await client.get_call_logs(
            start_time=request.start_time,
            end_time=request.end_time,
            page=request.page,
            page_size=request.page_size,
            department_id=request.department_id,
            user_id=request.user_id,
            call_type=request.call_type,
            search_info=request.search_info,
            search_phone=request.search_phone,
        )

        return ResponseModel.success(
            data=YunkeCallLogData(json=result),
            message="获取通话记录成功",
        )

    except YunkePasswordException as e:
        logger.error(f"获取通话记录密码错误: {e.message}")
        return ResponseModel.error(code=401, message=f"密码错误: {e.message}")

    except YunkeApiException as e:
        logger.error(f"获取通话记录失败: {e.message}")
        return ResponseModel.error(code=400, message=f"获取通话记录失败: {e.message}")

    except httpx.HTTPStatusError as e:
        logger.error(f"获取通话记录HTTP错误: {e.response.status_code}")
        return ResponseModel.error(
            code=e.response.status_code,
            message=f"云客服务请求失败: {e.response.status_code}",
        )

    except Exception as e:
        logger.error(f"获取通话记录异常: {e}")
        return ResponseModel.error(code=500, message=f"获取通话记录异常: {str(e)}")


@router.post("/dept/tree", response_model=ResponseModel[YunkeDeptTreeData])
async def yunke_get_dept_tree(request: YunkeDeptTreeRequest):
    """获取部门树

    获取公司的部门组织架构树形结构

    Args:
        request: 部门树请求参数

    Returns:
        ResponseModel: 包含部门树数据的响应
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

    # 创建部门客户端
    client = DeptClient(
        phone=account.phone,
        company_code=company.company_code,
        user_id=account.user_id or "",
        cookies=cookies,
        domain=company.domain if company.domain else None,
        auto_login_callback=auto_login_callback,
    )

    try:
        result = await client.get_dept_tree(
            root_dept_id=request.root_dept_id,
            show_user=request.show_user,
        )

        return ResponseModel.success(
            data=YunkeDeptTreeData(json=result),
            message="获取部门树成功",
        )

    except YunkePasswordException as e:
        logger.error(f"获取部门树密码错误: {e.message}")
        return ResponseModel.error(code=401, message=f"密码错误: {e.message}")

    except YunkeApiException as e:
        logger.error(f"获取部门树失败: {e.message}")
        return ResponseModel.error(code=400, message=f"获取部门树失败: {e.message}")

    except httpx.HTTPStatusError as e:
        logger.error(f"获取部门树HTTP错误: {e.response.status_code}")
        return ResponseModel.error(
            code=e.response.status_code,
            message=f"云客服务请求失败: {e.response.status_code}",
        )

    except Exception as e:
        logger.error(f"获取部门树异常: {e}")
        return ResponseModel.error(code=500, message=f"获取部门树异常: {str(e)}")


@router.post("/dept/sync", response_model=ResponseModel)
async def yunke_sync_dept_tree(request: YunkeSyncDeptRequest):
    """同步部门数据

    获取部门树并保存到数据库

    Args:
        request: 同步部门请求参数

    Returns:
        ResponseModel: 同步结果
    """
    from datetime import datetime

    from sqlmodel import Session

    from app.database import engine
    from app.models.yunke_company import YunkeCompany

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

    # 创建部门客户端
    client = DeptClient(
        phone=account.phone,
        company_code=company.company_code,
        user_id=account.user_id or "",
        cookies=cookies,
        domain=company.domain if company.domain else None,
        auto_login_callback=auto_login_callback,
    )

    try:
        result = await client.get_dept_tree(show_user=True)

        # 从返回数据中提取根部门ID
        root_dept_id = None
        if result.get("success") and result.get("data"):
            data = result["data"]
            # 部门树数据通常是列表或单个对象
            if isinstance(data, list) and len(data) > 0:
                root_dept_id = data[0].get("id")
            elif isinstance(data, dict):
                root_dept_id = data.get("id")

        # 保存到数据库
        with Session(engine) as session:
            db_company = session.get(YunkeCompany, company.id)
            if db_company:
                db_company.root_dept_id = root_dept_id
                db_company.dept_tree = json.dumps(result, ensure_ascii=False)
                db_company.dept_updated_at = datetime.now()
                session.add(db_company)
                session.commit()

        return ResponseModel.success(
            data={"root_dept_id": root_dept_id},
            message="部门数据同步成功",
        )

    except YunkePasswordException as e:
        logger.error(f"同步部门数据密码错误: {e.message}")
        return ResponseModel.error(code=401, message=f"密码错误: {e.message}")

    except YunkeApiException as e:
        logger.error(f"同步部门数据失败: {e.message}")
        return ResponseModel.error(code=400, message=f"同步部门数据失败: {e.message}")

    except httpx.HTTPStatusError as e:
        logger.error(f"同步部门数据HTTP错误: {e.response.status_code}")
        return ResponseModel.error(
            code=e.response.status_code,
            message=f"云客服务请求失败: {e.response.status_code}",
        )

    except Exception as e:
        logger.error(f"同步部门数据异常: {e}")
        return ResponseModel.error(code=500, message=f"同步部门数据异常: {str(e)}")


@router.get("/dept/data/{account_id}", response_model=ResponseModel)
async def yunke_get_dept_data(account_id: int):
    """获取已保存的部门树数据

    从数据库获取之前同步的部门树数据

    Args:
        account_id: 账号ID

    Returns:
        ResponseModel: 部门树数据
    """
    from sqlmodel import Session

    from app.database import engine
    from app.models.yunke_company import YunkeCompany

    # 获取账号信息
    account_data = get_account_by_id(account_id)
    if not account_data:
        return ResponseModel.error(code=404, message="账号不存在")

    account, company = account_data

    # 获取公司的部门数据
    with Session(engine) as session:
        db_company = session.get(YunkeCompany, company.id)
        if not db_company or not db_company.dept_tree:
            return ResponseModel.error(
                code=404, message="部门数据不存在，请先同步部门数据"
            )

        try:
            dept_tree = json.loads(db_company.dept_tree)
        except json.JSONDecodeError:
            return ResponseModel.error(code=500, message="部门数据解析失败")

        return ResponseModel.success(
            data={
                "root_dept_id": db_company.root_dept_id,
                "dept_tree": dept_tree,
                "updated_at": db_company.dept_updated_at.isoformat()
                if db_company.dept_updated_at
                else None,
            },
            message="获取部门数据成功",
        )
