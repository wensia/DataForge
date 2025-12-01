"""账号管理API路由"""

from fastapi import APIRouter
from loguru import logger

from app.models.yunke_account import (
    YunkeAccountCreate,
    YunkeAccountResponse,
    YunkeAccountUpdate,
)
from app.schemas.response import ResponseModel
from app.services import account_service

router = APIRouter(prefix="/accounts", tags=["账号管理"])


@router.get("", response_model=ResponseModel[list[YunkeAccountResponse]])
async def get_accounts():
    """获取所有账号列表

    Returns:
        ResponseModel: 账号列表
    """
    try:
        accounts = account_service.get_all_accounts()
        return ResponseModel.success(data=accounts, message="获取成功")
    except Exception as e:
        logger.error(f"获取账号列表失败: {e}")
        return ResponseModel.error(code=500, message=str(e))


@router.get("/{account_id}", response_model=ResponseModel[YunkeAccountResponse])
async def get_account(account_id: int):
    """获取单个账号信息

    Args:
        account_id: 账号ID

    Returns:
        ResponseModel: 账号信息
    """
    result = account_service.get_account_by_id(account_id)
    if not result:
        return ResponseModel.error(code=404, message="账号不存在")

    account, company = result
    return ResponseModel.success(
        data=account_service._account_to_response(account, company),
        message="获取成功",
    )


@router.post("", response_model=ResponseModel[YunkeAccountResponse])
async def create_or_update_account(data: YunkeAccountCreate):
    """创建或更新账号（Upsert）

    如果手机号+公司代码已存在则更新密码，否则创建新账号

    Args:
        data: 账号数据

    Returns:
        ResponseModel: 账号信息
    """
    try:
        account, is_new = account_service.create_or_update_account(data)
        message = "创建成功" if is_new else "更新成功"
        return ResponseModel.success(data=account, message=message)
    except Exception as e:
        logger.error(f"创建/更新账号失败: {e}")
        return ResponseModel.error(code=500, message=str(e))


@router.put("/{account_id}", response_model=ResponseModel[YunkeAccountResponse])
async def update_account(account_id: int, data: YunkeAccountUpdate):
    """更新账号信息

    Args:
        account_id: 账号ID
        data: 更新数据

    Returns:
        ResponseModel: 更新后的账号信息
    """
    try:
        account = account_service.update_account(account_id, data)
        if not account:
            return ResponseModel.error(code=404, message="账号不存在")

        return ResponseModel.success(data=account, message="更新成功")
    except Exception as e:
        logger.error(f"更新账号失败: {e}")
        return ResponseModel.error(code=500, message=str(e))


@router.delete("/{account_id}", response_model=ResponseModel)
async def delete_account(account_id: int):
    """删除账号

    Args:
        account_id: 账号ID

    Returns:
        ResponseModel: 删除结果
    """
    success = account_service.delete_account(account_id)
    if not success:
        return ResponseModel.error(code=404, message="账号不存在")

    return ResponseModel.success(message="删除成功")


@router.post("/{account_id}/login", response_model=ResponseModel)
async def login_account(account_id: int):
    """手动触发账号登录

    Args:
        account_id: 账号ID

    Returns:
        ResponseModel: 登录结果
    """
    result = await account_service.auto_login(account_id)

    if result["success"]:
        return ResponseModel.success(data=result.get("data"), message=result["message"])
    else:
        return ResponseModel.error(code=400, message=result["message"])


@router.get("/{account_id}/status", response_model=ResponseModel)
async def check_status(account_id: int):
    """检查账号状态

    Args:
        account_id: 账号ID

    Returns:
        ResponseModel: 状态信息
    """
    result = await account_service.check_account_status(account_id)

    return ResponseModel.success(
        data={
            "valid": result["valid"],
            "status": result.get("status"),
            "last_login": result.get("last_login"),
        },
        message=result["message"],
    )
