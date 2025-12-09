# 数据同步规范

> 从飞书多维表格同步数据到本地数据库

## 背景

飞书多维表格单表限制 **2 万行**，无法满足大数据量需求。
通过数据同步服务，将飞书数据同步到本地数据库，突破行数限制。

## 数据流向

```
飞书多维表格 (限制 2 万行)
    ↓ search_records API
数据同步服务 (data_sync_service)
    ↓ 字段映射 + 去重
本地数据库 (call_records 表)
    ↓ 查询接口
AI 分析 / 前端展示
```

## 数据模型

### 通话记录表 (call_records)

```python
class CallRecord(BaseTable, table=True):
    """通话记录表"""
    __tablename__ = "call_records"

    # 数据来源标识
    source: str           # feishu / yunke
    record_id: str        # 原始记录 ID（联合唯一）

    # 核心字段（独立列，便于查询）
    caller: str | None          # 主叫
    callee: str | None          # 被叫
    call_time: datetime | None  # 通话时间
    duration: int | None        # 通话时长(秒)
    call_type: str | None       # 通话类型
    call_result: str | None     # 通话结果
    customer_name: str | None   # 客户名称
    staff_name: str | None      # 员工名称
    department: str | None      # 部门

    # 扩展字段（JSON 存储）
    raw_data: dict              # 原始数据完整记录
```

### 索引设计

```sql
-- 联合唯一索引（防重复）
CREATE UNIQUE INDEX ix_call_records_source_record_id ON call_records(source, record_id);

-- 时间索引（查询优化）
CREATE INDEX ix_call_records_call_time ON call_records(call_time);

-- 来源索引
CREATE INDEX ix_call_records_source ON call_records(source);
```

## 字段映射

### 默认映射规则

飞书字段 → 本地字段：

| 飞书字段名 | 本地字段 | 说明 |
|-----------|---------|------|
| 主叫 | caller | 主叫号码/人员 |
| 被叫 | callee | 被叫号码/客户 |
| 通话时间 | call_time | 通话发生时间 |
| 通话时长 | duration | 通话时长（秒） |
| 通话类型 | call_type | 呼入/呼出等 |
| 通话结果 | call_result | 接通/未接等 |
| 客户名称 | customer_name | 客户名 |
| 员工 | staff_name | 员工名 |
| 部门 | department | 所属部门 |

### 自定义映射

```python
# 传入自定义映射
field_mapping = {
    "电话号码": "caller",
    "客户电话": "callee",
    "呼叫时间": "call_time",
    "时长(秒)": "duration",
}

await sync_feishu_table_to_local(
    session=session,
    client=client,
    bitable=bitable,
    table=table,
    field_mapping=field_mapping,
)
```

## 同步服务

### 服务位置

`backend/app/services/data_sync_service.py`

### 核心函数

```python
# 同步单个飞书数据表
async def sync_feishu_table_to_local(
    session: Session,
    client: FeishuClient,
    bitable: FeishuBitable,
    table: FeishuTable,
    field_mapping: dict[str, str] | None = None,
    record_id_field: str = "record_id",
    batch_size: int = 500,
) -> dict[str, Any]:
    """
    返回: {"total": int, "added": int, "updated": int, "skipped": int, "errors": int}
    """

# 同步所有配置的飞书表
async def sync_all_feishu_tables(
    session: Session,
    field_mapping: dict[str, str] | None = None,
) -> dict[str, Any]:
    """
    返回: {"success": int, "failed": int, "details": list}
    """

# 查询本地记录
def get_call_records(
    session: Session,
    source: str | None = None,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    department: str | None = None,
    staff_name: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[CallRecord], int]:
    """返回: (记录列表, 总数)"""

# 获取统计信息
def get_call_record_stats(
    session: Session,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
) -> dict[str, Any]:
    """返回统计数据"""
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/analysis/records` | 查询记录列表 |
| GET | `/api/v1/analysis/records/stats` | 获取统计信息 |
| POST | `/api/v1/analysis/sync` | 手动触发同步 |

### 请求示例

