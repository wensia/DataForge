"""API 密钥管理接口"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Query
from loguru import logger
from sqlmodel import Session, select

from app.database import engine
from app.models.api_key import ApiKey, ApiKeyCreate, ApiKeyResponse, ApiKeyUpdate
from app.schemas.response import ResponseModel
from app.utils.auth import generate_api_key

router = APIRouter(prefix="/api-keys", tags=["API密钥管理"])


@router.get("", response_model=ResponseModel)
async def list_api_keys(
    skip: int = Query(0, ge=0, description="跳过记录数"),
    limit: int = Query(100, ge=1, le=1000, description="返回记录数"),
    is_active: Optional[bool] = Query(None, description="筛选启用/禁用状态"),
):
    """获取 API 密钥列表"""
    with Session(engine) as session:
        statement = select(ApiKey)

        # 筛选条件
        if is_active is not None:
            statement = statement.where(ApiKey.is_active == is_active)

        # 分页
        statement = statement.offset(skip).limit(limit)

        keys = session.exec(statement).all()

        # 转换为响应模型
        key_responses = [
            ApiKeyResponse(
                id=key.id,
                key=key.key,
                name=key.name,
                is_active=key.is_active,
                created_at=key.created_at,
                expires_at=key.expires_at,
                last_used_at=key.last_used_at,
                usage_count=key.usage_count,
                notes=key.notes,
            )
            for key in keys
        ]

        return ResponseModel.success(
            data={"items": key_responses, "total": len(key_responses)},
            message=f"获取到 {len(key_responses)} 个 API 密钥",
        )


@router.post("", response_model=ResponseModel)
async def create_api_key(key_data: ApiKeyCreate):
    """创建新的 API 密钥"""
    with Session(engine) as session:
        # 生成或使用提供的密钥
        key_value = key_data.key if key_data.key else generate_api_key()

        # 检查密钥是否已存在
        existing = session.exec(
            select(ApiKey).where(ApiKey.key == key_value)
        ).first()
        if existing:
            return ResponseModel.error(code=400, message="API 密钥已存在")

        # 创建新密钥
        new_key = ApiKey(
            key=key_value,
            name=key_data.name,
            expires_at=key_data.expires_at,
            notes=key_data.notes,
        )

        session.add(new_key)
        session.commit()
        session.refresh(new_key)

        logger.info(f"创建新 API 密钥: {new_key.name} (ID: {new_key.id})")

        return ResponseModel.success(
            data=ApiKeyResponse(
                id=new_key.id,
                key=new_key.key,
                name=new_key.name,
                is_active=new_key.is_active,
                created_at=new_key.created_at,
                expires_at=new_key.expires_at,
                last_used_at=new_key.last_used_at,
                usage_count=new_key.usage_count,
                notes=new_key.notes,
            ),
            message="API 密钥创建成功",
        )


@router.get("/{key_id}", response_model=ResponseModel)
async def get_api_key(key_id: int):
    """获取单个 API 密钥详情"""
    with Session(engine) as session:
        key = session.get(ApiKey, key_id)
        if not key:
            return ResponseModel.error(code=404, message="API 密钥不存在")

        return ResponseModel.success(
            data=ApiKeyResponse(
                id=key.id,
                key=key.key,
                name=key.name,
                is_active=key.is_active,
                created_at=key.created_at,
                expires_at=key.expires_at,
                last_used_at=key.last_used_at,
                usage_count=key.usage_count,
                notes=key.notes,
            ),
            message="获取 API 密钥成功",
        )


@router.put("/{key_id}", response_model=ResponseModel)
async def update_api_key(key_id: int, key_data: ApiKeyUpdate):
    """更新 API 密钥"""
    with Session(engine) as session:
        key = session.get(ApiKey, key_id)
        if not key:
            return ResponseModel.error(code=404, message="API 密钥不存在")

        # 更新字段
        if key_data.name is not None:
            key.name = key_data.name
        if key_data.is_active is not None:
            key.is_active = key_data.is_active
        if key_data.expires_at is not None:
            key.expires_at = key_data.expires_at
        if key_data.notes is not None:
            key.notes = key_data.notes

        session.add(key)
        session.commit()
        session.refresh(key)

        logger.info(f"更新 API 密钥: {key.name} (ID: {key.id})")

        return ResponseModel.success(
            data=ApiKeyResponse(
                id=key.id,
                key=key.key,
                name=key.name,
                is_active=key.is_active,
                created_at=key.created_at,
                expires_at=key.expires_at,
                last_used_at=key.last_used_at,
                usage_count=key.usage_count,
                notes=key.notes,
            ),
            message="API 密钥更新成功",
        )


@router.delete("/{key_id}", response_model=ResponseModel)
async def delete_api_key(key_id: int):
    """删除 API 密钥"""
    with Session(engine) as session:
        key = session.get(ApiKey, key_id)
        if not key:
            return ResponseModel.error(code=404, message="API 密钥不存在")

        key_name = key.name
        session.delete(key)
        session.commit()

        logger.info(f"删除 API 密钥: {key_name} (ID: {key_id})")

        return ResponseModel.success(
            data={"id": key_id},
            message="API 密钥删除成功",
        )
