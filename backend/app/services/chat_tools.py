"""AI 对话工具定义

定义 AI 可调用的工具函数 (Function Calling)。
支持查询通话记录、统计数据等操作。
"""

import json
from datetime import date, datetime, timedelta
from typing import Any

from loguru import logger
from sqlmodel import Session, select

from app.models.call_record import CallRecord
from app.models.staff import Staff, StaffMapping

# ============ 工具定义 ============

CHAT_TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "get_current_date",
            "description": "获取当前日期和时间，用于计算相对日期（如'最近一周'）",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_call_records",
            "description": "查询通话记录数据。可按日期范围、员工、部门、校区等条件筛选。",
            "parameters": {
                "type": "object",
                "properties": {
                    "start_date": {
                        "type": "string",
                        "description": "开始日期，格式 YYYY-MM-DD",
                    },
                    "end_date": {
                        "type": "string",
                        "description": "结束日期，格式 YYYY-MM-DD",
                    },
                    "staff_name": {
                        "type": "string",
                        "description": "员工姓名（支持模糊匹配）",
                    },
                    "department": {
                        "type": "string",
                        "description": "部门名称（支持模糊匹配）",
                    },
                    "campus": {
                        "type": "string",
                        "description": "校区名称，如'西南楼'或'赛顿中心'",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "返回记录数量限制，默认 20，最大 100",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_call_statistics",
            "description": "获取通话统计数据，包括通话数量、总时长、平均时长等。可按天、员工、部门分组统计。",
            "parameters": {
                "type": "object",
                "properties": {
                    "start_date": {
                        "type": "string",
                        "description": "开始日期，格式 YYYY-MM-DD",
                    },
                    "end_date": {
                        "type": "string",
                        "description": "结束日期，格式 YYYY-MM-DD",
                    },
                    "group_by": {
                        "type": "string",
                        "enum": ["day", "staff", "department", "campus"],
                        "description": "分组方式：day(按天)、staff(按员工)、department(按部门)、campus(按校区)",
                    },
                    "staff_name": {
                        "type": "string",
                        "description": "筛选特定员工",
                    },
                    "department": {
                        "type": "string",
                        "description": "筛选特定部门",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_staff_list",
            "description": "获取员工列表，包括姓名、当前职位、部门、校区等信息",
            "parameters": {
                "type": "object",
                "properties": {
                    "department": {
                        "type": "string",
                        "description": "按部门筛选",
                    },
                    "campus": {
                        "type": "string",
                        "description": "按校区筛选",
                    },
                    "is_active": {
                        "type": "boolean",
                        "description": "是否在职，默认只返回在职员工",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_call_ranking",
            "description": "获取通话排行榜，按通话数量或总时长排名",
            "parameters": {
                "type": "object",
                "properties": {
                    "start_date": {
                        "type": "string",
                        "description": "开始日期，格式 YYYY-MM-DD",
                    },
                    "end_date": {
                        "type": "string",
                        "description": "结束日期，格式 YYYY-MM-DD",
                    },
                    "rank_by": {
                        "type": "string",
                        "enum": ["count", "duration"],
                        "description": "排名依据：count(通话数量)、duration(通话时长)",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "返回前 N 名，默认 10",
                    },
                },
                "required": [],
            },
        },
    },
]


# ============ 工具执行函数 ============


async def execute_tool(session: Session, tool_name: str, arguments: str | dict) -> str:
    """执行工具调用并返回结果

    Args:
        session: 数据库会话
        tool_name: 工具名称
        arguments: 工具参数 (JSON 字符串或字典)

    Returns:
        str: 工具执行结果 (JSON 字符串)
    """
    # 解析参数
    if isinstance(arguments, str):
        try:
            args = json.loads(arguments) if arguments else {}
        except json.JSONDecodeError:
            args = {}
    else:
        args = arguments or {}

    logger.info(f"执行工具: {tool_name}, 参数: {args}")

    try:
        if tool_name == "get_current_date":
            result = _get_current_date()
        elif tool_name == "query_call_records":
            result = _query_call_records(session, **args)
        elif tool_name == "get_call_statistics":
            result = _get_call_statistics(session, **args)
        elif tool_name == "get_staff_list":
            result = _get_staff_list(session, **args)
        elif tool_name == "get_call_ranking":
            result = _get_call_ranking(session, **args)
        else:
            result = {"error": f"未知工具: {tool_name}"}

        return json.dumps(result, ensure_ascii=False, default=str)

    except Exception as e:
        logger.error(f"工具执行错误: {tool_name}, {e}")
        return json.dumps({"error": str(e)}, ensure_ascii=False)


def _get_current_date() -> dict:
    """获取当前日期"""
    now = datetime.now()
    return {
        "date": now.strftime("%Y-%m-%d"),
        "time": now.strftime("%H:%M:%S"),
        "weekday": ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][
            now.weekday()
        ],
        "week_start": (now - timedelta(days=now.weekday())).strftime("%Y-%m-%d"),
        "month_start": now.strftime("%Y-%m-01"),
    }


def _query_call_records(
    session: Session,
    start_date: str | None = None,
    end_date: str | None = None,
    staff_name: str | None = None,
    department: str | None = None,
    campus: str | None = None,
    limit: int = 20,
) -> dict:
    """查询通话记录"""
    query = select(CallRecord)

    # 日期筛选
    if start_date:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d")
        query = query.where(CallRecord.call_time >= start_dt)

    if end_date:
        end_dt = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
        query = query.where(CallRecord.call_time < end_dt)

    # 员工筛选
    if staff_name:
        query = query.where(CallRecord.staff_name.ilike(f"%{staff_name}%"))

    # 部门筛选
    if department:
        query = query.where(
            (CallRecord.department.ilike(f"%{department}%"))
            | (CallRecord.mapped_department.ilike(f"%{department}%"))
        )

    # 校区筛选
    if campus:
        query = query.where(CallRecord.mapped_campus.ilike(f"%{campus}%"))

    # 限制数量
    limit = min(limit, 100)
    query = query.order_by(CallRecord.call_time.desc()).limit(limit)

    records = session.exec(query).all()

    # 格式化返回
    return {
        "total": len(records),
        "records": [
            {
                "id": r.id,
                "call_time": r.call_time.strftime("%Y-%m-%d %H:%M")
                if r.call_time
                else None,
                "staff_name": r.staff_name,
                "customer_name": r.customer_name,
                "duration": r.duration,
                "duration_min": round(r.duration / 60, 1) if r.duration else 0,
                "call_type": r.call_type,
                "call_result": r.call_result,
                "department": r.mapped_department or r.department,
                "campus": r.mapped_campus,
            }
            for r in records
        ],
    }


def _get_call_statistics(
    session: Session,
    start_date: str | None = None,
    end_date: str | None = None,
    group_by: str | None = None,
    staff_name: str | None = None,
    department: str | None = None,
) -> dict:
    """获取通话统计"""
    # 基础查询
    base_query = select(CallRecord)

    # 日期筛选
    if start_date:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d")
        base_query = base_query.where(CallRecord.call_time >= start_dt)

    if end_date:
        end_dt = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
        base_query = base_query.where(CallRecord.call_time < end_dt)

    if staff_name:
        base_query = base_query.where(CallRecord.staff_name.ilike(f"%{staff_name}%"))

    if department:
        base_query = base_query.where(
            (CallRecord.department.ilike(f"%{department}%"))
            | (CallRecord.mapped_department.ilike(f"%{department}%"))
        )

    # 获取总体统计
    records = session.exec(base_query).all()

    total_count = len(records)
    total_duration = sum(r.duration or 0 for r in records)
    avg_duration = total_duration / total_count if total_count > 0 else 0

    result = {
        "total_count": total_count,
        "total_duration_seconds": total_duration,
        "total_duration_hours": round(total_duration / 3600, 2),
        "avg_duration_seconds": round(avg_duration, 1),
        "avg_duration_minutes": round(avg_duration / 60, 2),
    }

    # 分组统计
    if group_by == "day":
        day_stats: dict[str, dict] = {}
        for r in records:
            if r.call_time:
                day_key = r.call_time.strftime("%Y-%m-%d")
                if day_key not in day_stats:
                    day_stats[day_key] = {"count": 0, "duration": 0}
                day_stats[day_key]["count"] += 1
                day_stats[day_key]["duration"] += r.duration or 0

        result["by_day"] = [
            {
                "date": k,
                "count": v["count"],
                "duration_hours": round(v["duration"] / 3600, 2),
            }
            for k, v in sorted(day_stats.items())
        ]

    elif group_by == "staff":
        staff_stats: dict[str, dict] = {}
        for r in records:
            name = r.staff_name or "未知"
            if name not in staff_stats:
                staff_stats[name] = {"count": 0, "duration": 0}
            staff_stats[name]["count"] += 1
            staff_stats[name]["duration"] += r.duration or 0

        result["by_staff"] = [
            {
                "staff_name": k,
                "count": v["count"],
                "duration_hours": round(v["duration"] / 3600, 2),
            }
            for k, v in sorted(
                staff_stats.items(), key=lambda x: x[1]["count"], reverse=True
            )
        ]

    elif group_by == "department":
        dept_stats: dict[str, dict] = {}
        for r in records:
            dept = r.mapped_department or r.department or "未知"
            if dept not in dept_stats:
                dept_stats[dept] = {"count": 0, "duration": 0}
            dept_stats[dept]["count"] += 1
            dept_stats[dept]["duration"] += r.duration or 0

        result["by_department"] = [
            {
                "department": k,
                "count": v["count"],
                "duration_hours": round(v["duration"] / 3600, 2),
            }
            for k, v in sorted(
                dept_stats.items(), key=lambda x: x[1]["count"], reverse=True
            )
        ]

    elif group_by == "campus":
        campus_stats: dict[str, dict] = {}
        for r in records:
            campus_name = r.mapped_campus or "未知"
            if campus_name not in campus_stats:
                campus_stats[campus_name] = {"count": 0, "duration": 0}
            campus_stats[campus_name]["count"] += 1
            campus_stats[campus_name]["duration"] += r.duration or 0

        result["by_campus"] = [
            {
                "campus": k,
                "count": v["count"],
                "duration_hours": round(v["duration"] / 3600, 2),
            }
            for k, v in sorted(
                campus_stats.items(), key=lambda x: x[1]["count"], reverse=True
            )
        ]

    return result


def _get_staff_list(
    session: Session,
    department: str | None = None,
    campus: str | None = None,
    is_active: bool = True,
) -> dict:
    """获取员工列表"""
    query = select(Staff)

    if is_active is not None:
        query = query.where(Staff.is_active == is_active)

    staff_list = session.exec(query).all()

    # 获取当前有效的映射
    today = date.today()
    result_list = []

    for staff in staff_list:
        # 查询当前有效的映射
        mapping_query = (
            select(StaffMapping)
            .where(StaffMapping.staff_id == staff.id)
            .where(StaffMapping.effective_from <= today)
            .where(
                (StaffMapping.effective_to.is_(None))
                | (StaffMapping.effective_to >= today)
            )
            .order_by(StaffMapping.effective_from.desc())
        )
        current_mapping = session.exec(mapping_query).first()

        # 筛选
        if department and current_mapping:
            if department.lower() not in (current_mapping.department or "").lower():
                continue

        if campus and current_mapping:
            if campus.lower() not in (current_mapping.campus or "").lower():
                continue

        result_list.append(
            {
                "id": staff.id,
                "name": staff.name,
                "phone": staff.phone,
                "is_active": staff.is_active,
                "position": current_mapping.position if current_mapping else None,
                "department": current_mapping.department if current_mapping else None,
                "campus": current_mapping.campus if current_mapping else None,
            }
        )

    return {
        "total": len(result_list),
        "staff": result_list,
    }


def _get_call_ranking(
    session: Session,
    start_date: str | None = None,
    end_date: str | None = None,
    rank_by: str = "count",
    limit: int = 10,
) -> dict:
    """获取通话排行榜"""
    query = select(CallRecord)

    # 日期筛选
    if start_date:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d")
        query = query.where(CallRecord.call_time >= start_dt)

    if end_date:
        end_dt = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
        query = query.where(CallRecord.call_time < end_dt)

    records = session.exec(query).all()

    # 按员工聚合
    staff_stats: dict[str, dict] = {}
    for r in records:
        name = r.staff_name or "未知"
        if name not in staff_stats:
            staff_stats[name] = {"count": 0, "duration": 0}
        staff_stats[name]["count"] += 1
        staff_stats[name]["duration"] += r.duration or 0

    # 排序
    if rank_by == "duration":
        sorted_stats = sorted(
            staff_stats.items(), key=lambda x: x[1]["duration"], reverse=True
        )
    else:
        sorted_stats = sorted(
            staff_stats.items(), key=lambda x: x[1]["count"], reverse=True
        )

    # 限制数量
    top_n = sorted_stats[:limit]

    return {
        "rank_by": "通话时长" if rank_by == "duration" else "通话数量",
        "ranking": [
            {
                "rank": i + 1,
                "staff_name": name,
                "count": stats["count"],
                "duration_hours": round(stats["duration"] / 3600, 2),
            }
            for i, (name, stats) in enumerate(top_n)
        ],
    }
