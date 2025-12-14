"""账号同步任务"""

from loguru import logger

from app.scheduler import task_log
from app.scheduler.registry import register_handler
from app.services import account_service


async def sync_all_accounts() -> dict:
    """
    同步所有账号 - 刷新过期的登录会话

    Returns:
        dict: 同步结果统计
    """
    task_log("开始执行账号同步任务")
    logger.info("开始执行账号同步任务")

    accounts = account_service.get_all_accounts()
    task_log(f"找到 {len(accounts)} 个账号需要检查")

    results = {
        "total": len(accounts),
        "synced": 0,
        "failed": 0,
        "skipped": 0,
    }

    for acc in accounts:
        try:
            task_log(f"检查账号 {acc.id}: {acc.username}")
            status = await account_service.check_account_status(acc.id)
            if not status.get("valid", False):
                # 尝试重新登录
                task_log(f"  账号 {acc.id} 需要重新登录")
                login_result = await account_service.auto_login(acc.id)
                if login_result.get("success", False):
                    task_log(f"  账号 {acc.id} 登录成功")
                    results["synced"] += 1
                else:
                    task_log(f"  账号 {acc.id} 登录失败")
                    results["failed"] += 1
            else:
                task_log(f"  账号 {acc.id} 状态正常，跳过")
                results["skipped"] += 1
        except Exception as e:
            task_log(f"  同步账号 {acc.id} 出错: {e}")
            logger.error(f"同步账号 {acc.id} 失败: {e}")
            results["failed"] += 1

    task_log(
        f"账号同步完成: 共 {results['total']} 个，同步 {results['synced']} 个，跳过 {results['skipped']} 个，失败 {results['failed']} 个"
    )
    logger.info(f"账号同步完成: {results}")
    return results


# 注册处理函数
register_handler("app.tasks.sync:sync_all_accounts", sync_all_accounts)
