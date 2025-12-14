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

---

## 周报生成流程（重要）

生成周报时，必须按以下步骤执行，确保数据准确：

> **重要原则**：统计数据基于**全部通话**，质量分析基于**有转写的通话**

### 步骤1：查询总览数据

```sql
-- 本周通话总览（基于全部通话）
SELECT
    COUNT(*) as 总通话数,
    COUNT(transcript) as 有转写数,
    SUM(duration) as 总时长秒,
    ROUND(AVG(duration)::numeric, 1) as 平均时长秒
FROM call_records
WHERE call_time >= CURRENT_DATE - INTERVAL '7 days';
```

### 步骤2：查询员工明细（基于全部通话）

```sql
-- 员工通话统计（核心数据 - 基于全部通话）
SELECT
    staff_name as 员工,
    COUNT(*) as 通话数,
    SUM(duration) as 总时长秒,
    ROUND(AVG(duration)::numeric, 1) as 平均时长秒,
    SUM(CASE WHEN duration >= 60 THEN 1 ELSE 0 END) as 超1分钟数,
    ROUND(SUM(CASE WHEN duration >= 60 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) as 有效率,
    COUNT(transcript) as 有转写数,
    ROUND(COUNT(transcript) * 100.0 / COUNT(*), 1) as 转写率
FROM call_records
WHERE call_time >= CURRENT_DATE - INTERVAL '7 days'
  AND staff_name IS NOT NULL
GROUP BY staff_name
ORDER BY 超1分钟数 DESC, 通话数 DESC;
```

### 步骤3：数据校验（必须执行）

```sql
-- 验证汇总数据（确保员工明细加总 = 总数）
SELECT
    COUNT(*) as 通话总数,
    SUM(duration) as 总时长秒,
    COUNT(DISTINCT staff_name) as 员工数,
    COUNT(transcript) as 有转写数
FROM call_records
WHERE call_time >= CURRENT_DATE - INTERVAL '7 days'
  AND staff_name IS NOT NULL;
```

**校验要点**：
- 员工通话数之和 = 通话总数
- 员工总时长之和 = 总时长
- 如不一致，检查是否遗漏 `staff_name IS NOT NULL` 条件

### 步骤4：时长分布统计（基于全部通话）

```sql
-- 时长分布（基于全部通话）
SELECT
    CASE
        WHEN duration < 30 THEN '1. 0-30秒'
        WHEN duration < 60 THEN '2. 30-60秒'
        WHEN duration < 180 THEN '3. 1-3分钟'
        WHEN duration < 300 THEN '4. 3-5分钟'
        WHEN duration < 600 THEN '5. 5-10分钟'
        ELSE '6. 10分钟以上'
    END as 时长区间,
    COUNT(*) as 数量,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 1) as 占比
FROM call_records
WHERE call_time >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY 1
ORDER BY 1;
```

### 步骤5：抽取长通话进行质量分析（需要转写）

```sql
-- 获取超过5分钟的深度通话（用于质量抽样，必须有转写）
SELECT id, staff_name, call_time, duration, call_result
FROM call_records
WHERE call_time >= CURRENT_DATE - INTERVAL '7 days'
  AND transcript IS NOT NULL
  AND duration > 300
ORDER BY duration DESC
LIMIT 10;
```

### 步骤6：获取转写内容并格式化

```bash
# 获取单条转写并格式化输出
PGPASSWORD='j7P8djrJwXdOWt5N' psql -h 124.220.15.80 -U postgres -d production -t -A -c "
SELECT transcript FROM call_records WHERE id = {ID};
" | python3 -c "
import json, sys
data = json.loads(sys.stdin.read())
for seg in data[:50]:  # 显示前50段
    speaker = '【员工】' if seg.get('speaker') == 'staff' else '【客户】'
    print(f\"{speaker} {seg.get('text', '')}\")
if len(data) > 50:
    print(f'\\n... 共 {len(data)} 段对话')
"
```

### 步骤7：生成并保存报告文件（必须执行）

**报告必须保存为 Markdown 文件**，路径规范：

```
reports/weekly-call-quality-report-{YYYY-MM-DD}.md
```

示例：`reports/weekly-call-quality-report-2025-12-10.md`

---

## 报告保存规范（重要）

### 必须保存报告的场景

1. **周报分析**：用户询问"这周通话质量如何"等
2. **员工分析**：用户要求分析某员工或全员表现
3. **质量评估**：任何涉及评分、质量分析的请求

### 报告文件命名规则

| 报告类型 | 文件名格式 | 示例 |
|:---------|:-----------|:-----|
| 周报 | `weekly-call-quality-report-{日期}.md` | `weekly-call-quality-report-2025-12-10.md` |
| 员工分析 | `staff-analysis-{员工名}-{日期}.md` | `staff-analysis-王莹旗-2025-12-10.md` |
| 单条通话 | `call-analysis-{ID}-{日期}.md` | `call-analysis-253414-2025-12-10.md` |

### 报告保存位置

统一保存到项目根目录的 `reports/` 文件夹：

```
/Users/panyuhang/我的项目/编程/网站/DataForge/reports/
```

### 报告完成后必须告知用户

分析完成后，必须输出：

```
📄 报告已保存至：reports/weekly-call-quality-report-2025-12-10.md
```

---

## 报告输出规范

### 表格对齐格式

