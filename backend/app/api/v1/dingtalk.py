"""钉钉机器人配置管理 API

管理钉钉机器人的 Webhook 和密钥配置。
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
from app.models import (
    DingTalkConfig,
    DingTalkConfigCreate,
    DingTalkConfigResponse,
    DingTalkConfigUpdate,
    DingTalkTestRequest,
)
from app.schemas.response import ResponseModel

router = APIRouter(prefix="/dingtalk", tags=["钉钉配置"])


def generate_sign(secret: str, timestamp: int) -> str:
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
    hmac_code = hmac.new(secret_enc, string_to_sign_enc, digestmod=hashlib.sha256).digest()
    sign = urllib.parse.quote_plus(base64.b64encode(hmac_code))
    return sign


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
    timestamp = int(time.time() * 1000)
    sign = generate_sign(secret, timestamp)

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


@router.get("", response_model=ResponseModel)
def get_dingtalk_configs(
    skip: int = 0,
    limit: int = 100,
    is_active: bool | None = None,
    session: Session = Depends(get_session),
):
    """获取钉钉配置列表"""
    query = select(DingTalkConfig)

    if is_active is not None:
        query = query.where(DingTalkConfig.is_active == is_active)

    query = query.offset(skip).limit(limit)
    configs = session.exec(query).all()

    return ResponseModel(data=[DingTalkConfigResponse.from_model(c) for c in configs])


@router.post("/test", response_model=ResponseModel)
async def test_dingtalk_webhook(data: DingTalkTestRequest):
    """测试钉钉 Webhook 连接

    在保存配置前测试 Webhook 是否有效。
    """
    success, message = await send_dingtalk_message(
        data.webhook_url, data.secret, data.message
    )

    if success:
        return ResponseModel(
            message="测试成功，消息已发送",
            data={"status": "success"},
        )
    else:
        return ResponseModel(
            code=400,
            message=f"测试失败: {message}",
            data={"status": "error", "error": message},
        )


@router.post("", response_model=ResponseModel)
async def create_dingtalk_config(
    data: DingTalkConfigCreate,
    session: Session = Depends(get_session),
):
    """创建钉钉配置

    创建前必须先通过测试验证。
    """
    # 先测试 Webhook 是否有效
    success, message = await send_dingtalk_message(
        data.webhook_url, data.secret, f"[DataForge] 钉钉机器人「{data.name}」配置验证成功"
    )

    if not success:
        return ResponseModel(
            code=400,
            message=f"Webhook 验证失败: {message}，请先通过测试再保存",
            data={"status": "error", "error": message},
        )

    # 验证成功，创建配置
    config = DingTalkConfig(**data.model_dump(), is_verified=True)
    session.add(config)
    session.commit()
    session.refresh(config)

    logger.info(f"创建钉钉配置: {config.name} (#{config.id})")

    return ResponseModel(message="创建成功", data=DingTalkConfigResponse.from_model(config))


@router.get("/{config_id}", response_model=ResponseModel)
def get_dingtalk_config(
    config_id: int,
    session: Session = Depends(get_session),
):
    """获取单个钉钉配置"""
    config = session.get(DingTalkConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")

    return ResponseModel(data=DingTalkConfigResponse.from_model(config))


@router.put("/{config_id}", response_model=ResponseModel)
async def update_dingtalk_config(
    config_id: int,
    data: DingTalkConfigUpdate,
    session: Session = Depends(get_session),
):
    """更新钉钉配置

    如果更新了 webhook_url 或 secret，需要重新验证。
    """
    config = session.get(DingTalkConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")

    update_data = data.model_dump(exclude_unset=True)

    # 检查是否更新了关键字段
    webhook_changed = "webhook_url" in update_data and update_data["webhook_url"] != config.webhook_url
    secret_changed = "secret" in update_data and update_data["secret"] != config.secret

    # 如果更新了关键字段，需要重新验证
    if webhook_changed or secret_changed:
        new_webhook = update_data.get("webhook_url", config.webhook_url)
        new_secret = update_data.get("secret", config.secret)
        new_name = update_data.get("name", config.name)

        success, message = await send_dingtalk_message(
            new_webhook, new_secret, f"[DataForge] 钉钉机器人「{new_name}」配置更新验证成功"
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

    logger.info(f"更新钉钉配置: {config.name} (#{config.id})")

    return ResponseModel(message="更新成功", data=DingTalkConfigResponse.from_model(config))


@router.delete("/{config_id}", response_model=ResponseModel)
def delete_dingtalk_config(
    config_id: int,
    session: Session = Depends(get_session),
):
    """删除钉钉配置"""
    config = session.get(DingTalkConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")

    name = config.name
    session.delete(config)
    session.commit()

    logger.info(f"删除钉钉配置: {name} (#{config_id})")

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
    config = session.get(DingTalkConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")

    if not config.is_active:
        return ResponseModel(code=400, message="该配置已禁用")

    if not config.is_verified:
        return ResponseModel(code=400, message="该配置未验证，请先验证后再使用")

    success, result_message = await send_dingtalk_message(
        config.webhook_url, config.secret, message
    )

    if success:
        return ResponseModel(message="消息发送成功")
    else:
        return ResponseModel(code=400, message=f"发送失败: {result_message}")
