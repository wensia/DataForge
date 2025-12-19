"""Celery 任务基类

提供带分布式锁、自动重试和执行记录的任务基类。

核心设计：
1. 使用 Celery 原生的 Task 基类方法（before_start/after_return）
2. 分布式锁通过 Redis 实现，锁 key 基于任务名称
3. 使用 Celery signals 管理执行记录，而非包装层
4. 支持任务独立于 ScheduledTask 表直接调用

参考文档:
- https://docs.celeryq.dev/en/stable/userguide/tasks.html#custom-task-classes
- https://docs.celeryq.dev/en/stable/userguide/tasks.html#retrying
"""

from datetime import datetime
from typing import Any

from celery import Task
from celery.exceptions import Reject
from loguru import logger

from app.config import settings
from app.utils.task_lock import acquire_task_lock, extend_task_lock, release_task_lock


# ============================================================================
# 参数类型转换工具
# ============================================================================


def convert_value(value: Any, target_type: str) -> Any:
    """转换单个值到目标类型

    Args:
        value: 原始值
        target_type: 目标类型 (int, bool, float, str)

    Returns:
        转换后的值
    """
    if value is None:
        return None

    if target_type == "int":
        if isinstance(value, int):
            return value
        if isinstance(value, str) and value.strip():
            try:
                return int(value)
            except ValueError:
                return 0
        return 0
    elif target_type == "bool":
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.lower() in ("true", "1", "yes")
        return bool(value)
    elif target_type == "float":
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str) and value.strip():
            try:
                return float(value)
            except ValueError:
                return 0.0
        return 0.0
    else:
        # 默认返回字符串
        return str(value) if value is not None else ""


def auto_convert_value(value: Any) -> Any:
    """自动检测并转换字符串值到合适的类型

    用于未在 REGISTERED_TASKS 中注册的参数。
    尝试将字符串转换为 int、float 或 bool。

    Args:
        value: 原始值

    Returns:
        转换后的值
    """
    if not isinstance(value, str):
        return value

    stripped = value.strip()
    if not stripped:
        return value

    # 尝试转换为布尔值
    if stripped.lower() in ("true", "false"):
        return stripped.lower() == "true"

    # 尝试转换为整数
    try:
        return int(stripped)
    except ValueError:
        pass

    # 尝试转换为浮点数
    try:
        return float(stripped)
    except ValueError:
        pass

    return value


def coerce_task_params(task_name: str, kwargs: dict[str, Any]) -> dict[str, Any]:
    """根据任务注册信息转换参数类型

    从 REGISTERED_TASKS 获取参数元数据，将 kwargs 中的值转换为正确的类型。
    这确保从 JSON 反序列化的字符串参数能正确转换为 int/bool 等类型。

    对于未注册的参数，会自动检测并转换看起来像数字或布尔值的字符串。

    Args:
        task_name: Celery 任务名称
        kwargs: 原始关键字参数

    Returns:
        类型转换后的参数字典
    """
    # 延迟导入避免循环依赖
    try:
        from app.tasks import REGISTERED_TASKS
    except ImportError:
        logger.warning("无法导入 REGISTERED_TASKS，跳过参数类型转换")
        return kwargs

    task_info = REGISTERED_TASKS.get(task_name)
    params_meta = {}
    if task_info:
        params_meta = {p["name"]: p for p in task_info.get("params", [])}

    result = {}
    for key, value in kwargs.items():
        original_value = value
        if key in params_meta:
            # 已注册参数：按指定类型转换
            param_type = params_meta[key].get("type", "str")
            result[key] = convert_value(value, param_type)
        else:
            # 未注册参数：自动检测类型并转换
            result[key] = auto_convert_value(value)

        # 仅在类型实际改变时记录日志
        if type(original_value) != type(result[key]):
            logger.debug(
                f"参数类型转换: {key}={original_value!r} ({type(original_value).__name__}) "
                f"-> {result[key]!r} ({type(result[key]).__name__})"
            )

    return result


