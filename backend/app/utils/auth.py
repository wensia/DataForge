"""API密钥验证工具"""

import json
import secrets
from datetime import datetime

from loguru import logger
from sqlmodel import Session, select

from app.config import settings
from app.database import engine
from app.models.api_key import ApiKey
from app.utils.redis_client import get_redis_client


class APIKeyValidator:
    """API密钥验证器

    提供安全的API密钥验证功能,包括:
    - Redis 缓存验证结果（减少数据库查询）
    - 从数据库验证密钥
    - 密钥过期检查
    - 异步使用统计更新
    - 审计日志记录(脱敏处理)
    """

    CACHE_KEY_PREFIX = "apikey:"  # Redis 缓存键前缀
    USAGE_KEY_PREFIX = "apikey_usage:"  # 使用统计缓存键前缀

    def __init__(self):
        """初始化验证器"""
        pass

    def _get_cache_key(self, api_key: str) -> str:
        """生成缓存键"""
        return f"{self.CACHE_KEY_PREFIX}{api_key[:8]}"  # 只用前8字符作为键

    def _get_from_cache(
        self, api_key: str
    ) -> tuple[bool, str | None, dict | None] | None:
        """从 Redis 缓存获取验证结果"""
        redis_client = get_redis_client()
        if not redis_client:
            return None

        try:
            cache_key = self._get_cache_key(api_key)
            cached = redis_client.get(cache_key)
            if cached:
                data = json.loads(cached)
                # 验证缓存中的密钥是否匹配（防止哈希冲突）
                if data.get("_key") == api_key:
                    return data["is_valid"], data.get("error"), data.get("metadata")
        except Exception as e:
            logger.warning(f"Redis 缓存读取失败: {e}")
        return None

    def _set_cache(
        self,
        api_key: str,
        is_valid: bool,
        error: str | None,
        metadata: dict | None,
    ) -> None:
        """将验证结果写入 Redis 缓存"""
        redis_client = get_redis_client()
        if not redis_client:
            return

        try:
            cache_key = self._get_cache_key(api_key)
            data = {
                "_key": api_key,  # 存储完整密钥用于验证
                "is_valid": is_valid,
                "error": error,
                "metadata": metadata,
            }
            redis_client.setex(
                cache_key,
                settings.api_key_cache_ttl,
                json.dumps(data),
            )
        except Exception as e:
            logger.warning(f"Redis 缓存写入失败: {e}")

    def _record_usage_async(self, api_key: str) -> None:
        """异步记录使用统计（使用 Redis INCR）"""
        redis_client = get_redis_client()
        if not redis_client:
            return

        try:
            usage_key = f"{self.USAGE_KEY_PREFIX}{api_key[:8]}"
            redis_client.incr(usage_key)
            # 设置过期时间，定时任务会处理刷新到数据库
            redis_client.expire(usage_key, 3600)  # 1小时过期
        except Exception as e:
            logger.warning(f"Redis 使用统计记录失败: {e}")

    def validate(
        self, api_key: str | None
    ) -> tuple[bool, str | None, dict[str, str] | None]:
        """验证API密钥

        Args:
            api_key: 待验证的API密钥

        Returns:
            tuple[bool, Optional[str], Optional[dict]]: (是否有效, 错误信息, 密钥元数据)
        """
        # 检查是否提供密钥
        if not api_key:
            return False, "缺少API密钥,请在URL中添加api_key参数", None

        # 1. 先查 Redis 缓存
        cached = self._get_from_cache(api_key)
        if cached is not None:
            is_valid, error, metadata = cached
            if is_valid:
                # 异步记录使用统计
                self._record_usage_async(api_key)
            return is_valid, error, metadata

        # 2. 缓存未命中，查数据库
        result = self._validate_from_db(api_key)

        # 3. 写入缓存（有效密钥缓存较长时间，无效密钥缓存较短时间）
        is_valid, error, metadata = result
        self._set_cache(api_key, is_valid, error, metadata)

        return result

    def _validate_from_db(
        self, api_key: str
    ) -> tuple[bool, str | None, dict[str, str] | None]:
        """从数据库验证密钥（不更新使用统计）"""
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

                # 返回元数据（不再同步更新使用统计）
                metadata = {
                    "key_id": str(db_key.id),
                    "client_id": f"key_{db_key.id}",
                    "name": db_key.name,
                    "created_at": db_key.created_at.isoformat(),
                    "key_type": "client",  # 标记为客户端密钥
                }
                return True, None, metadata

        # 密钥无效
        return False, "无效的API密钥", None

    def invalidate_cache(self, api_key: str) -> None:
        """使密钥缓存失效（当密钥被修改或删除时调用）"""
        redis_client = get_redis_client()
        if redis_client:
            try:
                cache_key = self._get_cache_key(api_key)
                redis_client.delete(cache_key)
            except Exception as e:
                logger.warning(f"Redis 缓存删除失败: {e}")

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
        api_key: str | None,
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
