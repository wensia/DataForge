# 定时任务系统

> APScheduler 定时任务调度规范

## 概述

项目使用 APScheduler 实现定时任务调度，支持 Cron、Interval 和 Date 三种触发类型。

## 架构概览

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  scripts/*.py   │────▶│  registry.py     │────▶│  APScheduler    │
│  (任务脚本)      │     │  (处理函数注册)   │     │  (调度执行)      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                         │
                                                         ▼
                                                 ┌─────────────────┐
                                                 │  executor.py    │
                                                 │  (执行记录)      │
                                                 └─────────────────┘
```

## 目录结构

```
backend/
├── app/
│   └── scheduler/           # 调度器模块
│       ├── __init__.py
│       ├── core.py          # 调度器核心（初始化、启动、关闭）
│       ├── executor.py      # 任务执行器（包装执行、记录日志）
│       └── registry.py      # 处理函数注册表（扫描、注册）
└── scripts/                 # 任务脚本文件夹
    ├── __init__.py
    ├── example_task.py      # 示例脚本
    ├── sync_accounts.py     # 账号同步脚本
    └── cleanup_executions.py # 清理执行历史脚本
```

## 任务脚本规范

所有任务脚本存放在 `backend/scripts/` 文件夹中，每个 `.py` 文件代表一个任务。

### 脚本模板（无参数）

```python
# scripts/your_task.py

"""任务描述"""

from loguru import logger

# 任务元信息（可选但推荐）
TASK_INFO = {
    "name": "任务显示名称",
    "description": "任务详细描述",
}


async def run(**kwargs) -> dict:
    """
    任务入口函数（必需）

    Args:
        **kwargs: 任务参数（从数据库 handler_kwargs JSON 传入）

    Returns:
        dict: 执行结果，将保存到执行记录中
    """
    logger.info("任务开始执行")

    # 任务逻辑...

    return {
        "status": "completed",
        "message": "执行成功",
        # 其他结果数据...
    }
```

### 脚本模板（带参数）

当需要在前端配置参数时，使用类型注解定义参数：

```python
# scripts/data_sync.py

"""数据同步任务"""

import datetime
from loguru import logger

TASK_INFO = {
    "name": "数据同步",
    "description": "同步指定天数的数据",
}


async def run(
    days: int = 7,
    target: str = "all",
    start_date: datetime.datetime | None = None,
    options: dict | None = None,
) -> dict:
    """
    数据同步入口函数

    Args:
        days: 同步天数，默认 7 天
        target: 同步目标，默认 "all"
        start_date: 起始日期，默认 None（使用当前时间）
        options: 其他选项

    Returns:
        dict: 同步结果
    """
    if start_date is None:
        start_date = datetime.datetime.now()

    logger.info(f"开始同步 {days} 天数据，目标: {target}")

    # 同步逻辑...

    return {
        "status": "completed",
        "days": days,
        "target": target,
        "start_date": str(start_date),
    }
```

### 参数定义规范

前端会自动解析 `run()` 函数的参数签名，生成参数配置界面：

| 要素 | 说明 | 示例 |
|------|------|------|
| 参数名 | 使用 snake_case 命名 | `sync_days`, `target_type` |
| 类型注解 | 必须添加类型注解 | `days: int`, `name: str` |
| 默认值 | 可选参数必须有默认值 | `days: int = 7` |
| 必填参数 | 无默认值的参数为必填 | `target: str` |

### 支持的参数类型

| 类型 | 前端显示 | 示例值 |
|------|---------|--------|
| `int` | 整数输入 | `7`, `100` |
| `str` | 字符串输入 | `"hello"`, `'world'` |
| `float` | 浮点数输入 | `3.14`, `0.5` |
| `bool` | 布尔值 | `True`, `False` |
| `list` | 列表 | `[1, 2, 3]`, `["a", "b"]` |
| `dict` | 字典 | `{"key": "value"}` |
| `datetime.datetime` | 日期时间表达式 | `datetime.datetime.now()` |

### 参数值格式

在前端输入的参数值会通过 `safe_eval` 解析为 Python 对象：

```python
# 整数
0
7
-100

# 字符串（需要引号）
"hello"
'world'

# 列表
[1, 2, 3]
["item1", "item2"]

# 字典
{"key": "value"}
{"name": "test", "count": 10}

# 布尔值
True
False

# None
None

# datetime 表达式（推荐写法）
datetime.now()                              # 当前时间
datetime(2024, 1, 1)                        # 指定日期时间
datetime.combine(date.today(), time.min)    # 今天 00:00:00
datetime.combine(date.today() + timedelta(days=1), time.min)  # 明天 00:00:00

# date 表达式
date.today()                                # 今天
date.today() + timedelta(days=7)            # 7 天后
date.today() - timedelta(days=30)           # 30 天前

# time 表达式
time.min                                    # 00:00:00
time.max                                    # 23:59:59.999999
time(8, 30, 0)                              # 08:30:00

# timedelta 表达式
timedelta(days=7)                           # 7 天
timedelta(hours=6)                          # 6 小时
timedelta(minutes=30)                       # 30 分钟

# 旧写法兼容（自动转换）
datetime.datetime.now()                     # 自动转换为 datetime.now()
datetime.timedelta(days=7)                  # 自动转换为 timedelta(days=7)

# 简单表达式
1 + 2
len([1, 2, 3])
```

### safe_eval 支持的模块和类

| 名称 | 类型 | 说明 |
|------|------|------|
| `datetime` | 类 | `datetime.datetime` 类，支持 `now()`, `combine()` 等 |
| `date` | 类 | `datetime.date` 类，支持 `today()` |
| `time` | 类 | `datetime.time` 类，支持 `min`, `max` |
| `timedelta` | 类 | `datetime.timedelta` 类 |
| `json` | 模块 | JSON 模块 |

### 兼容性说明

为了兼容旧代码，`safe_eval` 会自动将 `datetime.datetime` 替换为 `datetime`：

| 旧写法 | 自动转换为 |
|--------|-----------|
| `datetime.datetime.now()` | `datetime.now()` |
| `datetime.datetime(2024, 1, 1)` | `datetime(2024, 1, 1)` |
| `datetime.datetime.combine(...)` | `datetime.combine(...)` |

### 脚本规范要点

| 项目 | 要求 |
|------|------|
| 文件位置 | `backend/scripts/` 目录下 |
| 文件命名 | 小写下划线命名，如 `sync_accounts.py` |
| 入口函数 | 必须有 `async def run(...)` 函数 |
| 参数类型 | 推荐添加类型注解，便于前端展示 |
| 默认值 | 可选参数必须有默认值 |
| 元信息 | 可选的 `TASK_INFO` 字典 |
| 返回值 | 返回 `dict` 类型的执行结果 |

## Handler 路径格式

| 格式 | 示例 | 说明 |
|------|------|------|
| `scripts:<filename>` | `scripts:sync_accounts` | 推荐：指向 scripts 文件夹中的脚本 |
| `module:function` | `app.tasks.sync:sync_all_accounts` | 向后兼容：传统模块路径 |

## 任务类型

```python
from enum import Enum

class TaskType(str, Enum):
    CRON = "cron"           # Cron 表达式，如 "0 2 * * *"
    INTERVAL = "interval"   # 固定间隔，单位秒
    DATE = "date"           # 一次性定时执行
    MANUAL = "manual"       # 手动执行（不自动调度）
```

### 手动执行任务

`manual` 类型任务**不会自动调度**，只能通过以下方式触发：
- 前端任务管理页面点击"立即运行"按钮
- API 调用：`POST /api/v1/tasks/{id}/run`

适用场景：
- 需要人工确认后执行的操作
- 一次性数据迁移任务
- 测试/调试用途的任务

### Cron 表达式示例

| 表达式 | 说明 |
|--------|------|
| `0 2 * * *` | 每天凌晨 2 点 |
| `*/30 * * * *` | 每 30 分钟 |
| `0 9 * * 1-5` | 工作日上午 9 点 |
| `0 0 1 * *` | 每月 1 号 0 点 |

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/tasks` | 获取任务列表 |
| GET | `/api/v1/tasks/{id}` | 获取任务详情 |
| POST | `/api/v1/tasks` | 创建任务 |
| PUT | `/api/v1/tasks/{id}` | 更新任务 |
| DELETE | `/api/v1/tasks/{id}` | 删除任务（系统任务不可删） |
| POST | `/api/v1/tasks/{id}/run` | 手动触发执行 |
| POST | `/api/v1/tasks/{id}/pause` | 暂停任务 |
| POST | `/api/v1/tasks/{id}/resume` | 恢复任务 |
| GET | `/api/v1/tasks/{id}/executions` | 执行历史 |
| GET | `/api/v1/tasks/handlers` | 获取可用处理函数列表 |

