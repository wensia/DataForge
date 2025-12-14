"""清理卡住的任务执行记录

自动将运行超过指定时间的任务标记为失败。
这可以帮助处理因异常导致未正常结束的任务。
"""

from app.scheduler import task_log
from app.services.task_service import check_stuck_tasks, mark_task_as_stuck

TASK_INFO = {
    "name": "清理卡住的任务",
    "description": "自动将运行超过 2 小时的任务标记为失败",
}


def run(max_running_hours: int = 2, **kwargs) -> dict:
    """清理卡住的任务

    Args:
        max_running_hours: 最大运行时间（小时），超过则标记为失败，默认 2 小时

    Returns:
        dict: 清理结果
    """
    task_log(f"开始检查运行超过 {max_running_hours} 小时的任务...")

    # 检测卡住的任务
    stuck_ids = check_stuck_tasks(max_running_hours=max_running_hours)

    if not stuck_ids:
        task_log("没有发现卡住的任务")
        return {"cleaned": 0, "ids": []}

    task_log(f"发现 {len(stuck_ids)} 个卡住的任务: {stuck_ids}")

    # 标记为失败
    cleaned_ids = []
    for exec_id in stuck_ids:
        success = mark_task_as_stuck(exec_id)
        if success:
            cleaned_ids.append(exec_id)
            task_log(f"已将任务 #{exec_id} 标记为失败")
        else:
            task_log(f"标记任务 #{exec_id} 失败")

    task_log(f"清理完成，共处理 {len(cleaned_ids)} 个任务")
    return {"cleaned": len(cleaned_ids), "ids": cleaned_ids}
