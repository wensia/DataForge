"""自定义 Celery Beat 调度器

从 ScheduledTask 数据库表动态加载调度配置，支持：
- 动态添加/修改/删除任务
- CRON、INTERVAL、DATE 三种调度类型
- 与现有数据模型完全兼容

时区修复说明：
当 TZ 环境变量设置为 Asia/Shanghai 时，Python 的 ZoneInfo('UTC') 会返回错误的
偏移量（+08:00 而非 +00:00）。这导致 Celery 的 schedule.now() 返回错误的时间，
从而导致任务调度计算错误。我们通过自定义 schedule 类重写 now() 方法来修复此问题。
"""

import json
import time
from datetime import datetime, timedelta, timezone as datetime_timezone
from typing import Any

from celery import current_app
from celery.beat import ScheduleEntry, Scheduler
from celery.schedules import crontab, schedule
from loguru import logger
from sqlmodel import Session, select

from app.config import settings
from app.database import engine
from app.models.task import ScheduledTask, TaskStatus, TaskType


# ============================================================================
# 时区修复：自定义 schedule 类
# ============================================================================


class FixedTimezoneSchedule(schedule):
    """修复时区问题的 schedule 类

    问题：当 TZ=Asia/Shanghai 时，ZoneInfo('UTC') 返回错误的偏移量，
    导致 Celery 的 schedule.now() 返回 UTC 时间但带有 +08:00 标记。

    修复：重写 now() 方法，使用 datetime.now() 获取本地时间。
    """

    def now(self) -> datetime:
        """返回当前本地时间（naive datetime）

        Celery Beat 的 remaining_estimate 会用 now() - last_run_at 计算剩余时间。
        只要 now() 和 last_run_at 使用相同的时区（都是本地时间），计算就是正确的。
        """
        return datetime.now()


class FixedTimezoneCrontab(crontab):
    """修复时区问题的 crontab 类"""

    def now(self) -> datetime:
        """返回当前本地时间"""
        return datetime.now()


class DatabaseScheduleEntry(ScheduleEntry):
    """数据库任务调度项

    重要: __init__ 签名必须与 ScheduleEntry 兼容，因为 _next_instance() 会创建新实例。

    支持两种初始化方式：
    1. 从数据库任务创建：使用类方法 from_task()
    2. 从 _next_instance 复制：使用标准 ScheduleEntry 参数
    """

    # 保存数据库任务 ID，用于信号处理器更新执行时间
    task_model_id: int | None = None

    def __init__(
        self,
        name: str | None = None,
        task: str | None = None,
        last_run_at: datetime | None = None,
        total_run_count: int | None = None,
        schedule: Any = None,
        args: tuple = (),
        kwargs: dict | None = None,
        options: dict | None = None,
        relative: bool = False,
        app: Any = None,
        **extra_kwargs: Any,
    ) -> None:
        # 提取自定义参数
        self.task_model_id = extra_kwargs.pop("task_model_id", None)

        super().__init__(
            name=name,
            task=task,
            last_run_at=last_run_at,
            total_run_count=total_run_count,
            schedule=schedule,
            args=args,
            kwargs=kwargs,
            options=options,
            relative=relative,
            app=app,
        )

    @classmethod
    def from_task(cls, task: ScheduledTask, app: Any = None) -> "DatabaseScheduleEntry":
        """从数据库任务创建调度项"""
        # 构建 Celery 任务参数
        name = f"task_{task.id}_{task.name}"
        celery_task = "dataforge.execute_task"

        # 解析 handler_kwargs
        handler_kwargs: dict[str, Any] = {}
        if task.handler_kwargs:
            try:
                handler_kwargs = json.loads(task.handler_kwargs)
            except json.JSONDecodeError:
                pass

        # 任务参数
        kwargs = {
            "task_id": task.id,
            "handler_path": task.handler_path,
            "handler_kwargs": handler_kwargs,
            "trigger_type": "scheduled",
        }

        # 创建调度器
        sched = cls._make_schedule_static(task)

        return cls(
            name=name,
            task=celery_task,
            schedule=sched,
            kwargs=kwargs,
            options={},
            app=app or current_app,
            last_run_at=task.last_run_at,
            task_model_id=task.id,  # 保存任务 ID
        )

    @staticmethod
    def _make_schedule_static(task: ScheduledTask) -> schedule:
        """根据任务类型创建 Celery schedule

        使用自定义的 FixedTimezoneSchedule/FixedTimezoneCrontab 来修复时区问题。
        """
        if task.task_type == TaskType.CRON and task.cron_expression:
            # 解析 cron 表达式 (分 时 日 月 周)
            parts = task.cron_expression.split()
            if len(parts) >= 5:
                return FixedTimezoneCrontab(
                    minute=parts[0],
                    hour=parts[1],
                    day_of_month=parts[2],
                    month_of_year=parts[3],
                    day_of_week=parts[4],
                )
            logger.warning(f"无效的 cron 表达式: {task.cron_expression}")

        elif task.task_type == TaskType.INTERVAL and task.interval_seconds:
            return FixedTimezoneSchedule(timedelta(seconds=task.interval_seconds))

        elif task.task_type == TaskType.DATE and task.run_date:
            # DATE 类型：计算距离执行时间的秒数
            now = datetime.now()
            if task.run_date > now:
                delta = (task.run_date - now).total_seconds()
                return FixedTimezoneSchedule(timedelta(seconds=delta))
            # 已过期的一次性任务，设置为永不执行
            logger.info(f"一次性任务已过期: {task.name}")

        # 默认返回一个很长的间隔（相当于永不执行）
        return FixedTimezoneSchedule(timedelta(days=36500))

    def _next_instance(self, last_run_at: datetime | None = None, only_update_last_run_at: bool = False) -> "DatabaseScheduleEntry":
        """创建下一个实例，保留 task_model_id"""
        return self.__class__(
            name=self.name,
            task=self.task,
            schedule=self.schedule,
            kwargs=self.kwargs,
            options=self.options,
            last_run_at=self._default_now() if only_update_last_run_at else last_run_at,
            total_run_count=self.total_run_count + 1,
            app=self.app,
            task_model_id=self.task_model_id,  # 保留任务 ID
        )

