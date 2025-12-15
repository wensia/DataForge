"""极致了API配置管理

管理极致了服务的 API 密钥配置。
"""

from datetime import datetime

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.database import get_session
from app.models.dajiala_config import (
    DajialaConfig,
    DajialaConfigCreate,
    DajialaConfigResponse,
    DajialaConfigUpdate,
)
from app.schemas.response import ResponseModel
from app.services.dajiala_verify_service import verify_dajiala_credentials

router = APIRouter(prefix="/dajiala-configs", tags=["极致了配置"])


@router.get("", response_model=ResponseModel)
def get_dajiala_configs(
    skip: int = 0,
    limit: int = 100,
    is_active: bool | None = None,
    session: Session = Depends(get_session),
):
    """获取极致了API配置列表"""
    query = select(DajialaConfig)

    if is_active is not None:
        query = query.where(DajialaConfig.is_active == is_active)

    query = query.offset(skip).limit(limit)
    configs = session.exec(query).all()

    return ResponseModel(data=[DajialaConfigResponse.from_model(c) for c in configs])


@router.post("", response_model=ResponseModel)
async def create_dajiala_config(
    data: DajialaConfigCreate,
    session: Session = Depends(get_session),
):
    """创建极致了API配置

    创建前会先验证密钥有效性，只有验证通过才能保存。
    """
    # 验证密钥
    verify_result = await verify_dajiala_credentials(
        api_key=data.api_key,
        verify_code=data.verify_code,
        test_biz=data.test_biz,
    )

    if not verify_result["success"]:
        return ResponseModel.error(
            code=400,
            message=f"密钥验证失败: {verify_result['message']}",
        )

    # 如果设置为默认，取消其他默认配置
    if data.is_default:
        existing_defaults = session.exec(
            select(DajialaConfig).where(DajialaConfig.is_default)
        ).all()
        for config in existing_defaults:
            config.is_default = False
            session.add(config)

    # 创建配置
    config = DajialaConfig(
        name=data.name,
        api_key=data.api_key,
        verify_code=data.verify_code,
        test_biz=data.test_biz,
        is_active=data.is_active,
        is_default=data.is_default,
        last_verified_at=datetime.now(),
        remain_money=verify_result.get("remain_money"),
        notes=data.notes,
    )
    session.add(config)
    session.commit()
    session.refresh(config)

    return ResponseModel(
        message="创建成功", data=DajialaConfigResponse.from_model(config)
    )


@router.get("/{config_id}", response_model=ResponseModel)
def get_dajiala_config(
    config_id: int,
    session: Session = Depends(get_session),
):
    """获取单个极致了API配置"""
    config = session.get(DajialaConfig, config_id)
    if not config:
        return ResponseModel.error(code=404, message="配置不存在")

    return ResponseModel(data=DajialaConfigResponse.from_model(config))


@router.put("/{config_id}", response_model=ResponseModel)
async def update_dajiala_config(
    config_id: int,
    data: DajialaConfigUpdate,
    session: Session = Depends(get_session),
):
    """更新极致了API配置

    如果更新了 api_key，会重新验证密钥有效性。
    """
    config = session.get(DajialaConfig, config_id)
    if not config:
        return ResponseModel.error(code=404, message="配置不存在")

    update_data = data.model_dump(exclude_unset=True)

    # 如果更新了密钥，需要重新验证
    if "api_key" in update_data:
        verify_result = await verify_dajiala_credentials(
            api_key=update_data.get("api_key", config.api_key),
            verify_code=update_data.get("verify_code", config.verify_code),
            test_biz=update_data.get("test_biz", config.test_biz),
        )
        if not verify_result["success"]:
            return ResponseModel.error(
                code=400,
                message=f"密钥验证失败: {verify_result['message']}",
            )
        update_data["last_verified_at"] = datetime.now()
        update_data["remain_money"] = verify_result.get("remain_money")

    # 如果设置为默认，取消其他默认配置
    if update_data.get("is_default"):
        existing_defaults = session.exec(
            select(DajialaConfig).where(
                DajialaConfig.is_default,
                DajialaConfig.id != config_id,
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

    return ResponseModel(
        message="更新成功", data=DajialaConfigResponse.from_model(config)
    )


@router.delete("/{config_id}", response_model=ResponseModel)
def delete_dajiala_config(
    config_id: int,
    session: Session = Depends(get_session),
):
    """删除极致了API配置"""
    config = session.get(DajialaConfig, config_id)
    if not config:
        return ResponseModel.error(code=404, message="配置不存在")

    session.delete(config)
    session.commit()

    return ResponseModel(message="删除成功")


@router.post("/{config_id}/verify", response_model=ResponseModel)
async def verify_dajiala_config(
    config_id: int,
    session: Session = Depends(get_session),
):
    """验证极致了API配置并刷新余额"""
    config = session.get(DajialaConfig, config_id)
    if not config:
        return ResponseModel.error(code=404, message="配置不存在")

    # 验证密钥
    verify_result = await verify_dajiala_credentials(
        api_key=config.api_key,
        verify_code=config.verify_code,
        test_biz=config.test_biz,
    )

    # 更新验证时间和余额信息
    config.last_verified_at = datetime.now()
    if verify_result["success"]:
        config.remain_money = verify_result.get("remain_money")
    session.add(config)
    session.commit()
    session.refresh(config)

    if verify_result["success"]:
        return ResponseModel(
            message="验证成功",
            data={
                "success": True,
                "config": DajialaConfigResponse.from_model(config),
                "remain_money": verify_result.get("remain_money"),
            },
        )
    else:
        return ResponseModel(
            code=400,
            message=f"验证失败: {verify_result['message']}",
            data={
                "success": False,
                "config": DajialaConfigResponse.from_model(config),
            },
        )
