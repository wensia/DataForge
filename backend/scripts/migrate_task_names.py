"""迁移脚本：将 handler_path 迁移到 task_name

此脚本将旧系统的 handler_path（如 scripts:sync_accounts）
转换为新系统的 task_name（如 dataforge.sync_accounts）。

运行方式：
    cd backend
    python scripts/migrate_task_names.py

或者在 Python 中：
    from scripts.migrate_task_names import migrate_handler_paths
    migrate_handler_paths(dry_run=True)  # 预览模式
    migrate_handler_paths(dry_run=False) # 实际执行
"""

from loguru import logger
from sqlmodel import Session, select

# 在导入应用模块前设置环境
import os
import sys

# 添加 backend 目录到 Python 路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import engine
from app.models.task import ScheduledTask


# handler_path -> task_name 映射表
HANDLER_PATH_MAPPING = {
    # scripts 目录下的任务
    "scripts:sync_accounts": "dataforge.sync_accounts",
    "scripts:sync_call_logs_to_pgsql": "dataforge.sync_call_logs",
    "scripts:sync_call_logs_to_feishu": "dataforge.sync_call_logs_to_feishu",
    "scripts:cleanup_executions": "dataforge.cleanup_executions",
    "scripts:cleanup_stuck_tasks": "dataforge.cleanup_stuck_tasks",
    "scripts:asr_transcribe": "dataforge.asr_transcribe",
    "scripts:asr_text_replace": "dataforge.asr_text_replace",
    # 旧的 app.tasks 模块路径
    "app.tasks.sync:sync_accounts": "dataforge.sync_accounts",
    "app.tasks.cleanup:cleanup_executions": "dataforge.cleanup_executions",
}


def migrate_handler_paths(dry_run: bool = True) -> dict:
    """迁移 handler_path 到 task_name

    Args:
        dry_run: 如果为 True，只预览不实际执行

    Returns:
        dict: 迁移结果统计
    """
    result = {
        "total": 0,
        "migrated": 0,
        "skipped_already_has_task_name": 0,
        "skipped_no_mapping": 0,
        "failed": 0,
        "details": [],
    }

    with Session(engine) as session:
        # 查询所有任务
        statement = select(ScheduledTask)
        tasks = session.exec(statement).all()
        result["total"] = len(tasks)

        for task in tasks:
            detail = {
                "id": task.id,
                "name": task.name,
                "handler_path": task.handler_path,
                "current_task_name": task.task_name,
                "action": None,
                "new_task_name": None,
            }

            # 如果已经有 task_name，跳过
            if task.task_name:
                detail["action"] = "skipped_already_has_task_name"
                result["skipped_already_has_task_name"] += 1
                result["details"].append(detail)
                continue

            # 如果没有 handler_path，跳过
            if not task.handler_path:
                detail["action"] = "skipped_no_handler_path"
                result["skipped_no_mapping"] += 1
                result["details"].append(detail)
                continue

            # 查找映射
            new_task_name = HANDLER_PATH_MAPPING.get(task.handler_path)

            if not new_task_name:
                # 尝试自动推断
                # scripts:xxx -> dataforge.xxx
                if task.handler_path.startswith("scripts:"):
                    script_name = task.handler_path.replace("scripts:", "")
                    new_task_name = f"dataforge.{script_name}"

            if new_task_name:
                detail["action"] = "migrated"
                detail["new_task_name"] = new_task_name
                result["migrated"] += 1

                if not dry_run:
                    try:
                        task.task_name = new_task_name
                        session.add(task)
                        logger.info(
                            f"任务 {task.id} ({task.name}): "
                            f"{task.handler_path} -> {new_task_name}"
                        )
                    except Exception as e:
                        detail["action"] = "failed"
                        detail["error"] = str(e)
                        result["failed"] += 1
                        result["migrated"] -= 1
                        logger.error(f"迁移任务 {task.id} 失败: {e}")
            else:
                detail["action"] = "skipped_no_mapping"
                result["skipped_no_mapping"] += 1

            result["details"].append(detail)

        if not dry_run:
            session.commit()
            logger.info("迁移完成，已提交到数据库")

    return result


def print_result(result: dict) -> None:
    """打印迁移结果"""
    print("\n" + "=" * 60)
    print("迁移结果汇总")
    print("=" * 60)
    print(f"总任务数: {result['total']}")
    print(f"已迁移: {result['migrated']}")
    print(f"跳过（已有 task_name）: {result['skipped_already_has_task_name']}")
    print(f"跳过（无映射）: {result['skipped_no_mapping']}")
    print(f"失败: {result['failed']}")
    print()

    if result["details"]:
        print("详细信息:")
        print("-" * 60)
        for detail in result["details"]:
            action_emoji = {
                "migrated": "✓",
                "skipped_already_has_task_name": "→",
                "skipped_no_mapping": "?",
                "skipped_no_handler_path": "-",
                "failed": "✗",
            }.get(detail["action"], " ")

            print(f"  {action_emoji} [{detail['id']}] {detail['name']}")
            print(f"      handler_path: {detail['handler_path']}")
            if detail["current_task_name"]:
                print(f"      task_name: {detail['current_task_name']} (已存在)")
            elif detail["new_task_name"]:
                print(f"      -> {detail['new_task_name']}")
            print()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="迁移 handler_path 到 task_name")
    parser.add_argument(
        "--execute",
        action="store_true",
        help="实际执行迁移（默认只预览）",
    )
    args = parser.parse_args()

    if args.execute:
        print("正在执行迁移...")
        result = migrate_handler_paths(dry_run=False)
    else:
        print("预览模式（使用 --execute 实际执行）")
        result = migrate_handler_paths(dry_run=True)

    print_result(result)
