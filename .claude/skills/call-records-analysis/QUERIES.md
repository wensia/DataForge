# SQL 查询模板

## 数据库连接

```bash
PGPASSWORD='j7P8djrJwXdOWt5N' psql -h 124.220.15.80 -U postgres -d production -c "YOUR_QUERY"

# 无表头输出（适合脚本处理）
PGPASSWORD='j7P8djrJwXdOWt5N' psql -h 124.220.15.80 -U postgres -d production -t -A -c "YOUR_QUERY"
```

---

## 一、数据概览查询

### 1. 总体数据统计
```sql
SELECT
    COUNT(*) as 总记录数,
    COUNT(transcript) as 有转写记录数,
    SUM(duration) as 总时长秒,
    ROUND(AVG(duration)) as 平均时长秒
FROM call_records;
```

### 2. 按来源统计
```sql
SELECT
    source as 来源,
    COUNT(*) as 记录数,
    COUNT(transcript) as 有转写数,
    SUM(duration) as 总时长秒
FROM call_records
GROUP BY source;
```

### 3. 员工通话统计（基于全部通话）
```sql
SELECT
    staff_name as 员工,
    COUNT(*) as 通话数,
    SUM(duration) as 总时长秒,
    ROUND(AVG(duration)) as 平均时长秒,
    COUNT(transcript) as 有转写数
FROM call_records
WHERE staff_name IS NOT NULL
GROUP BY staff_name
ORDER BY 通话数 DESC;
```

### 4. 按日期统计（最近30天）
```sql
SELECT
    DATE(call_time) as 日期,
    COUNT(*) as 通话数,
    COUNT(transcript) as 有转写数,
    SUM(duration) as 总时长秒
FROM call_records
WHERE call_time >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(call_time)
ORDER BY 日期 DESC;
```

---

## 二、转写数据提取

### 1. 按ID获取单条记录（完整信息）
```sql
SELECT
    id,
    staff_name,
    department,
    call_time,
    duration,
    call_type,
    call_result,
    customer_name,
    caller,
    callee,
    transcript
FROM call_records
WHERE id = {ID};
```

### 2. 按ID获取转写内容（仅转写）
```sql
SELECT transcript
FROM call_records
WHERE id = {ID};
```

### 3. 按员工获取最近N条有转写的记录
```sql
SELECT
    id,
    call_time,
    duration,
    call_result,
    transcript
FROM call_records
WHERE staff_name = '{STAFF_NAME}'
  AND transcript IS NOT NULL
ORDER BY call_time DESC
LIMIT {LIMIT};
```

### 4. 按时间范围获取有转写的记录
```sql
SELECT
    id,
    staff_name,
    call_time,
    duration,
    call_result,
    transcript
FROM call_records
WHERE call_time BETWEEN '{START_DATE}' AND '{END_DATE}'
  AND transcript IS NOT NULL
ORDER BY call_time DESC;
```

### 5. 按部门获取有转写的记录
```sql
SELECT
    id,
    staff_name,
    call_time,
    duration,
    transcript
FROM call_records
WHERE department = '{DEPARTMENT}'
  AND transcript IS NOT NULL
ORDER BY call_time DESC
LIMIT {LIMIT};
```

---

## 三、转写内容格式化

### 1. 格式化单条转写为对话形式
```sql
SELECT
    id,
    staff_name,
    duration,
    (
        SELECT string_agg(
            CASE
                WHEN elem->>'speaker' = 'staff' THEN '【员工】' || (elem->>'text')
                ELSE '【客户】' || (elem->>'text')
            END,
            E'\n'
            ORDER BY (elem->>'start_time')::float
        )
        FROM jsonb_array_elements(transcript) AS elem
    ) as formatted_transcript
FROM call_records
WHERE id = {ID};
```

### 2. 统计对话轮次
```sql
SELECT
    id,
    staff_name,
    jsonb_array_length(transcript) as 对话轮次,
    duration as 时长秒
FROM call_records
WHERE id = {ID} AND transcript IS NOT NULL;
```

