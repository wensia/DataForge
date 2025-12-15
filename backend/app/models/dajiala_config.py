"""极致了API配置数据模型

用于存储极致了服务的 API 密钥配置。
"""

from datetime import datetime

from sqlmodel import Field, SQLModel

from app.models.base import BaseTable


class DajialaConfig(BaseTable, table=True):
    """极致了API配置表

    存储极致了服务的 API 密钥和相关配置。
    """

    __tablename__ = "dajiala_configs"

    name: str = Field(description="配置名称")
    api_key: str = Field(description="API 密钥")
    verify_code: str | None = Field(default=None, description="附加码(可选)")
    test_biz: str | None = Field(default=None, description="测试用公众号 biz")
    is_active: bool = Field(default=True, description="是否启用")
    is_default: bool = Field(default=False, description="是否为默认配置")
    last_verified_at: datetime | None = Field(default=None, description="上次验证时间")
    remain_money: float | None = Field(default=None, description="剩余金额")
    notes: str | None = Field(default=None, description="备注")


class DajialaConfigCreate(SQLModel):
    """创建极致了API配置"""

    name: str
    api_key: str
    verify_code: str | None = None
    test_biz: str | None = None
    is_active: bool = True
    is_default: bool = False
    notes: str | None = None


class DajialaConfigUpdate(SQLModel):
    """更新极致了API配置"""

    name: str | None = None
    api_key: str | None = None
    verify_code: str | None = None
    test_biz: str | None = None
    is_active: bool | None = None
    is_default: bool | None = None
    notes: str | None = None


class DajialaConfigResponse(SQLModel):
    """极致了API配置响应"""

    id: int
    name: str
    api_key_masked: str
    verify_code_masked: str | None
    test_biz: str | None
    is_active: bool
    is_default: bool
    last_verified_at: str | None
    remain_money: float | None
    notes: str | None
    created_at: str
    updated_at: str

    @staticmethod
    def mask_key(key: str | None) -> str | None:
        """脱敏密钥，只显示前 4 位和后 4 位"""
        if not key:
            return None
        if len(key) <= 8:
            return key[:2] + "****"
        return key[:4] + "****" + key[-4:]

    @classmethod
    def from_model(cls, config: "DajialaConfig") -> "DajialaConfigResponse":
        return cls(
            id=config.id,
            name=config.name,
            api_key_masked=cls.mask_key(config.api_key) or "",
            verify_code_masked=cls.mask_key(config.verify_code),
            test_biz=config.test_biz,
            is_active=config.is_active,
            is_default=config.is_default,
            last_verified_at=(
                config.last_verified_at.isoformat() if config.last_verified_at else None
            ),
            remain_money=config.remain_money,
            notes=config.notes,
            created_at=config.created_at.isoformat() if config.created_at else "",
            updated_at=config.updated_at.isoformat() if config.updated_at else "",
        )