```bash
# 查询记录
curl "http://localhost:8847/api/v1/analysis/records?api_key=xxx&page=1&page_size=20&source=feishu"

# 获取统计
curl "http://localhost:8847/api/v1/analysis/records/stats?api_key=xxx&start_time=2024-01-01"

# 触发同步
curl -X POST "http://localhost:8847/api/v1/analysis/sync?api_key=xxx"
```

## 同步策略

### 增量同步

- 基于 `source + record_id` 联合唯一约束
- 已存在的记录：更新字段值
- 不存在的记录：插入新记录
- 不会删除本地已有记录

### 同步流程

```python
1. 获取飞书 access_token
2. 分页拉取飞书数据（每页 500 条）
3. 对每条记录：
   a. 检查 (source, record_id) 是否已存在
   b. 存在 → 更新字段
   c. 不存在 → 插入新记录
4. 提交事务
5. 返回统计结果
```

### 错误处理

- 单条记录处理失败不影响其他记录
- 错误记录计入 `errors` 统计
- 详细错误记录到日志

## 数据类型转换

### 飞书特殊类型处理

```python
# 列表类型（多选、人员等）
["张三", "李四"] → "张三"  # 取第一个

# 复杂对象（链接、人员等）
{"text": "显示文本", "link": "..."} → "显示文本"

# 时间戳（毫秒）
1704067200000 → datetime(2024, 1, 1, 0, 0, 0)

# 时长字符串
"120" → 120 (int)
```

## 定时同步

可通过任务调度器配置定时同步：

```python
# 在任务管理中添加
handler_path: "app.services.data_sync_service:sync_all_feishu_tables"
task_type: INTERVAL
interval_seconds: 21600  # 每 6 小时
```

## 前端页面

访问路径：`/admin/data-analysis`

功能：
- 数据浏览（分页、筛选、搜索）
- 统计概览
- 手动同步按钮
- AI 分析入口

## 注意事项

1. **首次同步**：数据量大时耗时较长，建议在低峰期执行
2. **字段映射**：确保飞书字段名与映射配置匹配
3. **数据去重**：依赖 `record_id` 字段，确保其唯一性
4. **存储空间**：`raw_data` JSON 字段存储完整原始数据，注意磁盘占用
5. **API 限流**：飞书 API 有请求频率限制，大批量同步注意间隔

## 云客数据同步

### 同步函数

```python
from app.services.data_sync_service import sync_yunke_call_logs

result = await sync_yunke_call_logs(
    session=session,
    account_id=1,  # 云客账号 ID
    start_time="2024-01-01 00:00",
    end_time="2024-01-31 23:59",
)
# 返回: {"total": 1000, "added": 950, "updated": 50, "skipped": 0, "errors": 0}
```

### API 端点

```bash
# 同步指定账号的云客通话记录
POST /api/v1/analysis/sync/yunke/{account_id}?start_time=2024-01-01%2000:00&end_time=2024-01-31%2023:59&api_key=xxx
```

### 去重机制

云客通话记录使用 **通话ID (`id` 字段)** 作为唯一标识：

```python
# 使用云客通话记录的 id 作为 record_id
call_id = str(record.get("id", ""))

# 基于 (source, record_id) 联合唯一约束检查
existing = session.exec(
    select(CallRecord).where(
        CallRecord.source == "yunke",
        CallRecord.record_id == call_id,
    )
).first()
```

- 已存在的记录：更新字段值
- 不存在的记录：插入新记录
- 不会重复创建相同通话ID的记录

### 字段映射

| 云客字段 | 本地字段 | 说明 |
|---------|---------|------|
| id | record_id | 通话唯一标识 |
| callerNumber / userName | caller | 主叫 |
| calleeNumber / customerPhone | callee | 被叫 |
| lastConnectTime / createTime | call_time | 通话时间 |
| voiceTime / callTime | duration | 通话时长(秒) |
| callType | call_type | s=外呼, i=呼入 |
| callResult / status | call_result | 通话结果 |
| customerName | customer_name | 客户名称 |
| userName | staff_name | 员工名称 |
| departmentName | department | 部门 |
| voiceText / transcript | transcript | 录音转写文本 |

## 扩展其他数据源

1. 在 `DataSource` 枚举中添加新来源
2. 实现对应的同步函数和字段映射
3. 确保使用唯一标识字段作为 `record_id`