class TaskSkipped(Exception):
    """任务被跳过（锁未获取等情况）"""

    pass


class DataForgeTask(Task):
    """DataForge 通用任务基类

    特性：
    1. 自动获取/释放分布式锁
    2. 可配置的自动重试策略
    3. 执行时间和状态跟踪
    4. 优雅的错误处理

    使用示例:
        @celery_app.task(
            base=DataForgeTask,
            name="dataforge.sync_accounts",
            bind=True,
        )
        def sync_accounts(self, account_id: int = None):
            # 任务逻辑
            return {"synced": 1}
    """

    # ============================================================================
    # 重试配置（子类可覆盖）
    # ============================================================================

    # 自动重试的异常类型
    autoretry_for = (ConnectionError, TimeoutError, OSError)

    # 重试退避策略
    retry_backoff = True  # 指数退避
    retry_backoff_max = 600  # 最大退避时间 10 分钟
    retry_jitter = True  # 添加随机抖动

    # 最大重试次数
    max_retries = settings.celery_task_default_max_retries

    # 任务确认模式
    acks_late = True  # 任务完成后才确认
    reject_on_worker_lost = True  # Worker 丢失时重新入队

    # ============================================================================
    # 分布式锁配置
    # ============================================================================

    # 是否启用分布式锁（默认启用）
    use_lock = True

    # 锁超时时间（秒）
    lock_timeout = settings.celery_task_default_timeout

    # 锁键前缀
    lock_key_prefix = "task_lock"

    # ============================================================================
    # 内部状态
    # ============================================================================

    # 当前任务是否持有锁
    _lock_acquired = False

    # 锁的 Redis key
    _lock_key = None

    # 任务开始时间
    _start_time = None

    # ============================================================================
    # 核心执行方法
    # ============================================================================

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        """执行任务前进行参数类型转换

        确保从 JSON 反序列化的参数（如字符串 "100"）转换为正确的类型（int 100）。
        这解决了 JSON 序列化导致的类型丢失问题。
        """
        kwargs = coerce_task_params(self.name, kwargs)
        return super().__call__(*args, **kwargs)

    # ============================================================================
    # 生命周期方法
    # ============================================================================

    def before_start(
        self, task_id: str, args: tuple, kwargs: dict[str, Any]
    ) -> None:
        """任务开始前的钩子

        1. 尝试获取分布式锁
        2. 记录开始时间

        Args:
            task_id: Celery 任务 ID
            args: 位置参数
            kwargs: 关键字参数

        Raises:
            Reject: 获取锁失败时拒绝任务（会重新入队）
        """
        self._start_time = datetime.now()
        self._lock_acquired = False
        self._lock_key = None

        # 如果不使用锁，直接返回
        if not self.use_lock:
            logger.debug(f"任务 {self.name} 不使用分布式锁")
            return

        # 构造锁 key
        # 基于任务名称，确保同名任务互斥
        self._lock_key = f"{self.lock_key_prefix}:{self.name}"

        # 如果 kwargs 中包含 scheduled_task_id，使用更精细的锁
        # 这允许同一任务类型的不同配置并行执行
        scheduled_task_id = kwargs.get("scheduled_task_id")
        if scheduled_task_id:
            self._lock_key = f"{self.lock_key_prefix}:{scheduled_task_id}"

        # 尝试获取锁
        self._lock_acquired = acquire_task_lock(self._lock_key, self.lock_timeout)

        if not self._lock_acquired:
            logger.info(f"任务 {self.name} 无法获取锁 {self._lock_key}，跳过执行")
            # 使用 Reject 拒绝任务，不重新入队
            raise Reject(f"任务正在执行中: {self._lock_key}", requeue=False)

        logger.debug(f"任务 {self.name} 获取锁成功: {self._lock_key}")

    def after_return(
        self,
        status: str,
        retval: Any,
        task_id: str,
        args: tuple,
        kwargs: dict[str, Any],
        einfo: Any,
    ) -> None:
        """任务返回后的钩子

        无论成功、失败还是重试，都会调用此方法。
        负责释放锁和记录执行时间。

        Args:
            status: 任务状态 (SUCCESS, FAILURE, RETRY, etc.)
            retval: 返回值（失败时为异常）
            task_id: Celery 任务 ID
            args: 位置参数
            kwargs: 关键字参数
            einfo: 异常信息
        """
        # 计算执行时间
        duration = None
        if self._start_time:
            duration = (datetime.now() - self._start_time).total_seconds()

        # 释放锁
        if self._lock_acquired and self._lock_key:
            release_task_lock(self._lock_key)
            logger.debug(f"任务 {self.name} 释放锁: {self._lock_key}")

        # 记录执行结果
        if status == "SUCCESS":
            logger.info(
                f"任务 {self.name} 执行成功, 耗时 {duration:.2f}s"
                if duration
                else f"任务 {self.name} 执行成功"
            )
        elif status == "FAILURE":
            logger.error(
                f"任务 {self.name} 执行失败: {retval}, 耗时 {duration:.2f}s"
                if duration
                else f"任务 {self.name} 执行失败: {retval}"
            )
        elif status == "RETRY":
            logger.warning(f"任务 {self.name} 将重试: {retval}")

        # 重置状态
        self._lock_acquired = False
        self._lock_key = None
        self._start_time = None

    def on_retry(
        self,
        exc: Exception,
        task_id: str,
        args: tuple,
        kwargs: dict[str, Any],
        einfo: Any,
    ) -> None:
        """任务重试时的回调

        在重试前释放锁，让重试的任务可以重新获取。
        """
        logger.warning(
            f"任务 {self.name} 将重试 ({self.request.retries}/{self.max_retries}): "
            f"{exc.__class__.__name__}: {exc}"
        )

        # 重试前释放锁
        if self._lock_acquired and self._lock_key:
            release_task_lock(self._lock_key)
            self._lock_acquired = False
            logger.debug(f"任务 {self.name} 重试前释放锁: {self._lock_key}")

    def on_failure(
        self,
        exc: Exception,
        task_id: str,
        args: tuple,
        kwargs: dict[str, Any],
        einfo: Any,
    ) -> None:
        """任务最终失败时的回调（重试耗尽后）"""
        logger.error(
            f"任务 {self.name} 最终失败 (重试 {self.request.retries} 次后): "
            f"{exc.__class__.__name__}: {exc}"
        )

    # ============================================================================
    # 工具方法
    # ============================================================================

    def extend_lock(self, timeout: int | None = None) -> bool:
        """延长锁的过期时间

        用于长时间运行的任务定期续期。

        Args:
            timeout: 新的过期时间（秒），默认使用 lock_timeout

        Returns:
            bool: 是否成功延期
        """
        if not self._lock_key:
            return False

        timeout = timeout or self.lock_timeout
        result = extend_task_lock(self._lock_key, timeout)

        if result:
            logger.debug(f"任务 {self.name} 锁已续期: {self._lock_key}, TTL={timeout}s")
        else:
            logger.warning(f"任务 {self.name} 锁续期失败: {self._lock_key}")

        return result

    @property
    def lock_key(self) -> str | None:
        """获取当前锁的 key"""
        return self._lock_key

    @property
    def elapsed_time(self) -> float | None:
        """获取已执行时间（秒）"""
        if self._start_time:
            return (datetime.now() - self._start_time).total_seconds()
        return None


class DataForgeTaskNoLock(DataForgeTask):
    """不使用分布式锁的任务基类

    用于允许并发执行的任务，例如：
    - 幂等的查询任务
    - 不会产生资源竞争的任务
    """

    use_lock = False
