"""API密钥验证工具"""

import secrets
from datetime import datetime
from typing import Optional

from loguru import logger
from sqlmodel import Session, select

from app.config import settings
from app.database import engine
from app.models.api_key import ApiKey


class APIKeyValidator:
    """API密钥验证器

    提供安全的API密钥验证功能,包括:
    - 从数据库验证密钥
    - 密钥过期检查
    - 使用统计记录
    - 审计日志记录(脱敏处理)
    """

    def __init__(self):
        """初始化验证器"""
        # 兼容模式: 如果配置了环境变量中的密钥,也支持验证
        self.legacy_keys = settings.get_api_keys_list()
        if self.legacy_keys:
            logger.warning(
                f"检测到环境变量中配置了 {len(self.legacy_keys)} 个密钥, "
                "建议迁移到数据库管理"
            )

    def validate(
        self, api_key: Optional[str]
    ) -> tuple[bool, Optional[str], Optional[dict[str, str]]]:
        """验证API密钥

        Args:
            api_key: 待验证的API密钥

        Returns:
            tuple[bool, Optional[str], Optional[dict]]: (是否有效, 错误信息, 密钥元数据)
        """
        # 检查是否提供密钥
        if not api_key:
            return False, "缺少API密钥,请在URL中添加api_key参数", None

        # 1. 优先从数据库验证
        with Session(engine) as session:
            statement = select(ApiKey).where(ApiKey.key == api_key)
            db_key = session.exec(statement).first()

            if db_key:
                # 检查密钥是否启用
                if not db_key.is_active:
                    return False, "API密钥已被禁用", None

                # 检查是否过期
                if db_key.expires_at and db_key.expires_at < datetime.utcnow():
                    return False, "API密钥已过期", None

                # 更新使用统计
                db_key.usage_count += 1
                db_key.last_used_at = datetime.utcnow()
                session.add(db_key)
                session.commit()

                # 返回元数据
                metadata = {
                    "key_id": str(db_key.id),
                    "client_id": f"key_{db_key.id}",
                    "name": db_key.name,
                    "created_at": db_key.created_at.isoformat(),
                    "key_type": "client",  # 标记为客户端密钥
                }
                return True, None, metadata

        # 2. 兼容模式: 检查环境变量中的密钥(遗留支持)
        if api_key in self.legacy_keys:
            logger.warning(
                f"使用了环境变量中的密钥, 建议迁移到数据库管理: {self.get_masked_key(api_key)}"
            )
            idx = self.legacy_keys.index(api_key)
            metadata = {
                "client_id": f"admin_{idx + 1}",
                "name": f"管理员密钥 {idx + 1}",
                "created_at": datetime.utcnow().isoformat(),
                "key_type": "admin",  # 标记为管理员密钥
            }
            return True, None, metadata

        # 密钥无效
        return False, "无效的API密钥", None

    def get_masked_key(self, api_key: str) -> str:
        """获取脱敏后的密钥(用于日志记录)

        Args:
            api_key: 原始密钥

        Returns:
            str: 脱敏密钥(前4位+***+后4位)
        """
        if len(api_key) <= 8:
            return "***"
        return f"{api_key[:4]}...{api_key[-4:]}"

    def log_validation_attempt(
        self,
        api_key: Optional[str],
        is_valid: bool,
        request_info: dict[str, str],
    ):
        """记录验证尝试(用于安全审计)

        Args:
            api_key: API密钥
            is_valid: 验证是否成功
            request_info: 请求信息(IP、路径等)
        """
        if not settings.enable_security_audit:
            return

        masked_key = self.get_masked_key(api_key) if api_key else "None"
        client_id = request_info.get("client_id", "unknown")
        ip = request_info.get("ip", "unknown")
        path = request_info.get("path", "unknown")
        method = request_info.get("method", "unknown")

        if is_valid:
            logger.info(
                f"API密钥验证成功 | "
                f"客户端: {client_id} | "
                f"IP: {ip} | "
                f"方法: {method} | "
                f"路径: {path} | "
                f"密钥: {masked_key}"
            )
        else:
            logger.warning(
                f"API密钥验证失败 | "
                f"IP: {ip} | "
                f"方法: {method} | "
                f"路径: {path} | "
                f"密钥: {masked_key} | "
                f"时间: {datetime.utcnow().isoformat()}"
            )


# 全局验证器实例
api_key_validator = APIKeyValidator()


def generate_api_key(prefix: str = "yk_") -> str:
    """生成随机API密钥

    Args:
        prefix: 密钥前缀

    Returns:
        str: 生成的API密钥
    """
    random_part = secrets.token_urlsafe(32)
    return f"{prefix}{random_part}"
