"""Celery 任务模块

所有任务使用 @celery_app.task 装饰器静态注册，
由 DatabaseScheduler 根据数据库配置动态调度。

任务命名规范：
- 前缀: dataforge.
- 格式: dataforge.<功能模块>_<动作>
- 示例: dataforge.sync_accounts, dataforge.cleanup_executions

使用示例：
    # 直接调用任务（异步执行）
    from app.tasks import sync_accounts
    result = sync_accounts.delay()

    # 获取已注册的任务
    from app.celery_app import celery_app
    task = celery_app.tasks.get("dataforge.sync_accounts")
"""

# 导入基类
from app.tasks.base import DataForgeTask, DataForgeTaskNoLock

# 导入所有任务（触发注册）
from app.tasks.asr_tasks import asr_text_replace, asr_transcribe
from app.tasks.cleanup_tasks import cleanup_executions, cleanup_stuck_tasks
from app.tasks.sync_tasks import sync_accounts, sync_call_logs, sync_call_logs_to_feishu

# 任务注册表（task_name -> 任务描述）
# 用于前端下拉框选择、API 文档等
REGISTERED_TASKS = {
    "dataforge.sync_accounts": {
        "name": "账号同步",
        "description": "同步所有账号 - 刷新过期的登录会话",
        "category": "sync",
        "params": [],
    },
    "dataforge.sync_call_logs": {
        "name": "通话记录同步",
        "description": "同步云客通话记录到 PostgreSQL",
        "category": "sync",
        "params": [
            {"name": "yunke_account_id", "type": "int", "required": True, "label": "云客账号ID"},
            {"name": "start_time", "type": "str", "required": False, "label": "开始时间"},
            {"name": "end_time", "type": "str", "required": False, "label": "结束时间"},
            {"name": "page_size", "type": "int", "required": False, "label": "每页记录数", "default": 50},
            {"name": "call_type", "type": "str", "required": False, "label": "通话类型", "default": "s"},
        ],
    },
    "dataforge.cleanup_executions": {
        "name": "清理执行历史",
        "description": "清理过期的任务执行历史记录",
        "category": "cleanup",
        "params": [
            {"name": "days", "type": "int", "required": False, "label": "保留天数"},
        ],
    },
    "dataforge.cleanup_stuck_tasks": {
        "name": "清理卡住任务",
        "description": "将长时间运行的任务标记为失败",
        "category": "cleanup",
        "params": [
            {"name": "max_running_minutes", "type": "int", "required": False, "label": "最大运行时间(分钟)", "default": 60},
        ],
    },
    "dataforge.asr_transcribe": {
        "name": "ASR 语音识别",
        "description": "对通话记录进行语音识别转写",
        "category": "asr",
        "params": [
            {"name": "asr_config_id", "type": "int", "required": True, "label": "ASR 配置ID"},
            {"name": "start_time", "type": "str", "required": True, "label": "开始时间"},
            {"name": "end_time", "type": "str", "required": True, "label": "结束时间"},
            {"name": "skip_existing", "type": "bool", "required": False, "label": "跳过已转写", "default": True},
            {"name": "min_duration", "type": "int", "required": False, "label": "最小通话时长(秒)", "default": 0},
            {"name": "max_records", "type": "int", "required": False, "label": "最大记录数", "default": 0},
            {"name": "concurrency", "type": "int", "required": False, "label": "并发数", "default": 0},
            {"name": "correct_table_name", "type": "str", "required": False, "label": "替换词本"},
            {"name": "qps", "type": "int", "required": False, "label": "QPS限制", "default": 20},
        ],
    },
    "dataforge.asr_text_replace": {
        "name": "ASR 文本替换",
        "description": "使用替换词本对已转录的通话记录进行错别字纠正",
        "category": "asr",
        "params": [
            {"name": "start_time", "type": "str", "required": False, "label": "开始时间"},
            {"name": "end_time", "type": "str", "required": False, "label": "结束时间"},
            {"name": "batch_size", "type": "int", "required": False, "label": "批量处理大小", "default": 500},
            {"name": "dry_run", "type": "bool", "required": False, "label": "试运行模式", "default": False},
        ],
    },
    "dataforge.sync_call_logs_to_feishu": {
        "name": "通话记录同步到飞书",
        "description": "将云客外呼记录同步到飞书多维表格",
        "category": "sync",
        "params": [
            {"name": "yunke_account_id", "type": "int", "required": True, "label": "云客账号ID"},
            {"name": "feishu_client_id", "type": "int", "required": True, "label": "飞书客户端ID"},
            {"name": "bitable_app_token", "type": "str", "required": True, "label": "多维表格 app_token"},
            {"name": "table_name", "type": "str", "required": False, "label": "目标数据表名称", "default": "通话记录"},
            {"name": "start_time", "type": "str", "required": False, "label": "开始时间"},
            {"name": "end_time", "type": "str", "required": False, "label": "结束时间"},
            {"name": "page_size", "type": "int", "required": False, "label": "每页记录数", "default": 50},
            {"name": "call_type", "type": "str", "required": False, "label": "通话类型(s/i)", "default": "s"},
            {"name": "only_with_record", "type": "bool", "required": False, "label": "只同步有录音的记录", "default": True},
        ],
    },
}

# 默认系统任务配置（启动时自动创建到数据库）
DEFAULT_TASKS = [
    {
        "name": "清理执行历史",
        "description": "每天清理30天前的执行记录",
        "task_type": "cron",
        "cron_expression": "0 3 * * *",  # 每天凌晨3点
        "task_name": "dataforge.cleanup_executions",
        "handler_kwargs": '{"days": 30}',
        "status": "active",
        "is_system": True,
        "category": "cleanup",
    },
    {
        "name": "清理卡住任务",
        "description": "每30分钟检查并清理卡住的任务",
        "task_type": "interval",
        "interval_seconds": 1800,  # 30分钟
        "task_name": "dataforge.cleanup_stuck_tasks",
        "handler_kwargs": '{"max_running_minutes": 60}',
        "status": "active",
        "is_system": True,
        "category": "cleanup",
    },
]


def get_registered_tasks() -> dict:
    """获取所有已注册的任务信息

    Returns:
        dict: 任务名称到任务信息的映射
    """
    return REGISTERED_TASKS.copy()


def get_task_by_name(task_name: str):
    """根据任务名获取 Celery 任务对象

    Args:
        task_name: Celery 任务名称

    Returns:
        Celery Task 对象，不存在返回 None
    """
    from app.celery_app import celery_app
    return celery_app.tasks.get(task_name)


# 导出
__all__ = [
    # 基类
    "DataForgeTask",
    "DataForgeTaskNoLock",
    # 任务函数
    "sync_accounts",
    "sync_call_logs",
    "sync_call_logs_to_feishu",
    "cleanup_executions",
    "cleanup_stuck_tasks",
    "asr_transcribe",
    "asr_text_replace",
    # 工具函数
    "get_registered_tasks",
    "get_task_by_name",
    "REGISTERED_TASKS",
    "DEFAULT_TASKS",
]
