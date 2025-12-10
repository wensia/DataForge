# call_records 表结构

## 主表：call_records

| 字段 | 类型 | 说明 |
|-----|------|------|
| id | INTEGER | 主键，自增 |
| source | VARCHAR | 数据来源：`feishu`（飞书）或 `yunke`（云客）|
| record_id | VARCHAR | 原始记录ID（与source组成唯一索引）|
| caller | VARCHAR | 主叫号码 |
| callee | VARCHAR | 被叫号码 |
| call_time | TIMESTAMP | 通话时间 |
| duration | INTEGER | 通话时长（秒）|
| call_type | VARCHAR | 通话类型（如：呼入、呼出）|
| call_result | VARCHAR | 通话结果（如：接通、未接通）|
| customer_name | VARCHAR | 客户名称 |
| staff_name | VARCHAR | 员工姓名 |
| department | VARCHAR | 部门 |
| staff_id | INTEGER | 员工ID（外键，关联 staff 表）|
| mapped_position | VARCHAR | 映射职位 |
| mapped_campus | VARCHAR | 映射校区（西南楼、赛顿中心）|
| mapped_department | VARCHAR | 映射部门 |
| transcript | JSON | 通话转写内容 |
| raw_data | JSON | 原始数据（完整的源数据）|
| created_at | TIMESTAMP | 记录创建时间 |
| updated_at | TIMESTAMP | 记录更新时间 |

## 索引

| 索引名 | 字段 | 说明 |
|-------|------|------|
| ix_call_records_call_time | call_time | 通话时间索引，加速时间范围查询 |
| ix_call_records_source_record_id | source, record_id | 唯一索引，防止重复导入 |

## 关联表：staff

| 字段 | 类型 | 说明 |
|-----|------|------|
| id | INTEGER | 主键 |
| name | VARCHAR | 员工姓名（唯一）|
| phone | VARCHAR | 员工电话 |
| is_active | BOOLEAN | 是否在职 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

## 关联表：staff_mappings

员工在不同时间段的职位/部门/校区映射记录。

| 字段 | 类型 | 说明 |
|-----|------|------|
| id | INTEGER | 主键 |
| staff_id | INTEGER | 员工ID（外键）|
| position | VARCHAR | 职位 |
| department | VARCHAR | 部门 |
| campus | VARCHAR | 校区 |
| effective_from | DATE | 生效开始日期 |
| effective_to | DATE | 生效结束日期（NULL表示当前有效）|
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

## 常用字段值

### source（数据来源）
- `feishu` - 飞书多维表格
- `yunke` - 云客系统

### call_type（通话类型）
具体值取决于数据源，常见：呼入、呼出

### call_result（通话结果）
具体值取决于数据源，常见：接通、未接通、忙线

### mapped_campus（校区）
- `西南楼`
- `赛顿中心`