### 3. 提取员工发言
```sql
SELECT
    id,
    (
        SELECT string_agg(elem->>'text', ' ')
        FROM jsonb_array_elements(transcript) AS elem
        WHERE elem->>'speaker' = 'staff'
    ) as 员工发言
FROM call_records
WHERE id = {ID};
```

### 4. 提取客户发言
```sql
SELECT
    id,
    (
        SELECT string_agg(elem->>'text', ' ')
        FROM jsonb_array_elements(transcript) AS elem
        WHERE elem->>'speaker' = 'customer'
    ) as 客户发言
FROM call_records
WHERE id = {ID};
```

---

## 四、统计分析查询

> **重要**：统计分析基于**全部通话**，不依赖 transcript 字段

### 1. 通话时长分布
```sql
SELECT
    CASE
        WHEN duration < 60 THEN '0-1分钟'
        WHEN duration < 180 THEN '1-3分钟'
        WHEN duration < 300 THEN '3-5分钟'
        WHEN duration < 600 THEN '5-10分钟'
        ELSE '10分钟以上'
    END as 时长区间,
    COUNT(*) as 数量,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 1) as 占比
FROM call_records
GROUP BY 1
ORDER BY MIN(duration);
```

### 2. 通话结果分布
```sql
SELECT
    call_result as 通话结果,
    COUNT(*) as 数量,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 1) as 占比
FROM call_records
GROUP BY call_result
ORDER BY 数量 DESC;
```

### 3. 按员工统计
```sql
SELECT
    staff_name as 员工,
    COUNT(*) as 通话数,
    SUM(duration) as 总时长秒,
    ROUND(AVG(duration)) as 平均时长秒,
    SUM(CASE WHEN duration >= 60 THEN 1 ELSE 0 END) as 超1分钟数,
    ROUND(SUM(CASE WHEN duration >= 60 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) as 有效率,
    COUNT(transcript) as 有转写数,
    ROUND(COUNT(transcript) * 100.0 / COUNT(*), 1) as 转写率
FROM call_records
WHERE staff_name IS NOT NULL
GROUP BY staff_name
ORDER BY 通话数 DESC;
```

### 4. 按部门统计
```sql
SELECT
    department as 部门,
    COUNT(*) as 通话数,
    SUM(duration) as 总时长秒,
    COUNT(DISTINCT staff_name) as 员工数,
    COUNT(transcript) as 有转写数
FROM call_records
WHERE department IS NOT NULL
GROUP BY department
ORDER BY 通话数 DESC;
```

### 5. 最近7天趋势
```sql
SELECT
    DATE(call_time) as 日期,
    COUNT(*) as 通话数,
    COUNT(transcript) as 有转写数,
    SUM(duration) as 总时长秒,
    ROUND(AVG(duration)) as 平均时长秒
FROM call_records
WHERE call_time >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(call_time)
ORDER BY 日期;
```

---

## 五、质量分析辅助查询

> **说明**：质量分析需要读取转写内容，因此这些查询保留 `transcript IS NOT NULL` 条件

### 1. 查找长通话用于质量分析（需要转写）
```sql
-- 找有转写的长通话进行质量分析
SELECT
    id,
    staff_name,
    call_time,
    duration,
    call_result
FROM call_records
WHERE transcript IS NOT NULL
  AND duration > 300  -- 超过5分钟
ORDER BY duration DESC
LIMIT 10;
```

### 2. 查找所有长通话（统计用，不依赖转写）
```sql
-- 统计所有长通话，不限制转写
SELECT
    id,
    staff_name,
    call_time,
    duration,
    call_result,
    CASE WHEN transcript IS NOT NULL THEN '有' ELSE '无' END as 有转写
FROM call_records
WHERE duration > 300  -- 超过5分钟
ORDER BY duration DESC
LIMIT 10;
```

### 3. 按通话结果筛选（统计用）
```sql
-- 接通的通话（不依赖转写）
SELECT id, staff_name, call_time, duration
FROM call_records
WHERE call_result = '2'  -- 或其他表示接通的值
ORDER BY call_time DESC
LIMIT 10;
```

### 4. 随机抽样分析（需要转写）
```sql
-- 随机抽取有转写的通话进行质量分析
SELECT
    id,
    staff_name,
    call_time,
    duration,
    call_result,
    transcript
FROM call_records
WHERE transcript IS NOT NULL
ORDER BY RANDOM()
LIMIT 5;
```

