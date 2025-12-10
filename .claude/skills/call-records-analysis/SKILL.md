---
name: call-records-analysis
description: 分析 DataForge 通话记录数据。用于查询通话记录、按时间/部门/员工统计通话数量和时长、生成通话数据摘要。当用户询问"通话记录"、"通话统计"、"通话分析"、"有多少通话"等问题时使用。
allowed-tools: Bash(PGPASSWORD*psql:*)
---

# 通话记录分析 Skill

## 数据库连接

```bash
PGPASSWORD='j7P8djrJwXdOWt5N' psql -h 124.220.15.80 -U postgres -d production -c "YOUR_QUERY"
```

## 核心表：call_records

主要字段：
- `id` - 主键
- `source` - 数据来源（feishu/yunke）
- `caller/callee` - 主叫/被叫号码
- `call_time` - 通话时间
- `duration` - 通话时长（秒）
- `call_type` - 通话类型
- `call_result` - 通话结果
- `staff_name` - 员工姓名
- `department` - 部门

## 常用分析查询

### 1. 通话总览
```sql
SELECT COUNT(*) as 总数, SUM(duration) as 总时长秒 FROM call_records;
```

### 2. 按日期统计（最近7天）
```sql
SELECT DATE(call_time) as 日期, COUNT(*) as 通话数, SUM(duration) as 总时长
FROM call_records
WHERE call_time >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(call_time) ORDER BY 日期;
```

### 3. 按员工统计
```sql
SELECT staff_name, COUNT(*) as 通话数, SUM(duration) as 总时长, ROUND(AVG(duration)) as 平均时长
FROM call_records
WHERE staff_name IS NOT NULL
GROUP BY staff_name ORDER BY 通话数 DESC;
```

### 4. 按部门统计
```sql
SELECT department, COUNT(*) as 通话数, SUM(duration) as 总时长
FROM call_records
WHERE department IS NOT NULL
GROUP BY department ORDER BY 通话数 DESC;
```

### 5. 通话结果分布
```sql
SELECT call_result, COUNT(*) as 数量
FROM call_records
GROUP BY call_result ORDER BY 数量 DESC;
```

## 使用说明

1. 所有查询都是只读的（SELECT），不会修改数据
2. 时长单位为秒，需要时可转换为分钟（/60）或小时（/3600）
3. 时间筛选使用 `WHERE call_time BETWEEN 'start' AND 'end'`

详细表结构参考 [SCHEMA.md](SCHEMA.md)
更多查询示例参考 [QUERIES.md](QUERIES.md)
