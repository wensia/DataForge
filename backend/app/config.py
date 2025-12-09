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

    # API密钥配置
    api_keys: str = ""  # 从环境变量加载,逗号分隔多个密钥

    # 安全审计日志配置
    enable_security_audit: bool = True
    security_log_file: str = "logs/security.log"

    # 调度器配置
    scheduler_enabled: bool = True
    timezone: str = "Asia/Shanghai"
    max_execution_history_days: int = 30  # 执行历史保留天数

    # 脚本文件夹配置
    scripts_path: str = "scripts"  # 任务脚本文件夹路径（相对于 backend 目录）

    # JWT 配置
    jwt_secret_key: str = "yunke-transit-secret-key-change-in-production"
    jwt_expire_hours: int = 24  # Token 过期时间(小时)

    # AI 服务配置
    kimi_api_key: str = ""  # Kimi (月之暗面) API 密钥
    deepseek_api_key: str = ""  # DeepSeek API 密钥
    default_ai_provider: str = "kimi"  # 默认 AI 服务: kimi / deepseek

    def get_api_keys_list(self) -> list[str]:
        """获取API密钥列表

        Returns:
            list[str]: API密钥列表
        """
        if not self.api_keys:
            return []
        return [key.strip() for key in self.api_keys.split(",") if key.strip()]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"  # 忽略额外的环境变量


settings = Settings()






