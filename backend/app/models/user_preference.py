"""用户偏好设置模型"""

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class UserPreference(SQLModel, table=True):
    """用户偏好设置模型"""

    __tablename__ = "user_preferences"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, description="用户ID")
    preference_key: str = Field(index=True, description="偏好键名")
    preference_value: str = Field(description="偏好值(JSON格式)")

    created_at: datetime = Field(default_factory=datetime.utcnow, description="创建时间")
    updated_at: datetime = Field(default_factory=datetime.utcnow, description="更新时间")

    class Config:
        # 创建复合唯一索引
        table_args = {"sqlite_autoincrement": True}


class UserPreferenceCreate(SQLModel):
    """创建用户偏好请求模型"""

    preference_key: str = Field(description="偏好键名")
    preference_value: str = Field(description="偏好值(JSON格式)")


class UserPreferenceUpdate(SQLModel):
    """更新用户偏好请求模型"""

    preference_value: str = Field(description="偏好值(JSON格式)")


class UserPreferenceResponse(SQLModel):
    """用户偏好响应模型"""

    id: int
    user_id: int
    preference_key: str
    preference_value: str
    created_at: datetime
    updated_at: datetime
