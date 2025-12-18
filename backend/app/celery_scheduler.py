"""自定义 Celery Beat 调度器

参考 django-celery-beat 设计，从 ScheduledTask 数据库表动态加载调度配置。

核心设计：
1. 只使用 task_name 字段调用 Celery 任务
2. 定期从数据库同步任务配置（默认 60 秒）
3. 支持 CRON、INTERVAL、DATE 三种调度类型
4. 使用本地时间，避免时区转换问题

时区说明：
当 TZ 环境变量设置为 Asia/Shanghai 时，直接使用 datetime.now() 获取本地时间，
避免 Celery 的 UTC 时区转换问题。
"""

import json
import time
from datetime import datetime, timedelta
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


class LocalTimezoneSchedule(schedule):
    """使用本地时间的 schedule 类

    重写 now() 方法使用 datetime.now() 获取本地时间，
    避免 Celery 的 UTC 时区转换导致的调度错误。
    """

    def now(self) -> datetime:
        """返回当前本地时间"""
        return datetime.now()


class LocalTimezoneCrontab(crontab):
    """使用本地时间的 crontab 类"""

    def now(self) -> datetime:
        """返回当前本地时间"""
        return datetime.now()


# ============================================================================
# 调度项定义
# ============================================================================


class DatabaseScheduleEntry(ScheduleEntry):
    """数据库任务调度项

    从 ScheduledTask 创建 Celery Beat 调度项。
    支持从 _next_instance() 复制创建新实例。
    """

    # 保存数据库任务 ID
    scheduled_task_id: int | None = None

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
        self.scheduled_task_id = extra_kwargs.pop("scheduled_task_id", None)

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
        """从数据库任务创建调度项

        Args:
            task: ScheduledTask 数据库记录
            app: Celery 应用实例

        Returns:
            DatabaseScheduleEntry: 调度项

        Raises:
            ValueError: 任务配置错误
        """
        entry_name = f"task_{task.id}_{task.name}"
        app_instance = app or current_app

        # 验证 task_name 存在
        if not task.task_name:
            raise ValueError(f"任务 {task.id} ({task.name}) 缺少 task_name 配置")

        # 验证任务已注册
        if task.task_name not in app_instance.tasks:
            available_tasks = [t for t in app_instance.tasks.keys() if t.startswith("dataforge.")]
            raise ValueError(
                f"Celery 任务未注册: {task.task_name}\n"
                f"可用任务: {available_tasks}\n"
                f"请确保任务已在 app/tasks/ 中定义并导入"
            )

        # 解析任务参数
        task_kwargs: dict[str, Any] = {}
        if task.handler_kwargs:
            try:
                task_kwargs = json.loads(task.handler_kwargs)
            except json.JSONDecodeError as e:
                logger.warning(f"任务 {task.id} 参数解析失败: {e}")
                task_kwargs = {}

        # 添加调度任务 ID（用于分布式锁和执行记录）
        task_kwargs["scheduled_task_id"] = task.id

        # 创建调度器
        sched = cls._make_schedule(task)

        return cls(
            name=entry_name,
            task=task.task_name,
            schedule=sched,
            kwargs=task_kwargs,
            options={},
            app=app_instance,
            last_run_at=task.last_run_at,
            scheduled_task_id=task.id,
        )

    @staticmethod
    def _make_schedule(task: ScheduledTask) -> schedule:
        """根据任务类型创建 Celery schedule

        Args:
            task: ScheduledTask 数据库记录

        Returns:
            schedule: Celery 调度器
        """
        if task.task_type == TaskType.CRON and task.cron_expression:
            # 解析 cron 表达式 (分 时 日 月 周)
            parts = task.cron_expression.split()
            if len(parts) >= 5:
                return LocalTimezoneCrontab(
                    minute=parts[0],
                    hour=parts[1],
                    day_of_month=parts[2],
                    month_of_year=parts[3],
                    day_of_week=parts[4],
                )
            logger.warning(f"无效的 cron 表达式: {task.cron_expression}")

        elif task.task_type == TaskType.INTERVAL and task.interval_seconds:
            return LocalTimezoneSchedule(timedelta(seconds=task.interval_seconds))

        elif task.task_type == TaskType.DATE and task.run_date:
            # DATE 类型：计算距离执行时间的秒数
            now = datetime.now()
            if task.run_date > now:
                delta = (task.run_date - now).total_seconds()
                return LocalTimezoneSchedule(timedelta(seconds=delta))
            logger.info(f"一次性任务已过期: {task.name}")

        # 默认返回一个很长的间隔（相当于永不执行）
        return LocalTimezoneSchedule(timedelta(days=36500))

    def _next_instance(
        self, last_run_at: datetime | None = None, only_update_last_run_at: bool = False
    ) -> "DatabaseScheduleEntry":
        """创建下一个实例，保留 scheduled_task_id"""
        return self.__class__(
            name=self.name,
            task=self.task,
            schedule=self.schedule,
            kwargs=self.kwargs,
            options=self.options,
            last_run_at=self._default_now() if only_update_last_run_at else last_run_at,
            total_run_count=self.total_run_count + 1,
            app=self.app,
            scheduled_task_id=self.scheduled_task_id,
        )


