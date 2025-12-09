"""云客外呼记录同步到 PostgreSQL 数据库

将云客通话记录同步到 PostgreSQL 数据库，支持增量同步（按通话记录ID去重）。

使用示例:
    手动触发时传入参数:
    {
        "yunke_account_id": 1,
        "start_time": "2025-12-01 00:00",
        "end_time": "2025-12-08 23:59",
        "page_size": 50,
        "call_type": "s"
    }
"""

import json
from datetime import datetime

from sqlmodel import Session, select

from app.clients.yunke import CallLogClient
from app.database import engine
from app.models import CallRecord, YunkeAccount, YunkeCompany
from app.scheduler import task_log
from app.services.account_service import auto_login

from scripts._utils import normalize_time_param

# 任务元信息
TASK_INFO = {
    "name": "云客通话记录同步(PostgreSQL)",
    "description": "将云客外呼记录同步到 PostgreSQL 数据库",
}

# 字段映射配置（保留全部字段）
FIELD_MAPPING = [
    {
        "yunke_field": "id",
        "db_name": "通话记录ID",
        "is_unique": True,
    },
    {
        "yunke_field": "callNumber",
        "db_name": "客户电话",
    },
    {
        "yunke_field": "planCustomerName",
        "db_name": "客户名称",
    },
    {
        "yunke_field": "planCustomerCompany",
        "db_name": "客户公司",
    },
    {
        "yunke_field": "userIdName",
        "db_name": "坐席名称",
    },
    {
        "yunke_field": "departmentList",
        "db_name": "部门",
    },
    {
        "yunke_field": "callStatus",
        "db_name": "通话状态",
    },
    {
        "yunke_field": "startCallTime",
        "db_name": "通话时间",
    },
    {
        "yunke_field": "callSeconds",
        "db_name": "通话时长(秒)",
    },
    {
        "yunke_field": "callDuration",
        "db_name": "通话时长",
    },
    {
        "yunke_field": "progress",
        "db_name": "销售进度",
    },
    {
        "yunke_field": "simPhone",
        "db_name": "拨打号码",
    },
    {
        "yunke_field": "createdTime",
        "db_name": "创建时间",
    },
    {
        "yunke_field": "ringSecond",
        "db_name": "振铃时长(秒)",
    },
    {
        "yunke_field": "incomingCall",
        "db_name": "呼入标记",
    },
    {
        "yunke_field": "recordFile",
        "db_name": "录音地址",
    },
]


def _parse_datetime(dt_str: str) -> datetime | None:
    """解析日期时间字符串为 datetime 对象

    Args:
        dt_str: 日期时间字符串，格式 "YYYY-MM-DD HH:mm:ss"

    Returns:
        datetime | None: datetime 对象，解析失败返回 None
    """
    if not dt_str:
        return None

    try:
        return datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        try:
            return datetime.strptime(dt_str, "%Y-%m-%d %H:%M")
        except ValueError:
            return None


def _convert_record(record: dict, field_mapping: list[dict]) -> dict:
    """将云客记录转换为映射后的字段格式

    Args:
        record: 云客通话记录
        field_mapping: 字段映射配置

    Returns:
        dict: 映射后的字段 {"字段名": 值}
    """
    fields = {}

    for mapping in field_mapping:
        yunke_field = mapping["yunke_field"]
        db_name = mapping["db_name"]

        value = record.get(yunke_field)
        if value is None or value == "":
            continue

        fields[db_name] = value

    return fields


def _get_default_time_range() -> tuple[str, str]:
    """获取默认时间范围（今天）

    Returns:
        tuple: (start_time, end_time)
    """
    today = datetime.now()
    start_time = today.strftime("%Y-%m-%d 00:00")
    end_time = today.strftime("%Y-%m-%d 23:59")
    return start_time, end_time


