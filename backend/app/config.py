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

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()




