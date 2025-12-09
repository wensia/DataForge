"""任务处理函数模块

注意：任务脚本已迁移到 backend/scripts 文件夹，
此模块仅保留用于向后兼容和默认任务配置。
"""

# 保留旧模块导入以支持向后兼容
from app.tasks import cleanup, sync, test  # noqa: F401

# 默认系统任务配置
# handler_path 格式: "scripts:<脚本文件名>" 或 "app.tasks.module:function"
DEFAULT_TASKS = [
    {
        "name": "account_sync",
        "description": "同步所有账号 - 刷新过期的登录会话",
        "task_type": "interval",
        "interval_seconds": 3600 * 6,  # 每 6 小时
        "handler_path": "scripts:sync_accounts",  # 指向 scripts/sync_accounts.py
        "is_system": True,
    },
    {
        "name": "cleanup_executions",
        "description": "清理过期的任务执行历史记录",
        "task_type": "cron",
        "cron_expression": "0 2 * * *",  # 每天凌晨 2 点
        "handler_path": "scripts:cleanup_executions",  # 指向 scripts/cleanup_executions.py
        "is_system": True,
    },
]
