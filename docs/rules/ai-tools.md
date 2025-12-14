# AI 工具调用规范

> DeepSeek Function Calling 工具定义与使用指南

## 概述

DataForge 使用 DeepSeek 的 Function Calling 功能实现智能数据查询。AI 可以根据用户问题自动选择并调用合适的工具获取数据。

## 代码结构

```
backend/app/services/
├── chat_service.py      # 对话服务（调用工具）
└── chat_tools.py        # 工具定义与实现
    ├── CHAT_TOOLS       # 工具定义列表
    ├── execute_tool()   # 工具分发执行
    └── _xxx()           # 各工具实现函数
```

## 可用工具

### 1. get_current_date
获取当前日期和时间，用于计算相对日期。

```python
# 返回示例
{
    "date": "2024-12-14",
    "time": "10:30:00",
    "weekday": "周六",
    "week_start": "2024-12-09",
    "month_start": "2024-12-01"
}
```

### 2. query_call_records
查询通话记录详情，支持多条件筛选。

| 参数 | 类型 | 必填 | 说明 |
|:-----|:-----|:-----|:-----|
| start_date | string | 否 | 开始日期 YYYY-MM-DD |
| end_date | string | 否 | 结束日期 YYYY-MM-DD |
| callee | string | 否 | 被叫号码，多个逗号分隔 |
| staff_name | string | 否 | 员工姓名（模糊匹配） |
| department | string | 否 | 部门名称（模糊匹配） |
| campus | string | 否 | 校区名称 |
| limit | integer | 否 | 返回数量，默认20，最大100 |

### 3. get_call_statistics
获取通话统计数据，可分组统计。

| 参数 | 类型 | 必填 | 说明 |
|:-----|:-----|:-----|:-----|
| start_date | string | 否 | 开始日期 |
| end_date | string | 否 | 结束日期 |
| group_by | string | 否 | 分组: day/staff/department/campus |
| staff_name | string | 否 | 筛选员工 |
| department | string | 否 | 筛选部门 |

### 4. get_staff_list
获取员工列表信息。

| 参数 | 类型 | 必填 | 说明 |
|:-----|:-----|:-----|:-----|
| department | string | 否 | 按部门筛选 |
| campus | string | 否 | 按校区筛选 |
| is_active | boolean | 否 | 是否在职，默认 true |

### 5. get_call_ranking
获取员工通话排行榜。

| 参数 | 类型 | 必填 | 说明 |
|:-----|:-----|:-----|:-----|
| start_date | string | 否 | 开始日期 |
| end_date | string | 否 | 结束日期 |
| rank_by | string | 否 | 排序: count/duration |
| limit | integer | 否 | 返回前N名，默认10 |

### 6. query_by_callee
按被叫号码（客户手机号）查询通话统计。

| 参数 | 类型 | 必填 | 说明 |
|:-----|:-----|:-----|:-----|
| callee_list | string | **是** | 被叫号码列表，逗号分隔 |
| start_date | string | 否 | 开始日期 |
| end_date | string | 否 | 结束日期 |

```python
# 返回示例
{
    "query_phones": 2,
    "found_phones": 2,
    "not_found_phones": 0,
    "total_calls": 5,
    "results": [
        {
            "callee": "13800138000",
            "call_count": 3,
            "total_duration_minutes": 15.5,
            "avg_duration_seconds": 310.0,
            "staff_count": 2,
            "staff_names": ["张三", "李四"],
            "effective_call_count": 2,
            "effective_rate": 66.7,
            "last_call_time": "2024-12-12 17:24"
        }
    ]
}
```

### 7. get_call_transcripts
获取通话转录文稿内容，用于分析对话内容。

| 参数 | 类型 | 必填 | 说明 |
|:-----|:-----|:-----|:-----|
| callee_list | string | **是** | 被叫号码列表，逗号分隔 |
| staff_name | string | 否 | 筛选特定员工 |
| min_duration | integer | 否 | 最小时长(秒)，默认60 |
| limit | integer | 否 | 返回数量，默认5，最大10 |

```python
# 返回示例
{
    "total": 1,
    "transcripts": [
        {
            "callee": "13800138000",
            "staff_name": "张三",
            "call_time": "2024-12-12 17:20",
            "duration_minutes": 15.6,
            "dialogue_count": 85,
            "full_dialogue": "【客户】你好。\n【员工】您好...",
            "summary": {
                "total_turns": 85,
                "staff_words": 1200,
                "customer_words": 450
            }
        }
    ]
}
```

## 系统提示词

系统提示词定义在 `chat_service.py` 的 `send_message()` 和 `send_message_stream()` 方法中：

