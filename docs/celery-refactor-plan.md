# Celery 调度系统重构计划

## 问题诊断

### 当前架构的核心问题

系统中存在**两套并行的任务定义和执行机制**：

```
┌─────────────────────────────────────────────────────────────────────┐
│                       当前混乱的架构                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  路径 A (旧系统 - scripts/*.py)                                     │
│  ┌──────────────┐    ┌─────────────────┐    ┌──────────────────┐  │
│  │ scripts/*.py │───▶│ registry.py     │───▶│ execute_scheduled│  │
│  │ async run()  │    │ discover_scripts│    │ _task (通用执行器)│  │
│  └──────────────┘    └─────────────────┘    └──────────────────┘  │
│                                                                     │
│  路径 B (新系统 - app/tasks/*.py)                                   │
│  ┌──────────────┐    ┌─────────────────┐    ┌──────────────────┐  │
│  │ tasks/*.py   │───▶│ @celery_app.task│───▶│ DataForgeTask    │  │
│  │ 装饰器定义   │    │ + DataForgeTask │    │ 直接执行         │  │
│  └──────────────┘    └─────────────────┘    └──────────────────┘  │
│                                                                     │
│  调度器同时支持两种方式，导致：                                      │
│  - 代码路径不确定                                                   │
│  - 信号处理重复 (celery_tasks.py + celery_signals.py)              │
│  - 参数传递混乱 (_lock_key 冲突)                                    │
│  - 难以调试和维护                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### 具体问题列表

1. **双重任务定义**
   - `scripts/*.py`: 使用 `async def run()` + 动态扫描
   - `app/tasks/*.py`: 使用 `@celery_app.task` 装饰器
   - 两者并存导致混乱

2. **信号处理器重复**
   - `celery_signals.py` 有完整的 `prerun/success/failure/postrun` 处理器
   - `celery_tasks.py` 也有 `task_postrun` 处理器
   - 两处都在更新 `next_run_at` 和统计信息

3. **`execute_scheduled_task` 问题**
   - 这个通用执行器试图包装脚本任务
   - 但新系统的任务已经通过装饰器直接注册
   - 导致两套并行的执行路径
   - `_lock_key` 参数冲突错误来源于此

4. **调度器复杂度过高**
   - `DatabaseScheduler` 需要同时理解两种任务格式
   - 任务发现和注册逻辑分散在多个文件

---

## 重构方案

### 核心原则

参考 [django-celery-beat](https://github.com/celery/django-celery-beat) 和 Celery 官方文档的最佳实践：

1. **单一任务定义方式**: 全部使用 `@celery_app.task` 装饰器
2. **统一的任务基类**: `DataForgeTask` 处理分布式锁、重试、日志等
3. **简化调度器**: 只负责从数据库读取调度配置，调用已注册的任务
4. **统一信号处理**: 集中在 `celery_signals.py`

### 目标架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                       重构后的简洁架构                               │
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
│  任务基类 (app/tasks/base.py)                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  DataForgeTask(Task):                                         │  │
│  │  - before_start(): 获取分布式锁                               │  │
│  │  - after_return(): 释放锁、记录时间                           │  │
│  │  - autoretry_for: 自动重试配置                                │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ▼                                      │
│  调度层 (DatabaseScheduler)                                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  从 ScheduledTask 表读取配置                                   │  │
│  │  task_name -> 直接调用 celery_app.tasks[task_name]            │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ▼                                      │
│  信号处理 (celery_signals.py) - 唯一的信号处理入口                  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  @task_prerun: 创建 TaskExecution 记录                        │  │
│  │  @task_success: 更新成功状态和统计                            │  │
│  │  @task_failure: 记录失败信息                                  │  │
│  │  @task_postrun: 更新 next_run_at                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 详细重构步骤

### Phase 1: 删除旧系统代码

1. **删除 `execute_scheduled_task`** (`celery_tasks.py`)
   - 这个通用执行器是问题的根源
   - 新系统的任务通过装饰器直接注册，不需要这个包装层

2. **删除 `celery_tasks.py` 中的信号处理器**
   - `update_next_run_time` 与 `celery_signals.py` 中的 `on_task_postrun` 重复
   - 统一使用 `celery_signals.py`

3. **简化 `scheduler/registry.py`**
   - 移除 `discover_scripts()` 脚本扫描逻辑
   - 保留 `get_registered_tasks()` 用于 API 查询

### Phase 2: 简化调度器

1. **重构 `DatabaseScheduler`**
   - 从数据库读取 `task_name` 和 `handler_kwargs`
   - 直接调用 `celery_app.send_task(task_name, kwargs=...)`
   - 移除对 `handler_path` 的支持

2. **简化 `DatabaseScheduleEntry`**
   - 只需要 `task_name` 和 `schedule` 配置
   - 移除复杂的任务发现逻辑

### Phase 3: 更新信号处理

1. **统一在 `celery_signals.py`**
   - `task_prerun`: 创建执行记录
   - `task_success`: 更新成功状态
   - `task_failure`: 记录失败
   - `task_postrun`: 更新 `next_run_at` 和统计

2. **删除 `celery_tasks.py` 中的重复处理器**

### Phase 4: 数据模型更新

1. **`ScheduledTask` 表**
   - `task_name` 作为主要字段（必填）
   - `handler_path` 标记为废弃（可删除或保留用于向后兼容）

---

## 文件变更清单

### 删除的文件
- `backend/app/celery_tasks.py` -> 重命名为 `celery_tasks_legacy.py`（临时保留）

### 大幅修改的文件
- `backend/app/celery_scheduler.py` - 简化 DatabaseScheduler
- `backend/app/celery_signals.py` - 统一信号处理
- `backend/app/scheduler/registry.py` - 简化注册逻辑

### 小幅修改的文件
- `backend/app/celery_app.py` - 更新 include 配置
- `backend/app/models/task.py` - 标记 handler_path 废弃
- `backend/app/config.py` - 清理无用配置

---

## 任务注册规范

所有任务必须在 `app/tasks/` 目录下使用装饰器定义：

```python
# app/tasks/sync_tasks.py

from app.celery_app import celery_app
from app.tasks.base import DataForgeTask

@celery_app.task(
    base=DataForgeTask,
    bind=True,
    name="dataforge.sync_accounts",
)
def sync_accounts(self, **kwargs):
    """同步账号任务"""
    scheduled_task_id = kwargs.get("scheduled_task_id")
    # 任务逻辑...
    return {"synced_count": 10}
```

### 任务注册表

在 `app/tasks/__init__.py` 维护 `REGISTERED_TASKS` 字典：

```python
REGISTERED_TASKS = {
    "dataforge.sync_accounts": {
        "name": "账号同步",
        "description": "同步所有账号",
        "category": "sync",
        "params": [],
    },
    # ...
}
```

---

## 数据库调度配置

`ScheduledTask` 表配置示例：

```sql
INSERT INTO scheduled_tasks (
    name, description, task_type, task_name,
    interval_seconds, handler_kwargs, status
) VALUES (
    'sync_accounts_hourly',
    '每小时同步账号',
    'interval',
    'dataforge.sync_accounts',  -- Celery 任务名称
    3600,
    '{}',
    'active'
);
```

调度器会：
1. 读取 `task_name` = `"dataforge.sync_accounts"`
2. 调用 `celery_app.send_task("dataforge.sync_accounts", kwargs={...})`
3. Celery Worker 执行任务

---

## 迁移步骤

### 步骤 1: 确保所有任务已使用新系统

检查 `app/tasks/__init__.py` 中的 `REGISTERED_TASKS` 包含所有需要的任务。

### 步骤 2: 更新数据库

```sql
-- 将 handler_path 迁移到 task_name
UPDATE scheduled_tasks
SET task_name = 'dataforge.sync_accounts'
WHERE handler_path = 'scripts:sync_accounts' AND task_name IS NULL;

-- 验证所有活跃任务都有 task_name
SELECT id, name, handler_path, task_name
FROM scheduled_tasks
WHERE status = 'active' AND task_name IS NULL;
```

### 步骤 3: 执行代码重构

按照上述 Phase 1-4 执行代码修改。

### 步骤 4: 重启服务

```bash
# 停止旧服务
docker compose down

# 重新部署
docker compose up -d

# 检查日志
docker compose logs -f celery_worker celery_beat
```

---

## 回滚计划

如果重构出现问题：

1. 保留 `celery_tasks_legacy.py` 文件
2. 在 `celery_app.py` 中重新添加到 `include`
3. 恢复数据库中的 `handler_path` 配置

---

## 时间估算

| 阶段 | 预估工作量 |
|------|-----------|
| Phase 1: 删除旧代码 | 1-2 小时 |
| Phase 2: 简化调度器 | 2-3 小时 |
| Phase 3: 统一信号处理 | 1 小时 |
| Phase 4: 测试验证 | 2-3 小时 |
| **总计** | **6-9 小时** |

---

## 参考文档

- [Celery Tasks 官方文档](https://docs.celeryq.dev/en/stable/userguide/tasks.html)
- [django-celery-beat 源码](https://github.com/celery/django-celery-beat)
- [Celery Signals 文档](https://docs.celeryq.dev/en/stable/userguide/signals.html)