---

## 六、批量导出查询

### 1. 导出员工通话列表（全部通话）
```sql
SELECT
    id,
    staff_name,
    call_time,
    duration,
    call_type,
    call_result,
    customer_name,
    CASE WHEN transcript IS NOT NULL THEN '有' ELSE '无' END as 有转写
FROM call_records
WHERE staff_name = '{STAFF_NAME}'
ORDER BY call_time DESC;
```

### 2. 导出指定日期的通话（全部通话）
```sql
SELECT
    id,
    staff_name,
    department,
    call_time,
    duration,
    call_result,
    CASE WHEN transcript IS NOT NULL THEN '有' ELSE '无' END as 有转写
FROM call_records
WHERE DATE(call_time) = '{DATE}'
ORDER BY call_time;
```

---

## 七、周报专用查询（重要）

> 生成周报时按顺序执行以下查询，确保数据准确
>
> **重要原则**：统计数据基于**全部通话**，质量分析基于**有转写的通话**

### 1. 本周通话总览

```sql
SELECT
    COUNT(*) as 总通话数,
    COUNT(transcript) as 有转写数,
    SUM(duration) as 总时长秒,
    ROUND(AVG(duration)::numeric, 1) as 平均时长秒
FROM call_records
WHERE call_time >= CURRENT_DATE - INTERVAL '7 days';
```

### 2. 员工通话统计（核心数据 - 基于全部通话）

```sql
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

### 3. 数据校验（必须执行）

```sql
-- 验证员工明细加总 = 总数
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
- 如不一致，检查 `staff_name IS NOT NULL` 条件

### 4. 时长分布统计（基于全部通话）

```sql
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

### 5. 每日通话统计

```sql
SELECT
    DATE(call_time) as 日期,
    COUNT(*) as 通话数,
    COUNT(transcript) as 有转写数,
    SUM(duration) as 总时长秒,
    ROUND(AVG(duration)::numeric, 1) as 平均时长
FROM call_records
WHERE call_time >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(call_time)
ORDER BY 日期 DESC;
```

### 6. 深度通话列表（用于质量抽样 - 需要转写）

```sql
-- 质量分析需要转写内容，所以此处保留 transcript IS NOT NULL 条件
SELECT id, staff_name, call_time, duration, call_result
FROM call_records
WHERE call_time >= CURRENT_DATE - INTERVAL '7 days'
  AND transcript IS NOT NULL
  AND duration > 300  -- 超过5分钟
ORDER BY duration DESC
LIMIT 10;
```

### 7. 获取转写并格式化输出

```bash
PGPASSWORD='j7P8djrJwXdOWt5N' psql -h 124.220.15.80 -U postgres -d production -t -A -c "
SELECT transcript FROM call_records WHERE id = {ID};
" | python3 -c "
import json, sys
data = json.loads(sys.stdin.read())
for seg in data[:50]:
    speaker = '【员工】' if seg.get('speaker') == 'staff' else '【客户】'
    print(f\"{speaker} {seg.get('text', '')}\")
if len(data) > 50:
    print(f'\\n... 共 {len(data)} 段对话')
"
```

---

## 八、问题排查查询

### 1. 检查无员工名的通话（全部通话）

```sql
SELECT COUNT(*) as 无员工名通话数
FROM call_records
WHERE staff_name IS NULL;
```

### 2. 检查转写覆盖情况

```sql
-- 统计有无转写的通话数量
SELECT
    CASE WHEN transcript IS NOT NULL THEN '有转写' ELSE '无转写' END as 类型,
    COUNT(*) as 数量,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 1) as 占比
FROM call_records
GROUP BY 1;
```

### 3. 检查员工转写覆盖率

```sql
-- 按员工统计转写覆盖率（排查数据偏差）
SELECT
    staff_name as 员工,
    COUNT(*) as 总通话数,
    COUNT(transcript) as 有转写数,
    ROUND(COUNT(transcript) * 100.0 / COUNT(*), 1) as 转写率
