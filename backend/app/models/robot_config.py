"""机器人配置数据模型

支持钉钉和飞书机器人的 Webhook 和密钥配置。
"""

from enum import Enum

from sqlmodel import Field, SQLModel

from app.models.base import BaseTable


class RobotPlatform(str, Enum):
    """机器人平台类型"""

    DINGTALK = "dingtalk"
    FEISHU = "feishu"


class RobotConfig(BaseTable, table=True):
    """机器人配置表

    存储钉钉/飞书机器人的 Webhook URL 和签名密钥。
    """

    __tablename__ = "robot_configs"

    platform: str = Field(default=RobotPlatform.DINGTALK.value, description="平台类型")
    name: str = Field(description="配置名称")
    webhook_url: str = Field(description="Webhook URL")
    secret: str = Field(description="签名密钥")
    is_active: bool = Field(default=True, description="是否启用")
    is_verified: bool = Field(default=False, description="是否已验证")
    notes: str | None = Field(default=None, description="备注")


class RobotConfigCreate(SQLModel):
    """创建机器人配置"""

    platform: str = RobotPlatform.DINGTALK.value
    name: str
    webhook_url: str
    secret: str
    is_active: bool = True
    notes: str | None = None


class RobotConfigUpdate(SQLModel):
    """更新机器人配置"""

    platform: str | None = None
    name: str | None = None
    webhook_url: str | None = None
    secret: str | None = None
    is_active: bool | None = None
    notes: str | None = None


class RobotConfigResponse(SQLModel):
    """机器人配置响应"""

    id: int
    platform: str
    name: str
    webhook_url_masked: str  # 脱敏后的 Webhook URL
    secret_masked: str  # 脱敏后的密钥
    is_active: bool
    is_verified: bool
    notes: str | None
    created_at: str
    updated_at: str

    @staticmethod
    def mask_url(url: str) -> str:
        """脱敏 Webhook URL，只显示前 40 位和后 10 位"""
        if not url or len(url) <= 50:
            return url[:20] + "****" if url else ""
        return url[:40] + "****" + url[-10:]

    @staticmethod
    def mask_secret(secret: str) -> str:
        """脱敏密钥，只显示前 6 位和后 4 位"""
        if not secret or len(secret) <= 10:
            return secret[:3] + "****" if secret else ""
        return secret[:6] + "****" + secret[-4:]

    @classmethod
    def from_model(cls, config: "RobotConfig") -> "RobotConfigResponse":
        return cls(
            id=config.id,
            platform=config.platform,
            name=config.name,
            webhook_url_masked=cls.mask_url(config.webhook_url),
            secret_masked=cls.mask_secret(config.secret),
            is_active=config.is_active,
            is_verified=config.is_verified,
            notes=config.notes,
            created_at=config.created_at.isoformat() if config.created_at else "",
            updated_at=config.updated_at.isoformat() if config.updated_at else "",
        )


class RobotTestRequest(SQLModel):
    """机器人测试请求"""

    platform: str = RobotPlatform.DINGTALK.value
    webhook_url: str
    secret: str
    message: str = "DataForge 机器人配置测试消息"
