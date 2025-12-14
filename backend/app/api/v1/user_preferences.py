"""用户偏好设置接口"""

from datetime import datetime

from fastapi import APIRouter, Request
from loguru import logger
from sqlmodel import Session, and_, select

from app.database import engine
from app.models.user_preference import (
    UserPreference,
    UserPreferenceResponse,
    UserPreferenceUpdate,
)
from app.schemas.response import ResponseModel

router = APIRouter(prefix="/user-preferences", tags=["用户偏好"])


@router.get("/{key}", response_model=ResponseModel[UserPreferenceResponse | None])
async def get_preference(request: Request, key: str):
    """获取用户偏好设置

    Args:
        key: 偏好键名

    Returns:
        ResponseModel: 用户偏好设置
    """
    user_id = getattr(request.state, "user_id", None)

    if not user_id:
        return ResponseModel.error(code=401, message="未登录")

    with Session(engine) as session:
        statement = select(UserPreference).where(
            and_(
                UserPreference.user_id == user_id,
                UserPreference.preference_key == key,
            )
        )
        preference = session.exec(statement).first()

        if not preference:
            return ResponseModel.success(data=None, message="偏好设置不存在")

        return ResponseModel.success(
            data=UserPreferenceResponse(
                id=preference.id,
                user_id=preference.user_id,
                preference_key=preference.preference_key,
                preference_value=preference.preference_value,
                created_at=preference.created_at,
                updated_at=preference.updated_at,
            )
        )


@router.put("/{key}", response_model=ResponseModel[UserPreferenceResponse])
async def save_preference(request: Request, key: str, data: UserPreferenceUpdate):
    """保存用户偏好设置

    如果偏好不存在则创建，存在则更新

    Args:
        key: 偏好键名
        data: 偏好值

    Returns:
        ResponseModel: 保存后的用户偏好设置
    """
    user_id = getattr(request.state, "user_id", None)

    if not user_id:
        return ResponseModel.error(code=401, message="未登录")

    with Session(engine) as session:
        # 查找是否已存在
        statement = select(UserPreference).where(
            and_(
                UserPreference.user_id == user_id,
                UserPreference.preference_key == key,
            )
        )
        preference = session.exec(statement).first()

        if preference:
            # 更新
            preference.preference_value = data.preference_value
            preference.updated_at = datetime.utcnow()
            logger.info(f"更新用户偏好: user_id={user_id}, key={key}")
        else:
            # 创建
            preference = UserPreference(
                user_id=user_id,
                preference_key=key,
                preference_value=data.preference_value,
            )
            logger.info(f"创建用户偏好: user_id={user_id}, key={key}")

        session.add(preference)
        session.commit()
        session.refresh(preference)

        return ResponseModel.success(
            data=UserPreferenceResponse(
                id=preference.id,
                user_id=preference.user_id,
                preference_key=preference.preference_key,
                preference_value=preference.preference_value,
                created_at=preference.created_at,
                updated_at=preference.updated_at,
            ),
            message="保存成功",
        )


@router.delete("/{key}", response_model=ResponseModel[None])
async def delete_preference(request: Request, key: str):
    """删除用户偏好设置

    Args:
        key: 偏好键名

    Returns:
        ResponseModel: 删除结果
    """
    user_id = getattr(request.state, "user_id", None)

    if not user_id:
        return ResponseModel.error(code=401, message="未登录")

    with Session(engine) as session:
        statement = select(UserPreference).where(
            and_(
                UserPreference.user_id == user_id,
                UserPreference.preference_key == key,
            )
        )
        preference = session.exec(statement).first()

        if not preference:
            return ResponseModel.error(code=404, message="偏好设置不存在")

        session.delete(preference)
        session.commit()

        logger.info(f"删除用户偏好: user_id={user_id}, key={key}")

        return ResponseModel.success(data=None, message="删除成功")
