"""账号同步任务

同步所有账号，刷新过期的登录会话。
"""

from loguru import logger

from app.services import account_service

# 任务元信息
TASK_INFO = {
    "name": "账号同步",
    "description": "同步所有账号 - 刷新过期的登录会话",
}


async def run(**kwargs) -> dict:
    """
    同步所有账号 - 刷新过期的登录会话

    Returns:
        dict: 同步结果统计
    """
    logger.info("开始执行账号同步任务")

    accounts = account_service.get_all_accounts()
    results = {
        "total": len(accounts),
        "synced": 0,
        "failed": 0,
        "skipped": 0,
    }

    for acc in accounts:
        try:
            status = await account_service.check_account_status(acc.id)
            if not status.get("valid", False):
                # 尝试重新登录
                login_result = await account_service.auto_login(acc.id)
                if login_result.get("success", False):
                    results["synced"] += 1
                else:
                    results["failed"] += 1
            else:
                results["skipped"] += 1
        except Exception as e:
            logger.error(f"同步账号 {acc.id} 失败: {e}")
            results["failed"] += 1

    logger.info(f"账号同步完成: {results}")
    return results