## 创建新任务

### 方式一：脚本文件（推荐）

1. 在 `backend/scripts/` 中创建新的 `.py` 文件
2. 按规范编写 `run()` 函数和可选的 `TASK_INFO`
3. 重启服务，系统自动扫描并注册
4. 通过 API 或前端创建任务，选择 `scripts:文件名` 作为处理函数

### 方式二：API 创建

```bash
curl -X POST "http://localhost:8847/api/v1/tasks?api_key=YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my_task",
    "description": "我的任务",
    "task_type": "interval",
    "interval_seconds": 3600,
    "handler_path": "scripts:my_task"
  }'
```

## 数据库模型

### ScheduledTask（任务定义表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| name | str | 任务名称（唯一） |
| description | str | 任务描述 |
| task_type | enum | cron/interval/date |
| cron_expression | str? | Cron 表达式 |
| interval_seconds | int? | 间隔秒数 |
| run_date | datetime? | 一次性执行时间 |
| handler_path | str | 处理函数路径 |
| handler_kwargs | str? | 处理函数参数 JSON |
| status | enum | active/paused/disabled |
| is_system | bool | 是否系统任务 |
| last_run_at | datetime? | 上次执行时间 |
| next_run_at | datetime? | 下次执行时间 |
| run_count | int | 执行总次数 |
| success_count | int | 成功次数 |
| fail_count | int | 失败次数 |