```markdown
| 排名 | 员工 | 通话数 | 总时长 | 平均时长 | 超1分钟数 | 有效率 | 评价 |
|:----:|:-----|-------:|-------:|---------:|----------:|-------:|:-----|
| 1 | 杨珺 | 78 | 3,252 秒 | 41.7 秒 | 11 | 14.1% | 良好 |
```

**格式说明**：
- `:----:` 居中对齐（排名）
- `:-----` 左对齐（文本）
- `-----:` 右对齐（数字）

### 评价标准

| 有效率 | 评价 |
|-------:|:-----|
| ≥ 40% | ⭐ 优秀 |
| 20-40% | 良好 |
| 10-20% | 合格 |
| 5-10% | 待改进 |
| < 5% | ⚠️ 待改进 |

### 严重程度标识

- 🔴 严重问题
- 🟡 中等问题
- 🟢 轻微问题

---

## 单条通话分析流程

### 1. 获取转写内容

```bash
PGPASSWORD='j7P8djrJwXdOWt5N' psql -h 124.220.15.80 -U postgres -d production -t -A -c \
"SELECT id, staff_name, call_time, duration, call_result, transcript FROM call_records WHERE id = {ID};"
```

### 2. 格式化对话

将 JSON 转写转为可读对话格式（见步骤6）

### 3. 按 SCORING.md 标准评分

逐项打分并记录扣分项

### 4. 生成分析报告

包含评分、扣分项、亮点、改进建议

---

## 数据概况查询

```sql
-- 总记录数和有转写的记录数
SELECT
    COUNT(*) as 总记录数,
    COUNT(transcript) as 有转写记录数,
    ROUND(COUNT(transcript) * 100.0 / COUNT(*), 1) as 转写覆盖率
FROM call_records;

-- 员工通话统计（基于全部通话）
SELECT
    staff_name,
    COUNT(*) as 总通话数,
    COUNT(transcript) as 有转写数,
    SUM(CASE WHEN duration >= 60 THEN 1 ELSE 0 END) as 超1分钟数
FROM call_records
WHERE staff_name IS NOT NULL
GROUP BY staff_name ORDER BY 总通话数 DESC;
```

---

## 常见问题排查

### 问题1：员工数据加总与总数不一致

**原因**：部分通话 `staff_name` 为 NULL

**解决**：
```sql
-- 检查无员工名的通话数量
SELECT COUNT(*) FROM call_records
WHERE staff_name IS NULL;
```

### 问题2：员工有效率显示为0但实际有长通话

**原因**：之前版本错误地只统计有转写的通话

**正确做法**：统计应基于全部通话，不依赖 transcript
```sql
-- 正确的员工统计（不依赖转写）
SELECT
    staff_name,
    COUNT(*) as 总通话数,
    SUM(CASE WHEN duration >= 60 THEN 1 ELSE 0 END) as 超1分钟数,
    ROUND(SUM(CASE WHEN duration >= 60 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) as 有效率
FROM call_records
WHERE staff_name = '耿雅恬'
GROUP BY staff_name;
```

### 问题3：区分统计和质量分析

**核心原则**：
- **统计数据**（通话数、时长、有效率）→ 基于**全部通话**
- **质量分析**（评分、话术分析）→ 基于**有转写的通话**

在报告中明确标注数据来源范围

---

## 使用说明

### 关键字段说明（重要）

| 字段 | 说明 | 注意事项 |
|:-----|:-----|:---------|
| `callee` | 被叫号码/客户手机号 | **查询手机号必须用这个字段** |
| `customer_name` | 客户名称 | 可能为空，不要用于手机号匹配 |
| `caller` | 主叫号码/员工分机 | 通常是员工端号码 |
| `staff_name` | 员工姓名 | 用于员工维度统计 |
| `department` | 部门 | 可能显示"该部门不存在" |

> **特别注意**：当用户提供手机号列表查询通话记录时，必须在 `callee` 字段中搜索，而不是 `customer_name`。详见 [QUERIES.md](QUERIES.md) 第九节。

### 核心原则（重要）

> **统计数据基于全部通话，质量分析基于有转写的通话**

| 数据类型 | 是否依赖 transcript | 说明 |
|:---------|:-------------------:|:-----|
| 通话数量 | ❌ 否 | 统计全部通话 |
| 通话时长 | ❌ 否 | 统计全部通话 |
| 有效率 | ❌ 否 | 超1分钟数/总数 |
| 员工排名 | ❌ 否 | 基于全部通话 |
| 话术分析 | ✅ 是 | 需要转写内容 |
| 质量评分 | ✅ 是 | 需要转写内容 |

### 其他说明

1. 所有查询都是只读的（SELECT），不会修改数据
2. 转写格式：`[{start_time, end_time, speaker: 'staff'|'customer', text}]`
3. 时长单位为秒，可转换：`/60` 分钟，`/3600` 小时
4. 单次分析建议不超过 10 条完整通话
5. 评分时需引用原文作为依据
6. **生成报告前必须执行数据校验步骤**
7. **员工统计查询不应包含 `transcript IS NOT NULL` 条件**

---

## 相关文档

- [SCHEMA.md](SCHEMA.md) - 数据库表结构
- [ANALYSIS.md](ANALYSIS.md) - 质量分析指南
- [SCORING.md](SCORING.md) - 评分体系标准
- [QUERIES.md](QUERIES.md) - SQL 查询模板
