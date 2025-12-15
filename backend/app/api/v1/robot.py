"""机器人配置管理 API

管理钉钉/飞书机器人的 Webhook 和密钥配置。
"""

import base64
import hashlib
import hmac
import time
import urllib.parse
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from sqlmodel import Session, select

from app.database import get_session
from app.models.robot_config import (
    RobotConfig,
    RobotConfigCreate,
    RobotConfigResponse,
    RobotConfigUpdate,
    RobotPlatform,
    RobotTestRequest,
)
from app.schemas.response import ResponseModel

router = APIRouter(prefix="/robot", tags=["机器人配置"])


# ============ 签名生成函数 ============


def generate_dingtalk_sign(secret: str, timestamp: int) -> str:
    """生成钉钉签名

    Args:
        secret: 签名密钥
        timestamp: 时间戳（毫秒）

    Returns:
        str: 签名字符串
    """
    secret_enc = secret.encode("utf-8")
    string_to_sign = f"{timestamp}\n{secret}"
    string_to_sign_enc = string_to_sign.encode("utf-8")
    hmac_code = hmac.new(
        secret_enc, string_to_sign_enc, digestmod=hashlib.sha256
    ).digest()
    sign = urllib.parse.quote_plus(base64.b64encode(hmac_code))
    return sign


def generate_feishu_sign(secret: str, timestamp: int) -> str:
    """生成飞书签名

    Args:
        secret: 签名密钥
        timestamp: 时间戳（秒级）

    Returns:
        str: 签名字符串
    """
    string_to_sign = f"{timestamp}\n{secret}"
    hmac_code = hmac.new(
        string_to_sign.encode("utf-8"), digestmod=hashlib.sha256
    ).digest()
    sign = base64.b64encode(hmac_code).decode("utf-8")
    return sign


# ============ 消息发送函数 ============


async def send_dingtalk_message(
    webhook_url: str, secret: str, message: str
) -> tuple[bool, str]:
    """发送钉钉消息

    Args:
        webhook_url: Webhook URL
        secret: 签名密钥
        message: 消息内容

    Returns:
        tuple[bool, str]: (是否成功, 错误信息或成功信息)
    """
    timestamp = int(time.time() * 1000)  # 毫秒级时间戳
    sign = generate_dingtalk_sign(secret, timestamp)

    # 拼接带签名的 URL
    url = f"{webhook_url}&timestamp={timestamp}&sign={sign}"

    payload = {
        "msgtype": "text",
        "text": {"content": message},
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json=payload)
            result = response.json()

            if result.get("errcode") == 0:
                return True, "发送成功"
            else:
                error_msg = result.get("errmsg", "未知错误")
                logger.warning(f"钉钉消息发送失败: {error_msg}")
                return False, error_msg

    except httpx.TimeoutException:
        return False, "请求超时"
    except Exception as e:
        logger.error(f"钉钉消息发送异常: {e}")
        return False, str(e)