### TaskExecution（执行历史表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| task_id | int | 关联任务 ID |
| status | enum | pending/running/success/failed/cancelled |
| trigger_type | str | scheduled/manual |
| started_at | datetime? | 开始时间 |
| finished_at | datetime? | 结束时间 |
| duration_ms | int? | 执行耗时（毫秒） |
| result | str? | 执行结果 JSON |
| error_message | str? | 错误信息 |
| error_traceback | str? | 完整堆栈 |
| log_output | str? | 任务执行日志 |

## 任务日志功能

### 概述

`task_log()` 函数用于在任务执行过程中记录进度日志，日志会自动保存到 `TaskExecution.log_output` 字段。

### 导入方式

```python
from app.scheduler import task_log
```

### 基本用法

```python
async def run(**kwargs) -> dict:
    task_log("任务开始执行")
    task_log("处理数据:", len(data), "条")

    for i, item in enumerate(items):
        task_log(f"进度: {i+1}/{len(items)}")
        # 处理逻辑...

    task_log("任务完成")
    return {"status": "success"}
```

### 参数说明

```python
def task_log(*args, print_console: bool | None = None) -> None:
    """
    任务日志函数，类似 print

    Args:
        *args: 要记录的内容，多个参数用空格连接
        print_console: 是否打印到控制台
            - None: 跟随 DEBUG 模式设置（默认）
            - True: 强制打印到控制台
            - False: 只记录到数据库，不打印
    """
```

### 使用示例

```python
from app.scheduler import task_log

async def run(**kwargs) -> dict:
    # 默认：跟随 DEBUG 设置
    task_log("开始处理")

    # 强制打印到控制台（即使生产环境）
    task_log("重要信息", print_console=True)

    # 只记录到数据库，不打印（即使开发环境）
    task_log("静默记录", print_console=False)

    # 多参数用法（类似 print）
    task_log("处理进度:", 50, "%", "已完成")

    return {"status": "success"}
```

### 日志输出格式

日志会自动添加时间戳：

```
[14:30:25] 任务开始执行
[14:30:26] 处理进度: 1/10
[14:30:27] 处理进度: 2/10
...
[14:30:35] 任务完成
```

### 配置说明

| 环境 | DEBUG 值 | 默认行为 |
|------|---------|---------|
| 开发环境 | `true` | 日志打印到控制台 + 保存到数据库 |
| 生产环境 | `false` | 日志只保存到数据库，不打印 |

### 查看日志

任务执行日志可在以下位置查看：

1. **后台管理** → **定时任务** → **运行记录** → 点击"详情"
2. **API**: `GET /api/v1/tasks/executions/{id}` 返回 `log_output` 字段

## 配置项

```python
# app/config.py

# 调度器配置
scheduler_enabled: bool = True           # 是否启用调度器
timezone: str = "Asia/Shanghai"          # 时区
max_execution_history_days: int = 30     # 执行历史保留天数

# 多实例/多进程部署 leader 锁（Redis）
scheduler_leader_lock_enabled: bool = True        # 是否启用 leader 锁
scheduler_leader_lock_key: str = "scheduler:leader"  # Redis 锁 key
scheduler_leader_lock_ttl: int = 30              # 锁 TTL（秒）
scheduler_leader_lock_refresh_interval: int = 10 # 续租间隔（秒）

# 实时日志性能优化
scheduler_log_publish_interval: float = 0.3      # NEW_LOG 通知节流间隔（秒）
scheduler_log_buffer_max_lines: int = 20000      # 单次执行内存日志上限

# 脚本文件夹配置
scripts_path: str = "scripts"            # 脚本文件夹路径
```

## 分布式任务锁

为防止同一任务并发执行，项目使用 Redis 分布式锁。详见 [Celery 分布式任务锁规范](./celery-lock.md)。

### 快速参考

```python
from app.utils.task_lock import task_lock_context, TaskLockAcquireError

# 使用上下文管理器（推荐）
with task_lock_context(f"task_lock:{task_id}"):
    # 执行任务，锁会自动释放
    do_work()
```

### 锁管理 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/tasks/locks` | 获取所有任务锁 |
| GET | `/api/v1/tasks/{id}/lock` | 获取指定任务锁信息 |
| POST | `/api/v1/tasks/{id}/release-lock` | 强制释放任务锁（管理员） |

## 默认系统任务

| 任务名 | 类型 | 调度 | 说明 |
|--------|------|------|------|
| account_sync | interval | 每 6 小时 | 同步账号，刷新过期会话 |
| cleanup_executions | cron | 每天 2:00 | 清理 30 天前的执行记录 |

## 前端管理

任务管理页面位于 `/tasks`，提供以下功能：

- 任务列表（状态、类型、统计信息）
- 创建/编辑任务
- 手动触发执行
- 暂停/恢复任务
- 查看执行历史
