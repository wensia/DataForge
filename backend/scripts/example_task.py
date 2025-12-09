"""示例任务脚本

这是一个示例脚本，展示任务脚本的规范格式。
复制此文件并修改即可创建新任务。

参数配置说明：
- 在 run() 函数中定义带类型注解的参数，前端会自动解析并展示配置界面
- 有默认值的参数为可选参数，无默认值的参数为必填参数
- 参数值在前端输入时支持 Python 表达式，如 datetime.datetime.now()
"""

import datetime

from loguru import logger

# 任务元信息（可选）
TASK_INFO = {
    "name": "示例任务",
    "description": "这是一个示例任务脚本，展示脚本规范和参数配置",
}


async def run(
    days: int = 7,
    message: str = "hello",
    enabled: bool = True,
    options: dict | None = None,
) -> dict:
    """
    任务入口函数

    Args:
        days: 处理天数，默认 7 天
        message: 自定义消息，默认 "hello"
        enabled: 是否启用，默认 True
        options: 其他选项，默认 None

    Returns:
        dict: 执行结果
    """
    logger.info("示例任务开始执行")
    logger.info(f"参数: days={days}, message={message}, enabled={enabled}, options={options}")

    # 在这里编写任务逻辑
    result = {
        "status": "completed",
        "message": f"示例任务执行成功: {message}",
        "params": {
            "days": days,
            "message": message,
            "enabled": enabled,
            "options": options,
        },
        "executed_at": str(datetime.datetime.now()),
    }

    logger.info(f"示例任务执行完成: {result}")
    return result
