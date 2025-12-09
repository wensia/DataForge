"""任务脚本模块

此文件夹用于存放定时任务脚本，每个 .py 文件代表一个任务。

脚本规范：
1. 必须包含一个名为 `run` 的异步函数作为入口
2. 可选定义 `TASK_INFO` 字典提供任务元信息

示例：
    TASK_INFO = {
        "name": "示例任务",
        "description": "任务描述",
    }

    async def run(**kwargs) -> dict:
        # 任务逻辑
        return {"status": "completed"}
"""