async def run(
    yunke_account_id: int,
    start_time: str = "",
    end_time: str = "",
    page_size: int = 50,
    call_type: str = "s",
) -> dict:
    """云客通话记录同步到 PostgreSQL

    Args:
        yunke_account_id: 云客账号ID（数据库中的 YunkeAccount.id）
        start_time: 开始时间，格式 "YYYY-MM-DD HH:mm"，默认今天 00:00
        end_time: 结束时间，格式 "YYYY-MM-DD HH:mm"，默认今天 23:59
        page_size: 每页记录数，默认 50，最大 200
        call_type: 通话类型，s=外呼，i=呼入，空=全部

    Returns:
        dict: 同步结果统计
    """
    task_log("开始同步云客通话记录到 PostgreSQL")
    task_log(f"参数: yunke_account_id={yunke_account_id}")

    # 处理默认时间
    if not start_time or not end_time:
        default_start, default_end = _get_default_time_range()
        start_time = start_time or default_start
        end_time = end_time or default_end

    # 统一处理时间参数（支持字符串和 datetime 对象）
    start_time = normalize_time_param(start_time, "00:00")
    end_time = normalize_time_param(end_time, "23:59")

    task_log(f"时间范围: {start_time} - {end_time}")

    # 统计结果
    result = {
        "total_fetched": 0,
        "new_records": 0,
        "skipped_records": 0,
        "failed_records": 0,
        "start_time": start_time,
        "end_time": end_time,
    }

    with Session(engine) as session:
        # ========== 1. 验证云客账号 ==========
        yunke_account = session.get(YunkeAccount, yunke_account_id)
        if not yunke_account:
            raise ValueError(f"云客账号 {yunke_account_id} 不存在")

        yunke_company = session.get(YunkeCompany, yunke_account.company_id)
        if not yunke_company:
            raise ValueError(f"云客公司 {yunke_account.company_id} 不存在")

        task_log(f"云客账号: {yunke_account.phone} ({yunke_company.company_name})")

        # ========== 2. 初始化云客客户端 ==========
        # 检查是否已登录
        if not yunke_account.cookies or not yunke_account.user_id:
            task_log("云客账号未登录，尝试自动登录...")
            login_result = await auto_login(yunke_account_id)
            if not login_result["success"]:
                raise ValueError(f"云客自动登录失败: {login_result.get('message')}")
            # 刷新账号信息
            session.refresh(yunke_account)
            task_log("云客自动登录成功")

        # 解析cookies
        cookies = json.loads(yunke_account.cookies) if yunke_account.cookies else {}

        # 创建自动登录回调
        async def auto_login_callback():
            return await auto_login(yunke_account_id)

        yunke_client = CallLogClient(
            phone=yunke_account.phone,
            company_code=yunke_company.company_code,
            user_id=yunke_account.user_id or "",
            cookies=cookies,
            domain=yunke_company.domain if yunke_company.domain else None,
            auto_login_callback=auto_login_callback,
        )

        # ========== 3. 分页获取云客通话记录 ==========
        task_log("开始获取云客通话记录...")

        all_records = []
        page = 1
        page_size = min(page_size, 200)  # 最大200

        while True:
            task_log(f"获取第 {page} 页...", print_console=False)

            response = await yunke_client.get_call_logs(
                start_time=start_time,
                end_time=end_time,
                page=page,
                page_size=page_size,
                call_type=call_type,
            )

            data = response.get("data", {})
            records = data.get("data", [])
            total_count = data.get("totalCount", 0)
            page_count = data.get("pageCount", 0)

            all_records.extend(records)

            if page == 1:
                task_log(f"总计 {total_count} 条记录，{page_count} 页")

            if page >= page_count:
                break

            page += 1

        result["total_fetched"] = len(all_records)
        task_log(f"获取完成，共 {len(all_records)} 条记录")

        if not all_records:
            task_log("没有获取到任何记录，同步结束")
            return result

        # ========== 4. 去重检查 ==========
        task_log("开始去重检查...")

        # 提取所有记录的唯一标识
        record_ids = [str(r.get("id", "")) for r in all_records if r.get("id")]

        # 查询数据库中已存在的记录
        existing_records = session.exec(
            select(CallRecord.record_id)
            .where(CallRecord.source == "yunke")
            .where(CallRecord.record_id.in_(record_ids))
        ).all()
        existing_ids = set(existing_records)

        task_log(f"已存在 {len(existing_ids)} 条记录")

        # 过滤出需要新增的记录
        new_records = [
            r for r in all_records if str(r.get("id", "")) not in existing_ids
        ]

        result["skipped_records"] = len(all_records) - len(new_records)
        task_log(f"需要新增 {len(new_records)} 条记录")

        if not new_records:
            task_log("所有记录已存在，同步结束")
            return result

        # ========== 5. 批量写入数据库 ==========
        task_log("开始批量写入数据库...")

        total_created = 0
        batch_size = 500

        for i in range(0, len(new_records), batch_size):
            batch = new_records[i : i + batch_size]
            batch_num = i // batch_size + 1

            try:
                for record in batch:
                    # 使用 FIELD_MAPPING 转换字段
                    mapped_data = _convert_record(record, FIELD_MAPPING)

                    # 创建 CallRecord 对象
                    call_record = CallRecord(
                        source="yunke",
                        record_id=str(record.get("id", "")),
                        caller=str(record.get("simPhone", "")) or None,
                        callee=str(record.get("callNumber", "")) or None,
                        call_time=_parse_datetime(record.get("startCallTime", "")),
                        duration=record.get("callSeconds"),
                        call_type=(
                            "outbound" if record.get("incomingCall") == 0 else "inbound"
                        ),
                        call_result=str(record.get("callStatus", "")) or None,
                        customer_name=record.get("planCustomerName") or None,
                        staff_name=record.get("userIdName") or None,
                        department=record.get("departmentList") or None,
                        raw_data=mapped_data,
                    )
                    session.add(call_record)

                session.commit()
                total_created += len(batch)
                task_log(f"批次 {batch_num} 写入成功: {len(batch)} 条")

            except Exception as e:
                session.rollback()
                result["failed_records"] += len(batch)
                task_log(f"批次 {batch_num} 写入失败: {e}")

        result["new_records"] = total_created

        # ========== 6. 完成 ==========
        task_log(
            f"同步完成: 总计 {result['total_fetched']}, "
            f"新增 {result['new_records']}, "
            f"跳过 {result['skipped_records']}, "
            f"失败 {result['failed_records']}"
        )

        return result