```python
system_prompt = """你是一个专业的数据分析助手。你可以使用提供的工具来查询通话记录数据。

## 可用工具
- query_by_callee: 按被叫号码查询通话统计。当用户提供手机号列表时优先使用此工具。
- get_call_transcripts: 获取通话转录文稿内容。需要分析通话内容时使用。
- query_call_records: 查询通话记录详情，支持按被叫号码、员工、部门等筛选。
- get_call_statistics: 获取通话统计，可按天/员工/部门/校区分组。
- get_call_ranking: 获取员工通话排行榜。
- get_staff_list: 获取员工列表。
- get_current_date: 获取当前日期，用于计算相对日期。

## 重要说明
- 被叫手机号存储在 callee 字段（不是 customer_name）
- 当用户提供手机号列表时，使用 query_by_callee 工具
- 当用户需要分析通话内容/对话/话术时，使用 get_call_transcripts 工具
- 有效通话定义：通话时长 >= 60 秒

请用中文回答问题，并以清晰、结构化的方式呈现数据分析结果。"""
```

## 工具调用流程

```
用户提问 → DeepSeek 分析 → 选择工具 → execute_tool() → 返回数据 → DeepSeek 总结 → 响应用户
    ↑                                                           ↓
    └───────────────────── 多轮调用（最多5轮） ←──────────────────┘
```

### 执行过程

1. 用户发送问题
2. DeepSeek 根据系统提示词选择合适的工具
3. `execute_tool()` 分发执行对应的 `_xxx()` 函数
4. 工具返回 JSON 格式数据
5. DeepSeek 根据数据生成回答
6. 如需更多数据，继续调用工具（最多5轮）

## 添加新工具

### 步骤 1: 定义工具 Schema

在 `chat_tools.py` 的 `CHAT_TOOLS` 列表中添加：

```python
{
    "type": "function",
    "function": {
        "name": "your_tool_name",
        "description": "工具功能描述，AI 根据此选择工具",
        "parameters": {
            "type": "object",
            "properties": {
                "param1": {
                    "type": "string",
                    "description": "参数说明",
                },
                "param2": {
                    "type": "integer",
                    "description": "参数说明",
                },
            },
            "required": ["param1"],  # 必填参数
        },
    },
},
```

### 步骤 2: 注册工具执行

在 `execute_tool()` 函数中添加分发：

```python
elif tool_name == "your_tool_name":
    result = _your_tool_name(session, **args)
```

### 步骤 3: 实现工具函数

```python
def _your_tool_name(
    session: Session,
    param1: str,
    param2: int | None = None,
) -> dict:
    """工具功能说明

    Args:
        session: 数据库会话
        param1: 参数1说明
        param2: 参数2说明

    Returns:
        dict: 返回数据
    """
    # 实现查询逻辑
    query = select(YourModel).where(...)
    records = session.exec(query).all()

    return {
        "total": len(records),
        "data": [...]
    }
```

### 步骤 4: 更新系统提示词

在 `chat_service.py` 的系统提示词中添加新工具说明：

```python
## 可用工具
- your_tool_name: 新工具功能描述

## 重要说明
- 何时使用这个工具的说明
```

## 数据库字段说明

### call_records 表

| 字段 | 类型 | 说明 |
|:-----|:-----|:-----|
| id | INTEGER | 主键 |
| source | VARCHAR | 数据来源: feishu / yunke |
| caller | VARCHAR | 主叫号码/员工分机 |
| **callee** | VARCHAR | **被叫号码/客户手机号** |
| call_time | TIMESTAMP | 通话时间 |
| duration | INTEGER | 通话时长（秒） |
| call_type | VARCHAR | 通话类型: outbound / inbound |
| call_result | VARCHAR | 通话结果: 2=接通, 0=未接 |
| customer_name | VARCHAR | 客户名称（可能为空） |
| staff_name | VARCHAR | 员工姓名 |
| department | VARCHAR | 部门 |
| transcript | JSONB | 通话转写内容 |
| transcript_status | VARCHAR | 转写状态 |
| mapped_campus | VARCHAR | 映射校区 |
| mapped_department | VARCHAR | 映射部门 |

### transcript 字段结构

```json
[
    {
        "text": "对话内容",
        "speaker": "customer/staff",
        "emotion": "neutral",
        "start_time": 1.07,
        "end_time": 1.55
    }
]
```

## 常见问题

### Q: AI 没有调用正确的工具？

检查：
1. 系统提示词是否包含工具说明
2. 工具 description 是否清晰描述了使用场景
3. 用户问题是否匹配工具功能

### Q: 如何让 AI 优先使用某个工具？

在系统提示词的"重要说明"中明确指定：
```
- 当用户提供手机号列表时，使用 query_by_callee 工具
```

### Q: 工具返回数据过大怎么办？

1. 在工具函数中添加 `limit` 参数限制返回数量
2. 只返回必要字段，避免返回大字段（如 raw_data）
3. 对文本内容做截断处理

### Q: 如何调试工具调用？

查看后端日志：
```bash
tail -f /tmp/claude/tasks/xxx.output | grep "执行工具"
```

日志会显示：
```
执行工具: query_by_callee, 参数: {'callee_list': '13800138000'}
```

## 参考链接

- DeepSeek Function Calling 文档: https://platform.deepseek.com/api-docs/zh-cn/function-calling
- OpenAI Tools 文档: https://platform.openai.com/docs/guides/function-calling
