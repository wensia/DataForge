"""应用配置管理"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """应用配置"""

    # 应用配置
    app_name: str = "云客中转"
    app_version: str = "0.1.0"
    debug: bool = True

    # 数据库配置
    database_url: str = "sqlite:///./app.db"

    # API 配置
    api_prefix: str = "/api/v1"

    # 安全审计日志配置
    enable_security_audit: bool = True
    security_log_file: str = "logs/security.log"

    # Celery 配置
    celery_broker_url: str = ""  # 默认使用 redis_url
    celery_result_backend: str = ""  # 默认使用 redis_url
    celery_task_serializer: str = "json"
    celery_result_serializer: str = "json"
    celery_timezone: str = "Asia/Shanghai"
    celery_task_track_started: bool = True
    celery_beat_sync_every: int = 60  # Beat 从数据库同步任务的间隔（秒）

    # 任务配置
    timezone: str = "Asia/Shanghai"
    max_execution_history_days: int = 30  # 执行历史保留天数
    scheduler_log_buffer_max_lines: int = 20000  # 单次执行内存日志上限

    # 脚本文件夹配置
    scripts_path: str = "scripts"  # 任务脚本文件夹路径（相对于 backend 目录）

    # JWT 配置
    jwt_secret_key: str = "yunke-transit-secret-key-change-in-production"
    jwt_expire_hours: int = 24  # Token 过期时间(小时)

    # AI 服务配置
    kimi_api_key: str = ""  # Kimi (月之暗面) API 密钥
    deepseek_api_key: str = ""  # DeepSeek API 密钥
    default_ai_provider: str = "kimi"  # 默认 AI 服务: kimi / deepseek

    # Redis 配置
    redis_url: str = ""  # Redis 连接 URL
    api_key_cache_ttl: int = 300  # API 密钥缓存过期时间(秒)
    record_cache_ttl: int = 180  # 录音缓存过期时间(秒)

    @property
    def celery_broker(self) -> str:
        """获取 Celery broker URL"""
        return self.celery_broker_url or self.redis_url

    @property
    def celery_backend(self) -> str:
        """获取 Celery result backend URL"""
        return self.celery_result_backend or self.redis_url

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"  # 忽略额外的环境变量


settings = Settings()
