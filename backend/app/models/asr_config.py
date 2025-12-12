"""ASR 语音识别配置数据模型

用于存储腾讯云、阿里云、火山引擎等 ASR 服务的 API 密钥配置。
"""

from datetime import datetime
from enum import Enum

from sqlmodel import Field, SQLModel

from app.models.base import BaseTable


class ASRProvider(str, Enum):
    """ASR 提供商"""

    TENCENT = "tencent"  # 腾讯云 ASR
    ALIBABA = "alibaba"  # 阿里云智能语音
    VOLCENGINE = "volcengine"  # 火山引擎


# 提供商预设配置
ASR_PROVIDER_PRESETS = {
    ASRProvider.TENCENT: {
        "name": "腾讯云 ASR",
        "fields": [
            {"key": "secret_id", "label": "SecretId", "required": True},
            {"key": "secret_key", "label": "SecretKey", "required": True},
            {"key": "app_id", "label": "AppId", "required": False, "hint": "实时语音识别需要，录音文件识别可不填"},
        ],
        "doc_url": "https://cloud.tencent.com/document/product/1093/37823",
    },
    ASRProvider.ALIBABA: {
        "name": "阿里云智能语音",
        "fields": [
            {"key": "access_key_id", "label": "AccessKey ID", "required": True},
            {"key": "access_key_secret", "label": "AccessKey Secret", "required": True},
            {"key": "app_key", "label": "AppKey", "required": True},
        ],
        "doc_url": "https://help.aliyun.com/zh/isi/getting-started/start-here",
    },
    ASRProvider.VOLCENGINE: {
        "name": "火山引擎 ASR",
        "fields": [
            {"key": "app_id", "label": "App ID", "required": True},
            {"key": "access_token", "label": "Access Token", "required": True},
            {"key": "secret_key", "label": "Secret Key", "required": False, "hint": "部分接口可能需要"},
            {
                "key": "cluster",
                "label": "Cluster",
                "required": False,
                "default": "volc.bigasr.auc",
                "hint": "录音文件识别: volc.bigasr.auc 或 volc.seedasr.auc",
            },
            {
                "key": "qps",
                "label": "QPS",
                "required": False,
                "default": "20",
                "hint": "每秒请求数限制，默认 20",
            },
        ],
        "doc_url": "https://www.volcengine.com/docs/6561/1354868",
    },
}


class ASRConfig(BaseTable, table=True):
    """ASR 配置表

    存储 ASR 服务的 API 密钥和相关配置。
    """

    __tablename__ = "asr_configs"

    provider: str = Field(
        index=True, description="ASR 提供商: tencent/alibaba/volcengine"
    )
    name: str = Field(description="配置名称")
    credentials: str = Field(description="JSON 格式的密钥信息")
    is_active: bool = Field(default=True, description="是否启用")
    is_default: bool = Field(default=False, description="是否为默认配置")
    last_verified_at: datetime | None = Field(default=None, description="上次验证时间")
    notes: str | None = Field(default=None, description="备注")


class ASRConfigCreate(SQLModel):
    """创建 ASR 配置"""

    provider: str
    name: str
    credentials: dict  # 前端传 dict，后端序列化为 JSON 字符串
    is_active: bool = True
    is_default: bool = False
    notes: str | None = None


class ASRConfigUpdate(SQLModel):
    """更新 ASR 配置"""

    name: str | None = None
    credentials: dict | None = None
    is_active: bool | None = None
    is_default: bool | None = None
    notes: str | None = None


class ASRConfigResponse(SQLModel):
    """ASR 配置响应"""

    id: int
    provider: str
    name: str
    credentials: dict  # 返回时解析为 dict
    is_active: bool
    is_default: bool
    last_verified_at: str | None
    notes: str | None
    created_at: str
    updated_at: str

    @classmethod
    def from_model(cls, config: ASRConfig) -> "ASRConfigResponse":
        import json

        return cls(
            id=config.id,
            provider=config.provider,
            name=config.name,
            credentials=json.loads(config.credentials) if config.credentials else {},
            is_active=config.is_active,
            is_default=config.is_default,
            last_verified_at=(
                config.last_verified_at.isoformat() if config.last_verified_at else None
            ),
            notes=config.notes,
            created_at=config.created_at.isoformat() if config.created_at else "",
            updated_at=config.updated_at.isoformat() if config.updated_at else "",
        )
