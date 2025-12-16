# Celery 分布式任务锁规范

> 基于 Redis 的分布式锁实现，防止任务并发执行

## 概述

项目使用 Redis 分布式锁确保同一任务不会并发执行。实现参考：
- [Celery Task Cookbook - Ensuring a task is only executed one at a time](https://docs.celeryq.dev/en/latest/tutorials/task-cookbook.html)
- [Redis Distributed Locks](https://redis.io/docs/manual/patterns/distributed-locks/)

## 核心原理

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Celery Worker  │     │     Redis       │     │  Celery Worker  │
│  (尝试执行)      │     │  (锁存储)        │     │  (尝试执行)      │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │  SET task_lock:1 NX EX 3600                   │
         │ ─────────────────────▶│                       │
         │                       │                       │
         │  OK (获取成功)         │                       │
         │ ◀─────────────────────│                       │
         │                       │                       │
         │                       │  SET task_lock:1 NX EX 3600
         │                       │ ◀─────────────────────│
         │                       │                       │
         │                       │  nil (已被锁定)       │
         │                       │ ─────────────────────▶│
         │                       │                       │
         │  执行任务...           │                       │  跳过执行
         │                       │                       │
         │  DEL task_lock:1 (Lua 脚本，验证持有者)        │
         │ ─────────────────────▶│                       │
         │                       │                       │
         │  1 (释放成功)          │                       │
         │ ◀─────────────────────│                       │
```

## 锁实现要点

### 1. 原子获取锁

使用 Redis `SET NX EX` 命令原子获取锁：

```python
# SET key value NX EX timeout
# NX: 只在 key 不存在时设置
# EX: 设置过期时间（秒）
result = client.set(lock_key, worker_id, nx=True, ex=timeout)
```

### 2. 安全释放锁

使用 Lua 脚本原子释放锁（只有持有者才能释放）：

```lua
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
```

### 3. 锁自动过期

锁必须设置过期时间，防止 Worker 崩溃导致死锁。默认 1 小时。

## 锁 API

### 核心函数 (`app/utils/task_lock.py`)

| 函数 | 说明 |
|------|------|
| `acquire_task_lock(key, timeout)` | 获取锁，返回 bool |
| `release_task_lock(key)` | 释放锁，返回 bool |
| `extend_task_lock(key, timeout)` | 续期锁，返回 bool |
| `is_task_locked(key)` | 检查锁状态，返回 bool |
| `get_lock_holder(key)` | 获取锁持有者 ID |
| `get_lock_ttl(key)` | 获取锁剩余 TTL |
| `get_lock_info(key)` | 获取锁详细信息 |
| `force_release_task_lock(key)` | 强制释放锁（管理员） |
| `list_all_task_locks()` | 列出所有任务锁 |

### 上下文管理器（推荐）

```python
from app.utils.task_lock import task_lock_context, TaskLockAcquireError

# 方式一：失败时抛异常
try:
    with task_lock_context(f"task_lock:{task_id}") as acquired:
        # 执行任务（获取锁失败会抛出 TaskLockAcquireError）
        do_task()
except TaskLockAcquireError:
    logger.warning("任务正在执行中，跳过")

# 方式二：检查是否获取成功
with task_lock_context(f"task_lock:{task_id}", raise_on_fail=False) as acquired:
    if acquired:
        do_task()
    else:
        logger.warning("任务正在执行中，跳过")
```

### REST API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/tasks/locks` | 获取所有任务锁 |
| GET | `/api/v1/tasks/{id}/lock` | 获取指定任务锁信息 |
| POST | `/api/v1/tasks/{id}/release-lock` | 强制释放任务锁 |

## 锁使用规范

### 1. 锁超时时间

| 任务类型 | 建议超时 | 说明 |
|----------|----------|------|
| 快速任务 (<1 分钟) | 300 秒 (5 分钟) | 预留 5 倍缓冲 |
| 普通任务 (1-10 分钟) | 1800 秒 (30 分钟) | 预留 3 倍缓冲 |
| 长时间任务 (>10 分钟) | 3600 秒 (1 小时) | 需启用锁续期 |

**原则**: 锁超时时间 = 任务预期执行时间 × 1.5 ~ 3

### 2. 锁 Key 命名

```python
# 标准格式
lock_key = f"task_lock:{task_id}"

# 示例
"task_lock:1"    # 任务 ID 为 1 的锁
"task_lock:6"    # 任务 ID 为 6 的锁
```

### 3. 任务幂等性

即使锁机制失效，任务也应设计为可重复执行：

```python
async def run(**kwargs) -> dict:
    # 先检查是否已处理过
    if already_processed(record_id):
        return {"status": "skipped", "reason": "already_processed"}

    # 执行实际逻辑
    process(record_id)

    return {"status": "success"}
```

## 故障处理

### 场景 1：Worker 崩溃

**表现**: 任务执行中途 Worker 进程被杀死，锁未释放

**解决**: 锁设置了过期时间（默认 1 小时），会自动过期释放

**建议**: 如果确认 Worker 已停止，可手动释放锁：

```bash
# 通过 API 释放
curl -X POST "http://localhost:8847/api/v1/tasks/6/release-lock?api_key=xxx"

# 通过 Redis 直接删除
redis-cli DEL "task_lock:6"
```

### 场景 2：Redis 不可用

**表现**: 无法获取或释放锁

**策略**: 降级处理，允许任务执行（防止 Redis 故障导致所有任务停止）

```python
client = get_redis_client()
if client is None:
    # Redis 不可用，允许执行（降级策略）
    logger.warning(f"Redis 不可用，跳过锁检查: {lock_key}")
    return True
```

### 场景 3：锁被卡住

**表现**: 任务一直显示"锁已被占用"，但实际没有 Worker 在执行

**排查步骤**:

1. 查看锁状态：
```bash
curl "http://localhost:8847/api/v1/tasks/6/lock?api_key=xxx"
```

2. 检查锁信息（TTL、持有者）：
```bash
redis-cli TTL "task_lock:6"
redis-cli GET "task_lock:6"
```

3. 确认无 Worker 执行后，释放锁：
```bash
curl -X POST "http://localhost:8847/api/v1/tasks/6/release-lock?api_key=xxx"
```

### 场景 4：长时间任务

对于执行时间超过 30 分钟的任务，应考虑：

1. **增加锁超时时间**：在任务配置中设置更长的超时
2. **启用锁续期**（待实现）：定期调用 `extend_task_lock()` 续期

## 监控建议

### 定期检查卡住的锁

可添加定时任务，检查并告警异常锁：

```python
async def check_stale_locks():
    """检查可能卡住的锁"""
    locks = list_all_task_locks()
    for lock in locks:
        # TTL 超过 2 小时可能有问题
        if lock["ttl"] > 7200:
            logger.warning(f"发现可能卡住的锁: {lock}")
```

### Redis 内存监控

锁使用的内存极小（每个锁约几十字节），正常情况下不会造成内存问题。

## 代码示例

### Celery 任务中使用锁

```python
# app/celery_tasks.py

from app.utils.task_lock import (
    acquire_task_lock,
    release_task_lock,
    task_lock_context,
    TaskLockAcquireError,
)

@app.task
def execute_task(task_id: int, **kwargs):
    lock_key = f"task_lock:{task_id}"

    # 方式一：使用上下文管理器
    try:
        with task_lock_context(lock_key):
            # 执行任务
            result = do_work()
            return result
    except TaskLockAcquireError:
        logger.info(f"任务 #{task_id} 正在执行中，跳过")
        return None

    # 方式二：手动管理
    if not acquire_task_lock(lock_key):
        logger.info(f"任务 #{task_id} 正在执行中，跳过")
        return None

    try:
        result = do_work()
        return result
    finally:
        release_task_lock(lock_key)
```

## 相关文档

- [定时任务系统规范](./scheduler.md) - 任务调度整体架构
- [Celery Task Cookbook](https://docs.celeryq.dev/en/latest/tutorials/task-cookbook.html) - 官方最佳实践
- [Redis Distributed Locks](https://redis.io/docs/manual/patterns/distributed-locks/) - Redis 锁模式

## 更新历史

| 日期 | 更新内容 |
|------|----------|
| 2025-12-16 | 初始版本：基于 Celery 官方文档优化锁实现，添加管理 API |