class DatabaseScheduler(Scheduler):
    """从数据库加载任务的调度器

    继承自 Celery Scheduler 基类，实现从数据库动态加载定时任务。

    重要：
    - _last_sync 必须是 float 或 None，否则 Celery 基类的 should_sync() 会报错
    - _tasks_since_sync 需要初始化，与基类保持一致
    """

    # 同步间隔（秒）- 定期从数据库刷新任务
    sync_every = settings.celery_beat_sync_every

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        self._schedule: dict[str, DatabaseScheduleEntry] = {}
        # 使用 None 与 Celery 基类保持一致（基类默认值是 None）
        self._last_sync: float | None = None
        # 添加 _tasks_since_sync 初始化，与基类保持一致
        self._tasks_since_sync: int = 0
        super().__init__(*args, **kwargs)

    def setup_schedule(self) -> None:
        """初始化加载所有激活的任务"""
        self._load_tasks_from_db()

    def should_sync(self) -> bool:
        """重写 should_sync，添加类型安全检查

        Celery 基类的实现假设 _last_sync 是 float 或 None，
        如果类型不对会导致 TypeError。我们在这里添加保护。
        """
        # 确保 _last_sync 是正确的类型
        if self._last_sync is not None and not isinstance(
            self._last_sync, (int, float)
        ):
            logger.warning(
                f"_last_sync 类型异常: {type(self._last_sync)}，重置为 None"
            )
            self._last_sync = None

        # 调用父类实现
        return super().should_sync()

    def _load_tasks_from_db(self) -> None:
        """从数据库加载激活状态的任务"""
        try:
            with Session(engine) as session:
                statement = select(ScheduledTask).where(
                    ScheduledTask.status == TaskStatus.ACTIVE,
                    ScheduledTask.task_type != TaskType.MANUAL,
                )
                tasks = session.exec(statement).all()

                # 构建新的调度配置
                new_schedule: dict[str, DatabaseScheduleEntry] = {}

                for task in tasks:
                    entry_name = f"task_{task.id}_{task.name}"
                    try:
                        entry = DatabaseScheduleEntry.from_task(task, app=self.app)
                        new_schedule[entry_name] = entry
                        logger.debug(f"加载任务调度: {task.name}")
                    except Exception as e:
                        logger.error(f"加载任务 {task.name} 失败: {e}")

                # 原子替换调度配置
                self._schedule = new_schedule
                # 确保使用 float 类型
                self._last_sync = float(time.monotonic())

                logger.info(f"从数据库加载了 {len(self._schedule)} 个定时任务")

        except Exception as e:
            logger.error(f"从数据库加载任务失败: {e}")
            # 出错时不更新 _last_sync，下次会重试

    @property
    def schedule(self) -> dict[str, DatabaseScheduleEntry]:
        """返回当前调度配置"""
        # 使用更健壮的条件检查
        should_reload = (
            self._last_sync is None
            or not isinstance(self._last_sync, (int, float))
            or (time.monotonic() - self._last_sync) > self.sync_every
        )

        if should_reload:
            self._load_tasks_from_db()

        return self._schedule

    @schedule.setter
    def schedule(self, value: dict[str, ScheduleEntry]) -> None:
        """允许设置调度（Beat 启动时需要）"""
        pass

    def sync(self) -> None:
        """同步任务状态（Beat 定期调用）"""
        logger.debug("Beat 触发同步...")
        self._load_tasks_from_db()

    def get_schedule(self) -> dict[str, DatabaseScheduleEntry]:
        """返回调度配置"""
        return self.schedule


# 注意: task_postrun 信号处理器已移至 celery_tasks.py
# 因为该信号需要在 Worker 进程中注册才能生效
