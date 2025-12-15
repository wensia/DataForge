"""自定义 Celery Beat 调度器

从 ScheduledTask 数据库表动态加载调度配置，支持：
- 动态添加/修改/删除任务
- CRON、INTERVAL、DATE 三种调度类型
- 与现有数据模型完全兼容
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


class DatabaseScheduleEntry(ScheduleEntry):
    """数据库任务调度项"""

    def __init__(self, task: ScheduledTask, app: Any = None) -> None:
        self.task_model = task

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
        sched = self._make_schedule(task)

        super().__init__(
            name=name,
            task=celery_task,
            schedule=sched,
            kwargs=kwargs,
            options={},
            app=app or current_app,
        )

    def _make_schedule(self, task: ScheduledTask) -> schedule:
        """根据任务类型创建 Celery schedule"""
        if task.task_type == TaskType.CRON and task.cron_expression:
            # 解析 cron 表达式 (分 时 日 月 周)
            parts = task.cron_expression.split()
            if len(parts) >= 5:
                return crontab(
                    minute=parts[0],
                    hour=parts[1],
                    day_of_month=parts[2],
                    month_of_year=parts[3],
                    day_of_week=parts[4],
                )
            logger.warning(f"无效的 cron 表达式: {task.cron_expression}")

        elif task.task_type == TaskType.INTERVAL and task.interval_seconds:
            return schedule(timedelta(seconds=task.interval_seconds))

        elif task.task_type == TaskType.DATE and task.run_date:
            # DATE 类型：计算距离执行时间的秒数
            now = datetime.now()
            if task.run_date > now:
                delta = (task.run_date - now).total_seconds()
                return schedule(timedelta(seconds=delta))
            # 已过期的一次性任务，设置为永不执行
            logger.info(f"一次性任务已过期: {task.name}")

        # 默认返回一个很长的间隔（相当于永不执行）
        return schedule(timedelta(days=36500))


class DatabaseScheduler(Scheduler):
    """从数据库加载任务的调度器"""

    # 同步间隔（秒）- 定期从数据库刷新任务
    sync_every = settings.celery_beat_sync_every

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        self._schedule: dict[str, DatabaseScheduleEntry] = {}
        self._last_sync: float = 0.0  # 使用 time.monotonic() 的浮点数
        super().__init__(*args, **kwargs)

    def setup_schedule(self) -> None:
        """初始化加载所有激活的任务"""
        self._load_tasks_from_db()

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
                        entry = DatabaseScheduleEntry(task, app=self.app)
                        new_schedule[entry_name] = entry
                        logger.debug(f"加载任务调度: {task.name}")
                    except Exception as e:
                        logger.error(f"加载任务 {task.name} 失败: {e}")

                # 原子替换调度配置
                self._schedule = new_schedule
                self._last_sync = time.monotonic()

                logger.info(f"从数据库加载了 {len(self._schedule)} 个定时任务")

        except Exception as e:
            logger.error(f"从数据库加载任务失败: {e}")

    @property
    def schedule(self) -> dict[str, DatabaseScheduleEntry]:
        """返回当前调度配置"""
        # 定期刷新
        if (
            self._last_sync == 0.0
            or (time.monotonic() - self._last_sync) > self.sync_every
        ):
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


# 注册信号处理器，在任务执行后更新下次运行时间
from celery.signals import task_postrun  # noqa: E402


@task_postrun.connect
def update_next_run_time(
    sender: Any = None,
    task_id: str | None = None,
    task: Any = None,
    args: tuple[Any, ...] | None = None,
    kwargs: dict[str, Any] | None = None,
    retval: Any = None,
    state: str | None = None,
    **extra: Any,
) -> None:
    """任务执行后更新数据库中的下次执行时间"""
    if task is None or kwargs is None:
        return

    # 只处理我们的任务
    if task.name != "dataforge.execute_task":
        return

    db_task_id = kwargs.get("task_id")
    if not db_task_id:
        return

    try:
        with Session(engine) as session:
            db_task = session.get(ScheduledTask, db_task_id)
            if db_task:
                db_task.last_run_at = datetime.now()
                # 计算下次执行时间
                if db_task.task_type == TaskType.INTERVAL and db_task.interval_seconds:
                    db_task.next_run_at = datetime.now() + timedelta(
                        seconds=db_task.interval_seconds
                    )
                session.add(db_task)
                session.commit()
    except Exception as e:
        logger.warning(f"更新任务下次执行时间失败: {e}")
