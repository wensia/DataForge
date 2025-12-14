"""调度器核心 - APScheduler 单例管理"""

from apscheduler.executors.asyncio import AsyncIOExecutor
from apscheduler.jobstores.memory import MemoryJobStore
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from loguru import logger

from app.config import settings

_scheduler: AsyncIOScheduler | None = None


def is_scheduler_initialized() -> bool:
    """检查调度器是否已初始化"""
    return _scheduler is not None


def get_scheduler() -> AsyncIOScheduler:
    """获取调度器单例"""
    global _scheduler
    if _scheduler is None:
        raise RuntimeError("调度器未初始化")
    return _scheduler


def init_scheduler() -> AsyncIOScheduler:
    """初始化调度器"""
    global _scheduler

    if _scheduler is not None:
        logger.warning("调度器已初始化，跳过重复初始化")
        return _scheduler

    # 使用内存存储任务（任务定义保存在数据库中）
    jobstores = {"default": MemoryJobStore()}

    executors = {"default": AsyncIOExecutor()}

    job_defaults = {
        "coalesce": True,  # 合并错过的执行
        "max_instances": 1,  # 防止并发执行
        "misfire_grace_time": 60 * 5,  # 5 分钟宽限期
    }

    _scheduler = AsyncIOScheduler(
        jobstores=jobstores,
        executors=executors,
        job_defaults=job_defaults,
        timezone=settings.timezone,
    )

    logger.info("调度器初始化完成")
    return _scheduler


def start_scheduler() -> None:
    """启动调度器"""
    global _scheduler
    if _scheduler and not _scheduler.running:
        _scheduler.start()
        logger.info("调度器已启动")


def shutdown_scheduler() -> None:
    """关闭调度器"""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=True)
        logger.info("调度器已关闭")