# ============================================================================
# 数据库调度器
# ============================================================================


class DatabaseScheduler(Scheduler):
    """从数据库加载任务的调度器

    参考 django-celery-beat 设计：
    1. 启动时从数据库加载所有激活的任务
    2. 定期同步更新（sync_every 秒）
    3. 只处理 task_name 配置的任务
    """

    # 同步间隔（秒）
    sync_every = settings.celery_beat_sync_every

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        self._schedule: dict[str, DatabaseScheduleEntry] = {}
        self._last_sync: float = 0.0
        self._tasks_since_sync: int = 0
        super().__init__(*args, **kwargs)

    def setup_schedule(self) -> None:
        """初始化加载所有激活的任务"""
        logger.info("DatabaseScheduler 正在初始化...")
        self._load_tasks_from_db()

    @property
    def schedule(self) -> dict[str, DatabaseScheduleEntry]:
        """返回当前调度配置

        如果距离上次同步超过 sync_every 秒，会重新从数据库加载。
        """
        now = time.monotonic()
        if now - self._last_sync > self.sync_every:
            self._load_tasks_from_db()
        return self._schedule

    @schedule.setter
    def schedule(self, value: dict[str, ScheduleEntry]) -> None:
        """允许设置调度（Beat 启动时需要）"""
        pass

    def sync(self) -> None:
        """同步任务状态（Beat 定期调用）"""
        self._load_tasks_from_db()

    def get_schedule(self) -> dict[str, DatabaseScheduleEntry]:
        """返回调度配置"""
        return self.schedule

    def _load_tasks_from_db(self) -> None:
        """从数据库加载激活状态的任务

        增强错误处理：单个任务加载失败不影响其他任务。
        """
        try:
            with Session(engine) as session:
                # 查询所有激活且非手动的任务
                statement = select(ScheduledTask).where(
                    ScheduledTask.status == TaskStatus.ACTIVE,
                    ScheduledTask.task_type != TaskType.MANUAL,
                    ScheduledTask.task_name.is_not(None),  # 只加载有 task_name 的任务
                )
                tasks = session.exec(statement).all()

                # 构建新的调度配置
                new_schedule: dict[str, DatabaseScheduleEntry] = {}
                loaded_count = 0
                failed_tasks: list[tuple[int, str, str]] = []

                for task in tasks:
                    entry_name = f"task_{task.id}_{task.name}"
                    try:
                        entry = DatabaseScheduleEntry.from_task(task, app=self.app)
                        new_schedule[entry_name] = entry
                        loaded_count += 1
                        logger.debug(f"  ✓ {task.name} -> {task.task_name}")
                    except Exception as e:
                        failed_tasks.append((task.id, task.name, str(e)))
                        logger.error(f"  ✗ 加载任务 {task.name} 失败: {e}")

                # 原子替换调度配置
                self._schedule = new_schedule
                self._last_sync = time.monotonic()

                # 汇总日志
                if failed_tasks:
                    logger.warning(
                        f"任务加载部分失败 ({len(failed_tasks)}/{len(tasks)}): "
                        f"{[t[1] for t in failed_tasks]}"
                    )

                logger.info(f"DatabaseScheduler 加载了 {loaded_count} 个定时任务")

        except Exception as e:
            logger.error(f"从数据库加载任务失败: {e}", exc_info=True)
            # 出错时不更新 _last_sync，下次会重试