FROM call_records
WHERE staff_name IS NOT NULL
GROUP BY staff_name
ORDER BY 总通话数 DESC;
```

---

## 使用说明

1. **参数替换**：将 `{ID}`、`{STAFF_NAME}`、`{LIMIT}` 等占位符替换为实际值
2. **时间格式**：日期使用 `YYYY-MM-DD`，时间使用 `YYYY-MM-DD HH:MM:SS`
3. **转写字段**：`transcript` 是 JSONB 类型，使用 `->>`、`jsonb_array_elements` 等函数处理
4. **性能考虑**：大数据量查询请添加 `LIMIT` 限制
5. **输出格式**：
   - 默认：表格形式，带表头
   - `-t -A`：无表头，适合脚本处理
   - `-F','`：CSV 格式输出
6. **周报生成**：必须按顺序执行第七节的查询，并进行数据校验

---

## 九、客户/被叫号码查询

> **重要说明**：
> - 被叫手机号存储在 `callee` 字段（**不是** `customer_name`）
> - `customer_name` 字段可能为空，不要用它匹配手机号
> - 手机号匹配使用 `IN ('号码1', '号码2', ...)` 或 `LIKE '%号码%'`

### 1. 按被叫号码列表查询通话记录

```sql
-- 查询指定被叫号码的通话记录
SELECT
    callee as 被叫号码,
    customer_name as 客户名称,
    staff_name as 员工,
    department as 部门,
    call_time as 通话时间,
    duration as 时长秒,
    call_type as 类型,
    call_result as 结果
FROM call_records
WHERE call_time >= '{START_DATE}'
  AND call_time < '{END_DATE}'
  AND callee IN ('{PHONE1}', '{PHONE2}', '{PHONE3}')  -- 精确匹配
ORDER BY call_time DESC;
```

### 2. 按被叫号码列表统计汇总

```sql
-- 统计每个被叫号码的通话情况
SELECT
    callee as 被叫号码,
    COUNT(*) as 通话数,
    COUNT(DISTINCT staff_name) as 对接员工数,
    SUM(duration) as 总时长秒,
    ROUND(AVG(duration)::numeric, 1) as 平均时长秒,
    MAX(call_time) as 最后通话时间
FROM call_records
WHERE call_time >= '{START_DATE}'
  AND call_time < '{END_DATE}'
  AND callee IN ('{PHONE1}', '{PHONE2}', '{PHONE3}')
GROUP BY callee
ORDER BY 通话数 DESC;
```

### 3. 模糊匹配被叫号码（多个号码用 OR）

```sql
-- 模糊匹配多个被叫号码（号码可能带前缀或格式不同时使用）
SELECT callee, COUNT(*) as cnt
FROM call_records
WHERE call_time >= '{START_DATE}'
  AND (
    callee LIKE '%13812345678%' OR
    callee LIKE '%13987654321%'
  )
GROUP BY callee
ORDER BY cnt DESC;
```

### 4. 检查被叫号码是否存在

```sql
-- 先检查号码是否存在于系统中（不限时间）
SELECT DISTINCT callee
FROM call_records
WHERE callee IN ('{PHONE1}', '{PHONE2}', '{PHONE3}');
```

### 5. 被叫号码详细分析报告

```sql
-- 生成被叫号码分析报告
WITH phone_stats AS (
    SELECT
        callee,
        COUNT(*) as total_calls,
        COUNT(DISTINCT staff_name) as staff_count,
        SUM(duration) as total_duration,
        SUM(CASE WHEN duration >= 60 THEN 1 ELSE 0 END) as effective_calls,
        MAX(call_time) as last_call_time
    FROM call_records
    WHERE callee IN ('{PHONE1}', '{PHONE2}', '{PHONE3}')
    GROUP BY callee
)
SELECT
    callee as 被叫号码,
    total_calls as 总通话数,
    staff_count as 对接员工数,
    total_duration as 总时长秒,
    ROUND(total_duration / 60.0, 1) as 总时长分钟,
    effective_calls as 有效通话数,
    ROUND(effective_calls * 100.0 / total_calls, 1) as 有效率,
    last_call_time as 最后通话时间
FROM phone_stats
ORDER BY total_calls DESC;
