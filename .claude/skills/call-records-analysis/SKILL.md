---
name: call-records-analysis
description: 分析 DataForge 通话记录数据。用于查询通话记录、按时间/部门/员工统计通话数量和时长、分析通话质量和话术、生成评分报告。当用户询问"通话记录"、"通话统计"、"通话分析"、"话术分析"、"质量评估"、"评分"、"有多少通话"等问题时使用。
allowed-tools: Bash(PGPASSWORD*psql:*)
---

# 通话记录分析 Skill

## 数据库连接

```bash
PGPASSWORD='j7P8djrJwXdOWt5N' psql -h 124.220.15.80 -U postgres -d production -c "YOUR_QUERY"
```

## 功能概览

### 1. 基础数据查询
- 通话记录查询、统计
- 按时间/部门/员工维度分析
- 详见 [QUERIES.md](QUERIES.md)

### 2. 通话质量分析（需要 transcript 字段）
- **销售话术**：开场白、产品介绍、异议处理、促成技巧
- **服务质量**：礼貌用语、响应质量、问题解决、情绪管理
- **合规检查**：话术规范、禁止用语
- 详见 [ANALYSIS.md](ANALYSIS.md)

### 3. 评分与报告
- 单条通话评分（满分100分）
- 批量分析报告
- 改进建议生成
- 详见 [SCORING.md](SCORING.md)

## 分析流程

### 单条通话分析

1. **获取转写内容**
```bash
PGPASSWORD='j7P8djrJwXdOWt5N' psql -h 124.220.15.80 -U postgres -d production -t -A -c \
"SELECT id, staff_name, call_time, duration, call_result, transcript FROM call_records WHERE id = {ID};"
```

2. **格式化对话**：将 JSON 转写转为可读对话格式

3. **按 SCORING.md 标准评分**：逐项打分并记录扣分项

4. **生成分析报告**：包含评分、扣分项、亮点、改进建议

### 批量分析

1. 筛选目标记录（员工/时间范围）
2. 逐条分析并汇总
3. 生成统计报告和排名

## 数据概况

查询当前数据状态：
```sql
-- 总记录数和有转写的记录数
SELECT
    COUNT(*) as 总记录数,
    COUNT(transcript) as 有转写记录数
FROM call_records;

-- 有转写记录的员工
SELECT staff_name, COUNT(*) as 数量
FROM call_records
WHERE transcript IS NOT NULL AND staff_name IS NOT NULL
GROUP BY staff_name ORDER BY 数量 DESC;
```

## 使用说明

1. 所有查询都是只读的（SELECT），不会修改数据
2. 转写格式：`[{start_time, end_time, speaker: 'staff'|'customer', text}]`
3. 时长单位为秒，可转换：`/60` 分钟，`/3600` 小时
4. 单次分析建议不超过 10 条完整通话
5. 评分时需引用原文作为依据

## 相关文档

- [SCHEMA.md](SCHEMA.md) - 数据库表结构
- [ANALYSIS.md](ANALYSIS.md) - 质量分析指南
- [SCORING.md](SCORING.md) - 评分体系标准
- [QUERIES.md](QUERIES.md) - SQL 查询模板
