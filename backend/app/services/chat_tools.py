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
            "description": "查询通话记录数据。可按日期范围、被叫号码、员工、部门、校区等条件筛选。",
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
                    "callee": {
                        "type": "string",
                        "description": "被叫号码/客户手机号，多个号码用逗号分隔。注意：被叫号码存储在 callee 字段，不是 customer_name",
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
    {
        "type": "function",
        "function": {
            "name": "query_by_callee",
            "description": "按被叫号码（客户手机号）查询通话统计。用于分析特定客户的通话情况。",
            "parameters": {
                "type": "object",
                "properties": {
                    "callee_list": {
                        "type": "string",
                        "description": "被叫号码列表，多个号码用逗号分隔，如 '13800138000,13900139000'",
                    },
                    "start_date": {
                        "type": "string",
                        "description": "开始日期，格式 YYYY-MM-DD",
                    },
                    "end_date": {
                        "type": "string",
                        "description": "结束日期，格式 YYYY-MM-DD",
                    },
                },
                "required": ["callee_list"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_call_transcripts",
            "description": "获取通话转录文稿内容。用于分析通话的具体对话内容、关键话题等。",
            "parameters": {
                "type": "object",
                "properties": {
                    "callee_list": {
                        "type": "string",
                        "description": "被叫号码列表，多个号码用逗号分隔",
                    },
                    "staff_name": {
                        "type": "string",
                        "description": "筛选特定员工的通话",
                    },
                    "min_duration": {
                        "type": "integer",
                        "description": "最小通话时长(秒)，默认60秒",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "返回记录数量限制，默认5条",
                    },
                },
                "required": ["callee_list"],
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
        elif tool_name == "query_by_callee":
            result = _query_by_callee(session, **args)
        elif tool_name == "get_call_transcripts":
            result = _get_call_transcripts(session, **args)
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
    callee: str | None = None,
    staff_name: str | None = None,
    department: str | None = None,
    campus: str | None = None,
    limit: int = 20,
) -> dict:
    """查询通话记录"""
    from sqlalchemy import or_

    query = select(CallRecord)

    # 日期筛选
    if start_date:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d")
        query = query.where(CallRecord.call_time >= start_dt)

    if end_date:
        end_dt = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
        query = query.where(CallRecord.call_time < end_dt)

    # 被叫号码筛选（支持多个号码，逗号分隔）
    if callee:
        # 清理和分割号码
        phone_list = [p.strip() for p in callee.replace("，", ",").split(",") if p.strip()]
        if phone_list:
            if len(phone_list) == 1:
                # 单个号码，使用模糊匹配
                query = query.where(CallRecord.callee.ilike(f"%{phone_list[0]}%"))
            else:
                # 多个号码，使用 OR 条件
                conditions = [CallRecord.callee.ilike(f"%{p}%") for p in phone_list]
                query = query.where(or_(*conditions))

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

    # 格式化返回（包含 callee 字段）
    return {
        "total": len(records),
        "records": [
            {
                "id": r.id,
                "call_time": r.call_time.strftime("%Y-%m-%d %H:%M")
                if r.call_time
                else None,
                "callee": r.callee,  # 被叫号码
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


def _query_by_callee(
    session: Session,
    callee_list: str,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict:
    """按被叫号码查询通话统计

    Args:
        session: 数据库会话
        callee_list: 被叫号码列表，逗号分隔
        start_date: 开始日期
        end_date: 结束日期

    Returns:
        dict: 每个号码的通话统计
    """
    # 解析号码列表
    phones = [p.strip() for p in callee_list.replace("，", ",").split(",") if p.strip()]

    if not phones:
        return {"error": "请提供被叫号码列表", "total": 0, "results": []}

    # 构建查询
    query = select(CallRecord)

    # 日期筛选
    if start_date:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d")
        query = query.where(CallRecord.call_time >= start_dt)

    if end_date:
        end_dt = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
        query = query.where(CallRecord.call_time < end_dt)

    # 被叫号码筛选（精确匹配）
    if len(phones) == 1:
        query = query.where(CallRecord.callee == phones[0])
    else:
        query = query.where(CallRecord.callee.in_(phones))

    records = session.exec(query).all()

    # 按被叫号码聚合统计
    callee_stats: dict[str, dict] = {}
    for r in records:
        phone = r.callee
        if phone not in callee_stats:
            callee_stats[phone] = {
                "count": 0,
                "duration": 0,
                "staff_set": set(),
                "last_call_time": None,
                "effective_count": 0,  # 有效通话数（>=60秒）
            }
        stats = callee_stats[phone]
        stats["count"] += 1
        stats["duration"] += r.duration or 0
        if r.staff_name:
            stats["staff_set"].add(r.staff_name)
        if r.duration and r.duration >= 60:
            stats["effective_count"] += 1
        if r.call_time:
            if stats["last_call_time"] is None or r.call_time > stats["last_call_time"]:
                stats["last_call_time"] = r.call_time

    # 格式化结果
    results = []
    for phone in phones:
        if phone in callee_stats:
            stats = callee_stats[phone]
            cnt = stats["count"]
            avg_dur = round(stats["duration"] / cnt, 1) if cnt > 0 else 0
            eff_rate = round(stats["effective_count"] * 100 / cnt, 1) if cnt > 0 else 0
            last_time = stats["last_call_time"]
            results.append({
                "callee": phone,
                "call_count": cnt,
                "total_duration_seconds": stats["duration"],
                "total_duration_minutes": round(stats["duration"] / 60, 1),
                "avg_duration_seconds": avg_dur,
                "staff_count": len(stats["staff_set"]),
                "staff_names": list(stats["staff_set"]),
                "effective_call_count": stats["effective_count"],
                "effective_rate": eff_rate,
                "last_call_time": last_time.strftime("%Y-%m-%d %H:%M") if last_time else None,
            })
        else:
            results.append({
                "callee": phone,
                "call_count": 0,
                "total_duration_seconds": 0,
                "total_duration_minutes": 0,
                "avg_duration_seconds": 0,
                "staff_count": 0,
                "staff_names": [],
                "effective_call_count": 0,
                "effective_rate": 0,
                "last_call_time": None,
                "note": "未找到该号码的通话记录",
            })

    # 统计汇总
    found_count = sum(1 for r in results if r["call_count"] > 0)
    total_calls = sum(r["call_count"] for r in results)
    total_duration = sum(r["total_duration_seconds"] for r in results)

    return {
        "query_phones": len(phones),
        "found_phones": found_count,
        "not_found_phones": len(phones) - found_count,
        "total_calls": total_calls,
        "total_duration_minutes": round(total_duration / 60, 1),
        "results": results,
    }


def _get_call_transcripts(
    session: Session,
    callee_list: str,
    staff_name: str | None = None,
    min_duration: int = 60,
    limit: int = 5,
) -> dict:
    """获取通话转录文稿内容

    Args:
        session: 数据库会话
        callee_list: 被叫号码列表，逗号分隔
        staff_name: 筛选特定员工
        min_duration: 最小通话时长(秒)
        limit: 返回记录数量限制

    Returns:
        dict: 通话转录内容
    """
    # 解析号码列表
    phones = [
        p.strip() for p in callee_list.replace("，", ",").split(",") if p.strip()
    ]

    if not phones:
        return {"error": "请提供被叫号码列表", "total": 0, "transcripts": []}

    # 构建查询
    query = select(CallRecord).where(
        CallRecord.callee.in_(phones),
        CallRecord.transcript.isnot(None),
        CallRecord.duration >= min_duration,
    )

    if staff_name:
        query = query.where(CallRecord.staff_name.ilike(f"%{staff_name}%"))

    # 按时长降序排列，优先返回较长的通话
    query = query.order_by(CallRecord.duration.desc()).limit(min(limit, 10))

    records = session.exec(query).all()

    if not records:
        return {
            "total": 0,
            "message": "未找到符合条件的通话转录记录",
            "hint": "可能原因：1. 号码无通话记录 2. 通话时长过短 3. 未完成转录",
            "transcripts": [],
        }

    # 格式化转录内容
    transcripts = []
    for r in records:
        # 解析转录内容
        transcript_data = r.transcript
        if not transcript_data:
            continue

        # 将转录列表转换为对话格式
        dialogue = []
        for item in transcript_data:
            speaker = "客户" if item.get("speaker") == "customer" else "员工"
            text = item.get("text", "")
            if text:
                dialogue.append(f"【{speaker}】{text}")

        # 合并为完整对话文本
        full_dialogue = "\n".join(dialogue)

        # 提取关键信息
        staff_lines = [
            item.get("text", "")
            for item in transcript_data
            if item.get("speaker") == "staff"
        ]
        customer_lines = [
            item.get("text", "")
            for item in transcript_data
            if item.get("speaker") == "customer"
        ]

        transcripts.append({
            "callee": r.callee,
            "staff_name": r.staff_name,
            "call_time": r.call_time.strftime("%Y-%m-%d %H:%M") if r.call_time else None,
            "duration_seconds": r.duration,
            "duration_minutes": round(r.duration / 60, 1) if r.duration else 0,
            "dialogue_count": len(transcript_data),
            "staff_dialogue_count": len(staff_lines),
            "customer_dialogue_count": len(customer_lines),
            "full_dialogue": full_dialogue,
            "summary": {
                "total_turns": len(transcript_data),
                "staff_words": sum(len(line) for line in staff_lines),
                "customer_words": sum(len(line) for line in customer_lines),
            },
        })

    return {
        "total": len(transcripts),
        "transcripts": transcripts,
    }
