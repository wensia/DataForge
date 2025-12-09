"""AI 配置管理 API

管理 Kimi、DeepSeek 等 AI 服务的 API 密钥配置。
"""

from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
from app.models import (
    PROVIDER_PRESETS,
    AIConfig,
    AIConfigCreate,
    AIConfigResponse,
    AIConfigUpdate,
    AIProvider,
)
from app.schemas.response import ResponseModel

router = APIRouter(prefix="/ai-configs", tags=["AI 配置"])


@router.get("", response_model=ResponseModel)
def get_ai_configs(
    skip: int = 0,
    limit: int = 100,
    provider: str | None = None,
    is_active: bool | None = None,
    session: Session = Depends(get_session),
):
    """获取 AI 配置列表"""
    query = select(AIConfig)

    if provider:
        query = query.where(AIConfig.provider == provider)
    if is_active is not None:
        query = query.where(AIConfig.is_active == is_active)

    query = query.offset(skip).limit(limit)
    configs = session.exec(query).all()

    return ResponseModel(data=[AIConfigResponse.from_model(c) for c in configs])


@router.post("", response_model=ResponseModel)
def create_ai_config(
    data: AIConfigCreate,
    session: Session = Depends(get_session),
):
    """创建 AI 配置"""
    # 验证 provider
    if data.provider not in [p.value for p in AIProvider]:
        raise HTTPException(
            status_code=400, detail=f"不支持的 AI 提供商: {data.provider}"
        )

    config = AIConfig(**data.model_dump())
    session.add(config)
    session.commit()
    session.refresh(config)

    return ResponseModel(message="创建成功", data=AIConfigResponse.from_model(config))


@router.get("/presets", response_model=ResponseModel)
def get_provider_presets():
    """获取提供商预设配置"""
    presets = {provider.value: preset for provider, preset in PROVIDER_PRESETS.items()}
    return ResponseModel(data=presets)


@router.get("/{config_id}", response_model=ResponseModel)
def get_ai_config(
    config_id: int,
    session: Session = Depends(get_session),
):
    """获取单个 AI 配置"""
    config = session.get(AIConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")

    return ResponseModel(data=AIConfigResponse.from_model(config))


@router.put("/{config_id}", response_model=ResponseModel)
def update_ai_config(
    config_id: int,
    data: AIConfigUpdate,
    session: Session = Depends(get_session),
):
    """更新 AI 配置"""
    config = session.get(AIConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(config, key, value)

    config.updated_at = datetime.now()
    session.add(config)
    session.commit()
    session.refresh(config)

    return ResponseModel(message="更新成功", data=AIConfigResponse.from_model(config))


@router.delete("/{config_id}", response_model=ResponseModel)
def delete_ai_config(
    config_id: int,
    session: Session = Depends(get_session),
):
    """删除 AI 配置"""
    config = session.get(AIConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")

    session.delete(config)
    session.commit()

    return ResponseModel(message="删除成功")


@router.post("/{config_id}/test", response_model=ResponseModel)
async def test_ai_config(
    config_id: int,
    session: Session = Depends(get_session),
):
    """测试 AI 配置连接

    发送一个简单的请求测试 API 密钥是否有效。
    """
    config = session.get(AIConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")

    # 构建测试请求
    headers = {
        "Authorization": f"Bearer {config.api_key}",
        "Content-Type": "application/json",
    }

    # 使用最简单的请求测试
    test_payload = {
        "model": config.default_model
        or ("moonshot-v1-8k" if config.provider == "kimi" else "deepseek-chat"),
        "messages": [{"role": "user", "content": "Hi"}],
        "max_tokens": 5,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # 拼接完整的 URL
            url = f"{config.base_url.rstrip('/')}/chat/completions"
            response = await client.post(url, headers=headers, json=test_payload)

            if response.status_code == 200:
                return ResponseModel(
                    message="连接测试成功",
                    data={"status": "success", "provider": config.provider},
                )
            elif response.status_code == 401:
                return ResponseModel(
                    code=400,
                    message="API 密钥无效",
                    data={"status": "error", "error": "Invalid API key"},
                )
            else:
                error_detail = response.text[:200] if response.text else "Unknown error"
                return ResponseModel(
                    code=400,
                    message=f"测试失败: HTTP {response.status_code}",
                    data={"status": "error", "error": error_detail},
                )

    except httpx.TimeoutException:
        return ResponseModel(
            code=400,
            message="连接超时",
            data={"status": "error", "error": "Connection timeout"},
        )
    except Exception as e:
        return ResponseModel(
            code=500,
            message=f"测试失败: {str(e)}",
            data={"status": "error", "error": str(e)},
        )
