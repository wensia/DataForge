"""通话记录分析工具

为 DeepSeek Function Calling 提供 SQL 查询工具。
"""

import re
from typing import Any

from loguru import logger
from sqlmodel import Session, text

# 允许查询的表白名单
ALLOWED_TABLES = {"call_records", "staff", "departments"}

# 禁止的 SQL 关键字
FORBIDDEN_KEYWORDS = {
    "DROP",
    "DELETE",
    "UPDATE",
    "INSERT",
    "TRUNCATE",
    "ALTER",
    "CREATE",
    "GRANT",
    "REVOKE",
    "EXEC",
    "EXECUTE",
    "INTO",
    "FILE",
    "LOAD",
    "OUTFILE",
    "DUMPFILE",
}

# 敏感字段（不返回）
SENSITIVE_FIELDS = {"raw_data", "api_key", "password", "secret"}


# ============================================================
# 工具定义 (Function Calling Schema)
# ============================================================

CALL_RECORD_TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "execute_call_record_query",
            "description": """执行通话记录 SQL 查询。用于查询员工通话统计、被叫号码分析、时长分布等。

重要说明：
- 被叫手机号存储在 callee 字段（不是 customer_name）
- customer_name 字段可能为空，不要用它匹配手机号
- 仅支持 SELECT 查询
- 返回最多 1000 行数据""",
            "parameters": {
                "type": "object",
                "properties": {
                    "sql": {
                        "type": "string",
                        "description": "要执行的 SQL SELECT 查询语句",
                    },
                    "description": {
                        "type": "string",
                        "description": "查询目的说明（用于日志记录）",
                    },
                },
                "required": ["sql", "description"],
            },
        },
    },
]


# ============================================================
# SQL 安全验证
# ============================================================


def validate_sql(sql: str) -> tuple[bool, str]:
    """验证 SQL 查询是否安全

    Args:
        sql: SQL 查询语句

    Returns:
        (is_valid, error_message)
    """
    sql_upper = sql.upper().strip()

    # 1. 必须以 SELECT 开头
    if not sql_upper.startswith("SELECT"):
        return False, "仅支持 SELECT 查询"

    # 2. 检查禁止的关键字
    for keyword in FORBIDDEN_KEYWORDS:
        # 使用单词边界匹配，避免误判（如 "UPDATE" 在列名中）
        pattern = rf"\b{keyword}\b"
        if re.search(pattern, sql_upper):
            return False, f"查询包含禁止的操作: {keyword}"

    # 3. 检查表名白名单
    # 提取 FROM 子句中的表名
    from_match = re.search(r"\bFROM\s+([a-zA-Z_][a-zA-Z0-9_]*)", sql_upper)
    if from_match:
        table_name = from_match.group(1).lower()
        if table_name not in ALLOWED_TABLES:
            return False, f"不允许查询表: {table_name}，允许的表: {', '.join(ALLOWED_TABLES)}"

    # 4. 检查 JOIN 子句中的表名
    join_tables = re.findall(r"\bJOIN\s+([a-zA-Z_][a-zA-Z0-9_]*)", sql_upper)
    for table in join_tables:
        if table.lower() not in ALLOWED_TABLES:
            return False, f"不允许 JOIN 表: {table.lower()}"

    # 5. 检查敏感字段
    for field in SENSITIVE_FIELDS:
        if field in sql.lower():
            return False, f"不允许查询敏感字段: {field}"

    return True, ""


def sanitize_sql(sql: str) -> str:
    """清理 SQL 查询，添加必要的限制

    Args:
        sql: 原始 SQL 查询

    Returns:
        添加了 LIMIT 限制的 SQL
    """
    sql = sql.strip().rstrip(";")

    # 如果没有 LIMIT，添加默认限制
    if "LIMIT" not in sql.upper():
        sql = f"{sql} LIMIT 1000"

    return sql


# ============================================================
# 工具执行函数
# ============================================================


async def execute_call_record_query(
    session: Session,
    sql: str,
    description: str = "",
) -> dict[str, Any]:
    """执行通话记录 SQL 查询

    Args:
        session: 数据库会话
        sql: SQL 查询语句
        description: 查询目的说明

    Returns:
        查询结果字典: {
            "success": bool,
            "data": list[dict] | None,
            "row_count": int,
            "error": str | None
        }
    """
    logger.info(f"执行 SQL 查询: {description}")
    logger.debug(f"SQL: {sql}")

    # 1. 验证 SQL
    is_valid, error_msg = validate_sql(sql)
    if not is_valid:
        logger.warning(f"SQL 验证失败: {error_msg}")
        return {
            "success": False,
            "data": None,
            "row_count": 0,
            "error": error_msg,
        }

    # 2. 清理 SQL
    safe_sql = sanitize_sql(sql)
    logger.debug(f"Safe SQL: {safe_sql}")

    # 3. 执行查询
    try:
        result = session.exec(text(safe_sql))

        # 获取列名
        columns = list(result.keys()) if hasattr(result, "keys") else []

        # 获取数据
        rows = result.fetchall()

        # 转换为字典列表
        data = []
        for row in rows:
            row_dict = {}
            for i, col in enumerate(columns):
                value = row[i]
                # 处理特殊类型
                if hasattr(value, "isoformat"):  # datetime
                    value = value.isoformat()
                elif isinstance(value, bytes):
                    value = value.decode("utf-8", errors="ignore")
                row_dict[col] = value
            data.append(row_dict)

        logger.info(f"查询成功，返回 {len(data)} 行数据")

        return {
            "success": True,
            "data": data,
            "row_count": len(data),
            "error": None,
        }

    except Exception as e:
        error_msg = str(e)
        logger.error(f"SQL 执行错误: {error_msg}")
        return {
            "success": False,
            "data": None,
            "row_count": 0,
            "error": f"查询执行失败: {error_msg}",
        }


async def execute_tool(
    tool_name: str,
    tool_args: dict[str, Any],
    session: Session,
) -> dict[str, Any]:
    """执行指定的工具

    Args:
        tool_name: 工具名称
        tool_args: 工具参数
        session: 数据库会话

    Returns:
        工具执行结果
    """
    if tool_name == "execute_call_record_query":
        return await execute_call_record_query(
            session=session,
            sql=tool_args.get("sql", ""),
            description=tool_args.get("description", ""),
        )
    else:
        return {
            "success": False,
            "error": f"未知工具: {tool_name}",
        }
