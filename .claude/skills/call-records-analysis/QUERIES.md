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

### 3. 有转写记录的员工统计
```sql
SELECT
    staff_name as 员工,
    COUNT(*) as 通话数,
    SUM(duration) as 总时长秒,
    ROUND(AVG(duration)) as 平均时长秒
FROM call_records
WHERE transcript IS NOT NULL AND staff_name IS NOT NULL
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

### 1. 查找长通话（可能是优质案例）
```sql
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

### 2. 查找短通话（可能需要改进）
```sql
SELECT
    id,
    staff_name,
    call_time,
    duration,
    call_result
FROM call_records
WHERE transcript IS NOT NULL
  AND duration < 60  -- 不足1分钟
ORDER BY duration ASC
LIMIT 10;
```

### 3. 按通话结果筛选
```sql
-- 接通的通话
SELECT id, staff_name, call_time, duration, transcript
FROM call_records
WHERE transcript IS NOT NULL
  AND call_result LIKE '%接通%'
ORDER BY call_time DESC
LIMIT 10;

-- 未接通的通话
SELECT id, staff_name, call_time, duration, transcript
FROM call_records
WHERE transcript IS NOT NULL
  AND call_result LIKE '%未接通%'
ORDER BY call_time DESC
LIMIT 10;
```

### 4. 随机抽样分析
```sql
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

### 1. 导出员工通话列表（不含转写内容）
```sql
SELECT
    id,
    staff_name,
    call_time,
    duration,
    call_type,
    call_result,
    customer_name
FROM call_records
WHERE staff_name = '{STAFF_NAME}'
  AND transcript IS NOT NULL
ORDER BY call_time DESC;
```

### 2. 导出指定日期的通话
```sql
SELECT
    id,
    staff_name,
    department,
    call_time,
    duration,
    call_result
FROM call_records
WHERE DATE(call_time) = '{DATE}'
  AND transcript IS NOT NULL
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

### 1. 检查无员工名的通话

```sql
SELECT COUNT(*) as 无员工名通话数
FROM call_records
WHERE transcript IS NOT NULL AND staff_name IS NULL;
```

### 2. 检查空转写数组

```sql
SELECT COUNT(*) as 空转写数
FROM call_records
WHERE transcript IS NOT NULL
  AND jsonb_array_length(transcript) = 0;
```

### 3. 检查有效转写数量

```sql
SELECT COUNT(*) as 有效转写数
FROM call_records
WHERE transcript IS NOT NULL
  AND jsonb_array_length(transcript) > 0;
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