async def send_feishu_message(
    webhook_url: str, secret: str, message: str
) -> tuple[bool, str]:
    """发送飞书消息

    Args:
        webhook_url: Webhook URL
        secret: 签名密钥
        message: 消息内容

    Returns:
        tuple[bool, str]: (是否成功, 错误信息或成功信息)
    """
    timestamp = int(time.time())  # 秒级时间戳
    sign = generate_feishu_sign(secret, timestamp)

    payload = {
        "timestamp": str(timestamp),
        "sign": sign,
        "msg_type": "text",
        "content": {"text": message},
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(webhook_url, json=payload)
            result = response.json()

            # 飞书成功返回 {"code": 0, "msg": "success"}
            if result.get("code") == 0:
                return True, "发送成功"
            else:
                error_msg = result.get("msg", "未知错误")
                logger.warning(f"飞书消息发送失败: {error_msg}")
                return False, error_msg

    except httpx.TimeoutException:
        return False, "请求超时"
    except Exception as e:
        logger.error(f"飞书消息发送异常: {e}")
        return False, str(e)


async def send_robot_message(
    platform: str, webhook_url: str, secret: str, message: str
) -> tuple[bool, str]:
    """根据平台发送机器人消息

    Args:
        platform: 平台类型 (dingtalk/feishu)
        webhook_url: Webhook URL
        secret: 签名密钥
        message: 消息内容

    Returns:
        tuple[bool, str]: (是否成功, 错误信息或成功信息)
    """
    if platform == RobotPlatform.FEISHU.value:
        return await send_feishu_message(webhook_url, secret, message)
    else:
        return await send_dingtalk_message(webhook_url, secret, message)


# ============ API 端点 ============


@router.get("", response_model=ResponseModel)
def get_robot_configs(
    skip: int = 0,
    limit: int = 100,
    platform: str | None = None,
    is_active: bool | None = None,
    session: Session = Depends(get_session),
):
    """获取机器人配置列表"""
    query = select(RobotConfig)

    if platform is not None:
        query = query.where(RobotConfig.platform == platform)

    if is_active is not None:
        query = query.where(RobotConfig.is_active == is_active)

    query = query.offset(skip).limit(limit)
    configs = session.exec(query).all()

    return ResponseModel(data=[RobotConfigResponse.from_model(c) for c in configs])


@router.post("/test", response_model=ResponseModel)
async def test_robot_webhook(data: RobotTestRequest):
    """测试机器人 Webhook 连接

    在保存配置前测试 Webhook 是否有效。
    """
    platform_name = "飞书" if data.platform == RobotPlatform.FEISHU.value else "钉钉"

    success, message = await send_robot_message(
        data.platform, data.webhook_url, data.secret, data.message
    )

    if success:
        return ResponseModel(
            message=f"{platform_name}机器人测试成功，消息已发送",
            data={"status": "success"},
        )
    else:
        return ResponseModel(
            code=400,
            message=f"{platform_name}机器人测试失败: {message}",
            data={"status": "error", "error": message},
        )


@router.post("", response_model=ResponseModel)
async def create_robot_config(
    data: RobotConfigCreate,
    session: Session = Depends(get_session),
):
    """创建机器人配置

    创建前必须先通过测试验证。
    """
    platform_name = "飞书" if data.platform == RobotPlatform.FEISHU.value else "钉钉"

    # 先测试 Webhook 是否有效
    success, message = await send_robot_message(
        data.platform,
        data.webhook_url,
        data.secret,
        f"[DataForge] {platform_name}机器人「{data.name}」配置验证成功",
    )

    if not success:
        return ResponseModel(
            code=400,
            message=f"Webhook 验证失败: {message}，请先通过测试再保存",
            data={"status": "error", "error": message},
        )

    # 验证成功，创建配置
    config = RobotConfig(**data.model_dump(), is_verified=True)
    session.add(config)
    session.commit()
    session.refresh(config)

    logger.info(f"创建{platform_name}机器人配置: {config.name} (#{config.id})")

    return ResponseModel(
        message="创建成功", data=RobotConfigResponse.from_model(config)
    )


@router.get("/{config_id}", response_model=ResponseModel)
def get_robot_config(
    config_id: int,
    session: Session = Depends(get_session),
):
    """获取单个机器人配置"""
    config = session.get(RobotConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")

    return ResponseModel(data=RobotConfigResponse.from_model(config))


@router.put("/{config_id}", response_model=ResponseModel)
async def update_robot_config(
    config_id: int,
    data: RobotConfigUpdate,
    session: Session = Depends(get_session),
):
    """更新机器人配置

    如果更新了 webhook_url 或 secret，需要重新验证。
    """
    config = session.get(RobotConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")

    update_data = data.model_dump(exclude_unset=True)

    # 检查是否更新了关键字段
    webhook_changed = (
        "webhook_url" in update_data
        and update_data["webhook_url"] != config.webhook_url
    )
    secret_changed = "secret" in update_data and update_data["secret"] != config.secret
    platform_changed = (
        "platform" in update_data and update_data["platform"] != config.platform
    )

    # 如果更新了关键字段，需要重新验证
    if webhook_changed or secret_changed or platform_changed:
        new_platform = update_data.get("platform", config.platform)
        new_webhook = update_data.get("webhook_url", config.webhook_url)
        new_secret = update_data.get("secret", config.secret)
        new_name = update_data.get("name", config.name)
        platform_name = "飞书" if new_platform == RobotPlatform.FEISHU.value else "钉钉"

        success, message = await send_robot_message(
            new_platform,
            new_webhook,
            new_secret,
            f"[DataForge] {platform_name}机器人「{new_name}」配置更新验证成功",
        )

        if not success:
            return ResponseModel(
                code=400,
                message=f"Webhook 验证失败: {message}，请先通过测试再保存",
                data={"status": "error", "error": message},
            )

        update_data["is_verified"] = True

    # 更新配置
    for key, value in update_data.items():
        setattr(config, key, value)

    config.updated_at = datetime.now()
    session.add(config)
    session.commit()
    session.refresh(config)

    platform_name = "飞书" if config.platform == RobotPlatform.FEISHU.value else "钉钉"
    logger.info(f"更新{platform_name}机器人配置: {config.name} (#{config.id})")

    return ResponseModel(
        message="更新成功", data=RobotConfigResponse.from_model(config)
    )


@router.delete("/{config_id}", response_model=ResponseModel)
def delete_robot_config(
    config_id: int,
    session: Session = Depends(get_session),
):
    """删除机器人配置"""
    config = session.get(RobotConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")

    name = config.name
    platform_name = "飞书" if config.platform == RobotPlatform.FEISHU.value else "钉钉"
    session.delete(config)
    session.commit()

    logger.info(f"删除{platform_name}机器人配置: {name} (#{config_id})")

    return ResponseModel(message="删除成功")


@router.post("/{config_id}/send", response_model=ResponseModel)
async def send_message(
    config_id: int,
    message: str,
    session: Session = Depends(get_session),
):
    """使用指定配置发送消息

    Args:
        config_id: 配置 ID
        message: 消息内容
    """
    config = session.get(RobotConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")

    if not config.is_active:
        return ResponseModel(code=400, message="该配置已禁用")

    if not config.is_verified:
        return ResponseModel(code=400, message="该配置未验证，请先验证后再使用")

    success, result_message = await send_robot_message(
        config.platform, config.webhook_url, config.secret, message
    )

    if success:
        return ResponseModel(message="消息发送成功")
    else:
        return ResponseModel(code=400, message=f"发送失败: {result_message}")
