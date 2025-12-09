"""AI 配置数据模型

用于存储 Kimi、DeepSeek 等 AI 服务的 API 密钥配置。
"""

from sqlmodel import Field, SQLModel

from app.models.analysis_result import AIProvider
from app.models.base import BaseTable

# 预设的提供商配置
PROVIDER_PRESETS = {
    AIProvider.KIMI: {
        "base_url": "https://api.moonshot.cn/v1",
        "models": ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k", "kimi-k2"],
    },
    AIProvider.DEEPSEEK: {
        "base_url": "https://api.deepseek.com",
        "models": ["deepseek-chat", "deepseek-reasoner"],
    },
}


class AIConfig(BaseTable, table=True):
    """AI 配置表

    存储 AI 服务的 API 密钥和相关配置。
    """

    __tablename__ = "ai_configs"

    provider: str = Field(index=True, description="AI 提供商: kimi/deepseek")
    name: str = Field(description="配置名称")
    api_key: str = Field(description="API 密钥")
    base_url: str = Field(description="API 基础 URL")
    default_model: str | None = Field(default=None, description="默认模型")
    is_active: bool = Field(default=True, description="是否启用")
    notes: str | None = Field(default=None, description="备注")


class AIConfigCreate(SQLModel):
    """创建 AI 配置"""

    provider: str
    name: str
    api_key: str
    base_url: str
    default_model: str | None = None
    is_active: bool = True
    notes: str | None = None


class AIConfigUpdate(SQLModel):
    """更新 AI 配置"""

    name: str | None = None
    api_key: str | None = None
    base_url: str | None = None
    default_model: str | None = None
    is_active: bool | None = None
    notes: str | None = None


class AIConfigResponse(SQLModel):
    """AI 配置响应"""

    id: int
    provider: str
    name: str
    api_key: str
    base_url: str
    default_model: str | None
    is_active: bool
    notes: str | None
    created_at: str
    updated_at: str

    @classmethod
    def from_model(cls, config: AIConfig) -> "AIConfigResponse":
        return cls(
            id=config.id,
            provider=config.provider,
            name=config.name,
            api_key=config.api_key,
            base_url=config.base_url,
            default_model=config.default_model,
            is_active=config.is_active,
            notes=config.notes,
            created_at=config.created_at.isoformat() if config.created_at else "",
            updated_at=config.updated_at.isoformat() if config.updated_at else "",
        )
