"""应用配置管理"""

from pydantic_settings import BaseSettings, SettingsConfigDict


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
    celery_worker_soft_shutdown_timeout: float = 30.0  # 软关闭超时（秒）

    # Celery Redis 配置（重要！防止长任务被重复投递）
    # 参考: https://github.com/celery/celery/issues/5935
    # 生产环境推荐值，必须大于 task_timeout × 2
    celery_broker_visibility_timeout: int = 36000  # 10小时

    # Celery 任务超时配置
    # ASR 批量任务可能需要处理一个月的数据，需要更长时间
    celery_task_default_timeout: int = 14400  # 4小时

    # Celery 任务重试配置
    celery_task_default_max_retries: int = 3  # 默认最大重试次数
    celery_task_retry_delay: int = 60  # 重试延迟基础值（秒）
    celery_task_retry_backoff: bool = True  # 指数退避
    celery_task_retry_jitter: bool = True  # 随机抖动

    # Celery Worker 配置
    celery_worker_concurrency: int = 100  # gevent 并发数
    celery_worker_prefetch_multiplier: int = 1  # 预取数量

    # Celery 任务结果配置
    celery_result_expires: int = 3600  # 结果过期时间（秒）

    # 任务配置
    timezone: str = "Asia/Shanghai"
    max_execution_history_days: int = 30  # 执行历史保留天数
    scheduler_log_buffer_max_lines: int = 20000  # 单次执行内存日志上限
    scheduler_log_publish_interval: float = 0.1  # 日志发布间隔（秒）

    # 脚本文件夹配置
    scripts_path: str = "scripts"  # 任务脚本文件夹路径（相对于 backend 目录）

    # JWT 配置
    jwt_secret_key: str = "yunke-transit-secret-key-change-in-production"
    jwt_expire_hours: int = 24  # Token 过期时间(小时)

    # AI 服务配置
    kimi_api_key: str = ""  # Kimi (月之暗面) API 密钥
    deepseek_api_key: str = ""  # DeepSeek API 密钥
    default_ai_provider: str = "kimi"  # 默认 AI 服务: kimi / deepseek / doubao
    doubao_api_key: str = ""  # 豆包 (火山引擎) API 密钥
    doubao_endpoint_id: str = ""  # 豆包 Endpoint ID (ep-2024...)

    # Redis 配置
    redis_url: str = ""  # Redis 连接 URL
    api_key_cache_ttl: int = 300  # API 密钥缓存过期时间(秒)
    record_cache_ttl: int = 180  # 录音缓存过期时间(秒)

    # CRM Open API 配置
    crm_base_url: str = ""  # CRM 系统 Open API 基础地址
    crm_service_key: str = ""  # CRM 服务端 API Key

    # 文件上传配置
    uploads_dir: str = "uploads"  # 上传文件目录（相对于 backend 目录）

    @property
    def celery_broker(self) -> str:
        """获取 Celery broker URL"""
        return self.celery_broker_url or self.redis_url

    @property
    def celery_backend(self) -> str:
        """获取 Celery result backend URL"""
        return self.celery_result_backend or self.redis_url

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",  # 忽略额外的环境变量
    )


settings = Settings()
