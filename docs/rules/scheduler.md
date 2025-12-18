# 定时任务系统

> Celery 定时任务调度规范

## 概述

项目使用 Celery + Redis 实现定时任务调度，支持 Cron、Interval 和 Date 三种触发类型。

## 架构概览

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Celery 调度架构                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  任务定义层 (app/tasks/*.py)                                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  @celery_app.task(base=DataForgeTask, name="dataforge.xxx")  │  │
│  │  def my_task(self, **kwargs):                                 │  │
│  │      # 任务逻辑                                               │  │
│  │      return {"status": "success"}                             │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ▼                                      │
│  任务基类 (app/tasks/base.py - DataForgeTask)                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  - before_start(): 获取分布式锁                               │  │
│  │  - after_return(): 释放锁、记录时间                           │  │
│  │  - autoretry_for: 自动重试配置                                │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ▼                                      │
│  调度层 (DatabaseScheduler)                                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  从 ScheduledTask 表读取 task_name 配置                        │  │
│  │  直接调用 celery_app.tasks[task_name]                         │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ▼                                      │
│  信号处理 (celery_signals.py)                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  @task_prerun: 创建 TaskExecution 记录                        │  │
│  │  @task_success: 更新成功状态和统计                            │  │
│  │  @task_failure: 记录失败信息                                  │  │
│  │  @task_postrun: 更新 next_run_at                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## 目录结构

```
backend/
├── app/
│   ├── celery_app.py          # Celery 应用配置
│   ├── celery_scheduler.py    # DatabaseScheduler 调度器
│   ├── celery_signals.py      # 任务信号处理（执行记录）
│   ├── celery_tasks.py        # 系统维护任务
│   ├── tasks/                 # 业务任务目录
│   │   ├── __init__.py        # 任务注册表 REGISTERED_TASKS
│   │   ├── base.py            # DataForgeTask 基类
│   │   ├── sync_tasks.py      # 同步类任务
│   │   ├── cleanup_tasks.py   # 清理类任务
│   │   └── asr_tasks.py       # ASR 语音识别任务
│   └── scheduler/             # 调度器辅助模块
│       ├── registry.py        # 任务注册表查询
│       └── task_logger.py     # 任务日志功能
```

## 任务定义规范

所有业务任务必须在 `app/tasks/` 目录下使用装饰器定义：

```python
# app/tasks/sync_tasks.py

from app.celery_app import celery_app
from app.tasks.base import DataForgeTask
from app.scheduler import task_log


@celery_app.task(
    base=DataForgeTask,           # 使用带分布式锁的基类
    name="dataforge.sync_accounts",  # 任务名称（必须唯一）
    bind=True,                    # 绑定 self 参数
    max_retries=3,                # 最大重试次数
    default_retry_delay=60,       # 重试延迟（秒）
)
def sync_accounts(self, scheduled_task_id: int | None = None, **kwargs) -> dict:
    """同步账号任务

    Args:
        scheduled_task_id: 调度任务 ID（由 Beat 自动传入）
        **kwargs: 其他参数

    Returns:
        dict: 任务执行结果
    """
    task_log("开始同步账号...")

    # 任务逻辑...

    # 长任务可以续期锁
    self.extend_lock()

    task_log("同步完成")
    return {"synced_count": 10}
```

### 任务命名规范

| 元素 | 规范 | 示例 |
|------|------|------|
| 前缀 | 必须是 `dataforge.` | `dataforge.sync_accounts` |
| 功能模块 | 动词 + 名词 | `sync_accounts`, `cleanup_executions` |
| 完整格式 | `dataforge.<动作>_<对象>` | `dataforge.asr_transcribe` |

### 任务注册表

在 `app/tasks/__init__.py` 维护 `REGISTERED_TASKS` 字典，供前端展示和 API 查询：

```python
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
        ],
    },
}
```

## 任务类型

```python
from enum import Enum

class TaskType(str, Enum):
    CRON = "cron"           # Cron 表达式，如 "0 2 * * *"
    INTERVAL = "interval"   # 固定间隔，单位秒
    DATE = "date"           # 一次性定时执行
    MANUAL = "manual"       # 手动执行（不自动调度）
```

### Cron 表达式示例

| 表达式 | 说明 |
|--------|------|
| `0 2 * * *` | 每天凌晨 2 点 |
| `*/30 * * * *` | 每 30 分钟 |
| `0 9 * * 1-5` | 工作日上午 9 点 |
| `0 0 1 * *` | 每月 1 号 0 点 |

## 数据库配置

`ScheduledTask` 表配置示例：

```sql
INSERT INTO scheduled_tasks (
    name,
    description,
    task_type,
    task_name,           -- Celery 任务名称（关键字段！）
    interval_seconds,
    handler_kwargs,
    status
) VALUES (
    'sync_accounts_hourly',
    '每小时同步账号',
    'interval',
    'dataforge.sync_accounts',
    3600,
    '{}',
    'active'
);
```

**重要**: `task_name` 字段必须与 `@celery_app.task(name="...")` 装饰器中的名称一致。

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
| GET | `/api/v1/tasks/registered` | 获取已注册的 Celery 任务列表 |

## 任务日志

### 使用方式

```python
from app.scheduler import task_log

async def run(**kwargs) -> dict:
    task_log("任务开始执行")
    task_log("处理进度:", 50, "%", "已完成")
    task_log("调试信息", print_console=True)   # 强制打印到控制台
    task_log("静默记录", print_console=False)  # 只记录不打印
    return {"status": "success"}
```

### 日志存储

1. **Redis List**: 实时存储，支持 SSE 推送
2. **Redis Pub/Sub**: 通知前端有新日志
3. **PostgreSQL**: 任务结束后永久存储到 `TaskExecution.log_output`

## 分布式锁

通过 `DataForgeTask` 基类自动管理，详见 [Celery 分布式任务锁规范](./celery-lock.md)。

### 锁配置

```python
@celery_app.task(
    base=DataForgeTask,
    name="dataforge.long_running_task",
    bind=True,
)
def long_running_task(self, **kwargs):
    # DataForgeTask 自动在 before_start 获取锁
    # 并在 after_return 释放锁

    # 长任务手动续期锁
    for i in range(100):
        do_work(i)
        if i % 10 == 0:
            self.extend_lock()  # 每处理 10 个续期一次

    return {"processed": 100}
```

### 锁 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/tasks/locks` | 获取所有任务锁 |
| GET | `/api/v1/tasks/{id}/lock` | 获取指定任务锁信息 |
| POST | `/api/v1/tasks/{id}/release-lock` | 强制释放任务锁 |

## 服务启动

### 开发环境

```bash
# 启动 Worker（处理任务）
cd backend && celery -A app.celery_app worker -l INFO

# 启动 Beat（调度任务）
cd backend && celery -A app.celery_app beat -l INFO
```

### 生产环境 (Docker)

```bash
# 使用 docker-compose
docker compose up -d celery_worker celery_beat
```

## 配置项

```python
# app/config.py

# Celery 配置
celery_broker_url: str = ""              # Redis broker URL
celery_result_backend: str = ""          # Redis result backend
celery_timezone: str = "Asia/Shanghai"   # 时区

# 任务超时配置
celery_broker_visibility_timeout: int = 36000  # 10小时（必须 > task_timeout × 2）
celery_task_default_timeout: int = 14400       # 4小时

# 重试配置
celery_task_default_max_retries: int = 3
celery_task_retry_delay: int = 60
celery_task_retry_backoff: bool = True

# Worker 配置
celery_worker_concurrency: int = 100
celery_worker_prefetch_multiplier: int = 1

# Beat 配置
celery_beat_sync_every: int = 60  # 从数据库同步任务间隔（秒）
```

## 创建新任务步骤

1. **定义任务函数** - 在 `app/tasks/` 下创建或编辑文件
2. **添加到注册表** - 更新 `app/tasks/__init__.py` 的 `REGISTERED_TASKS`
3. **导入任务** - 确保在 `app/tasks/__init__.py` 中导入
4. **数据库配置** - 在 `scheduled_tasks` 表中添加调度配置
5. **重启服务** - 重启 Worker 和 Beat

## 故障排查

### 任务不执行

1. 检查任务状态是否为 `active`
2. 检查 `task_name` 是否正确配置
3. 检查 Worker 和 Beat 是否正常运行
4. 查看日志: `docker compose logs celery_worker celery_beat`

### 任务重复执行

1. 检查分布式锁是否正常工作
2. 检查 `visibility_timeout` 是否 > 任务超时时间 × 2
3. 确保只运行一个 Beat 实例

### 锁被卡住

```bash
# 查看锁状态
curl "http://localhost:8847/api/v1/tasks/6/lock?api_key=xxx"

# 强制释放锁
curl -X POST "http://localhost:8847/api/v1/tasks/6/release-lock?api_key=xxx"
```
