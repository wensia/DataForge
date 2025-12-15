"""任务执行通知服务

当任务执行成功或失败时，发送通知到配置的机器人。
"""

from datetime import datetime
from typing import Literal

from loguru import logger
from sqlmodel import Session

from app.api.v1.robot import send_robot_message
from app.database import engine
from app.models.robot_config import RobotConfig
from app.models.task import ScheduledTask
from app.models.task_execution import TaskExecution


def format_duration(seconds: float) -> str:
    """格式化时长"""
    if seconds < 60:
        return f"{seconds:.1f}秒"
    elif seconds < 3600:
        minutes = seconds / 60
        return f"{minutes:.1f}分钟"
    else:
        hours = seconds / 3600
        return f"{hours:.1f}小时"


def format_datetime(dt: datetime | None) -> str:
    """格式化日期时间"""
    if dt is None:
        return "未知"
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def build_success_message(task: ScheduledTask, execution: TaskExecution) -> str:
    """构建成功通知消息"""
    duration = 0.0
    if execution.started_at and execution.ended_at:
        duration = (execution.ended_at - execution.started_at).total_seconds()

    return f"""✅ 任务执行成功
任务：{task.name}
时间：{format_datetime(execution.started_at)}
耗时：{format_duration(duration)}
执行ID：#{execution.id}"""


def build_failure_message(task: ScheduledTask, execution: TaskExecution) -> str:
    """构建失败通知消息"""
    error_msg = execution.error_message or "未知错误"
    # 截断过长的错误信息
    if len(error_msg) > 200:
        error_msg = error_msg[:200] + "..."

    return f"""❌ 任务执行失败
任务：{task.name}
时间：{format_datetime(execution.started_at)}
错误：{error_msg}
执行ID：#{execution.id}
请及时处理！"""


async def send_task_notification(
    task: ScheduledTask,
    execution: TaskExecution,
    status: Literal["success", "failure"],
) -> None:
    """发送任务执行通知

    Args:
        task: 任务对象
        execution: 执行记录对象
        status: 执行状态 ("success" 或 "failure")
    """
    # 检查是否需要通知
    if status == "success" and not task.notify_on_success:
        return
    if status == "failure" and not task.notify_on_failure:
        return

    # 检查是否配置了机器人
    if not task.robot_config_id:
        logger.debug(f"任务 {task.name} 未配置通知机器人，跳过通知")
        return

    # 获取机器人配置
    with Session(engine) as session:
        robot_config = session.get(RobotConfig, task.robot_config_id)

        if not robot_config:
            logger.warning(
                f"任务 {task.name} 配置的机器人 #{task.robot_config_id} 不存在"
            )
            return

        if not robot_config.is_active:
            logger.debug(f"任务 {task.name} 配置的机器人 {robot_config.name} 已禁用")
            return

        if not robot_config.is_verified:
            logger.warning(
                f"任务 {task.name} 配置的机器人 {robot_config.name} 未验证"
            )
            return

        # 构建通知消息
        if status == "success":
            message = build_success_message(task, execution)
        else:
            message = build_failure_message(task, execution)

        # 发送通知
        try:
            success, result_msg = await send_robot_message(
                platform=robot_config.platform,
                webhook_url=robot_config.webhook_url,
                secret=robot_config.secret,
                message=message,
            )

            if success:
                logger.info(
                    f"任务 {task.name} 执行{status}通知发送成功 -> {robot_config.name}"
                )
            else:
                logger.error(
                    f"任务 {task.name} 执行{status}通知发送失败: {result_msg}"
                )
        except Exception as e:
            logger.error(f"发送任务通知异常: {e}")
