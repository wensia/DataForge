"""ASR 语音识别配置管理 API

管理腾讯云、阿里云、火山引擎等 ASR 服务的 API 密钥配置。
"""

import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
from app.models.asr_config import (
    ASR_PROVIDER_PRESETS,
    ASRConfig,
    ASRConfigCreate,
    ASRConfigResponse,
    ASRConfigUpdate,
    ASRProvider,
)
from app.schemas.response import ResponseModel
from app.services.asr_verify_service import verify_asr_credentials

router = APIRouter(prefix="/asr-configs", tags=["ASR 配置"])


@router.get("", response_model=ResponseModel)
def get_asr_configs(
    skip: int = 0,
    limit: int = 100,
    provider: str | None = None,
    is_active: bool | None = None,
    session: Session = Depends(get_session),
):
    """获取 ASR 配置列表"""
    query = select(ASRConfig)

    if provider:
        query = query.where(ASRConfig.provider == provider)
    if is_active is not None:
        query = query.where(ASRConfig.is_active == is_active)

    query = query.offset(skip).limit(limit)
    configs = session.exec(query).all()

    return ResponseModel(data=[ASRConfigResponse.from_model(c) for c in configs])


@router.post("", response_model=ResponseModel)
async def create_asr_config(
    data: ASRConfigCreate,
    session: Session = Depends(get_session),
):
    """创建 ASR 配置

    创建前会先验证密钥有效性，只有验证通过才能保存。
    """
    # 验证 provider
    if data.provider not in [p.value for p in ASRProvider]:
        raise HTTPException(
            status_code=400, detail=f"不支持的 ASR 提供商: {data.provider}"
        )

    # 验证密钥
    verify_result = await verify_asr_credentials(data.provider, data.credentials)
    if not verify_result["success"]:
        raise HTTPException(
            status_code=400,
            detail=f"密钥验证失败: {verify_result['message']}",
        )

    # 如果设置为默认，取消其他同提供商的默认配置
    if data.is_default:
        existing_defaults = session.exec(
            select(ASRConfig).where(
                ASRConfig.provider == data.provider, ASRConfig.is_default == True
            )
        ).all()
        for config in existing_defaults:
            config.is_default = False
            session.add(config)

    # 创建配置
    config = ASRConfig(
        provider=data.provider,
        name=data.name,
        credentials=json.dumps(data.credentials),
        is_active=data.is_active,
        is_default=data.is_default,
        last_verified_at=datetime.now(),
        notes=data.notes,
    )
    session.add(config)
    session.commit()
    session.refresh(config)

    return ResponseModel(message="创建成功", data=ASRConfigResponse.from_model(config))


@router.get("/presets", response_model=ResponseModel)
def get_asr_provider_presets():
    """获取 ASR 提供商预设配置"""
    presets = {
        provider.value: preset for provider, preset in ASR_PROVIDER_PRESETS.items()
    }
    return ResponseModel(data=presets)


@router.get("/options", response_model=ResponseModel)
def get_asr_config_options(
    session: Session = Depends(get_session),
):
    """获取 ASR 配置下拉选项

    返回所有启用的 ASR 配置，用于任务参数中的下拉框选择。
    """
    query = select(ASRConfig).where(ASRConfig.is_active == True)
    configs = session.exec(query).all()

    options = [
        {
            "id": c.id,
            "name": c.name,
            "provider": c.provider,
            "label": f"{c.name} ({c.provider})",
        }
        for c in configs
    ]

    return ResponseModel(data=options)


@router.get("/{config_id}", response_model=ResponseModel)
def get_asr_config(
    config_id: int,
    session: Session = Depends(get_session),
):
    """获取单个 ASR 配置"""
    config = session.get(ASRConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")

    return ResponseModel(data=ASRConfigResponse.from_model(config))


@router.put("/{config_id}", response_model=ResponseModel)
async def update_asr_config(
    config_id: int,
    data: ASRConfigUpdate,
    session: Session = Depends(get_session),
):
    """更新 ASR 配置

    如果更新了 credentials，会重新验证密钥有效性。
    """
    config = session.get(ASRConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")

    update_data = data.model_dump(exclude_unset=True)

    # 如果更新了密钥，需要重新验证
    if "credentials" in update_data and update_data["credentials"]:
        verify_result = await verify_asr_credentials(
            config.provider, update_data["credentials"]
        )
        if not verify_result["success"]:
            raise HTTPException(
                status_code=400,
                detail=f"密钥验证失败: {verify_result['message']}",
            )
        # 序列化为 JSON 字符串
        update_data["credentials"] = json.dumps(update_data["credentials"])
        update_data["last_verified_at"] = datetime.now()

    # 如果设置为默认，取消其他同提供商的默认配置
    if update_data.get("is_default"):
        existing_defaults = session.exec(
            select(ASRConfig).where(
                ASRConfig.provider == config.provider,
                ASRConfig.is_default == True,
                ASRConfig.id != config_id,
            )
        ).all()
        for c in existing_defaults:
            c.is_default = False
            session.add(c)

    for key, value in update_data.items():
        setattr(config, key, value)

    config.updated_at = datetime.now()
    session.add(config)
    session.commit()
    session.refresh(config)

    return ResponseModel(message="更新成功", data=ASRConfigResponse.from_model(config))


@router.delete("/{config_id}", response_model=ResponseModel)
def delete_asr_config(
    config_id: int,
    session: Session = Depends(get_session),
):
    """删除 ASR 配置"""
    config = session.get(ASRConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")

    session.delete(config)
    session.commit()

    return ResponseModel(message="删除成功")


@router.post("/{config_id}/verify", response_model=ResponseModel)
async def verify_asr_config(
    config_id: int,
    session: Session = Depends(get_session),
):
    """重新验证 ASR 配置"""
    config = session.get(ASRConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")

    # 解析 credentials
    credentials = json.loads(config.credentials) if config.credentials else {}

    # 验证密钥
    verify_result = await verify_asr_credentials(config.provider, credentials)

    # 更新验证时间
    config.last_verified_at = datetime.now()
    session.add(config)
    session.commit()
    session.refresh(config)

    if verify_result["success"]:
        return ResponseModel(
            message="验证成功",
            data={
                "success": True,
                "config": ASRConfigResponse.from_model(config),
                "detail": verify_result.get("detail"),
            },
        )
    else:
        return ResponseModel(
            code=400,
            message=f"验证失败: {verify_result['message']}",
            data={
                "success": False,
                "config": ASRConfigResponse.from_model(config),
                "detail": verify_result.get("detail"),
            },
        )
