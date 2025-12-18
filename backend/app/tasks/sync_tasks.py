"""数据同步任务

包含账号同步、通话记录同步等任务。

所有任务使用 @celery_app.task 装饰器静态注册，
由 DatabaseScheduler 根据数据库配置动态调度。
"""

import json
from datetime import datetime

from loguru import logger
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlmodel import Session, select

from app.celery_app import celery_app
from app.config import settings
from app.database import engine
from app.models import CallRecord, YunkeAccount, YunkeCompany
from app.scheduler import task_log
from app.tasks.base import DataForgeTask
from app.utils.async_helper import run_async


# ============================================================================
# 账号同步任务
# ============================================================================


@celery_app.task(
    base=DataForgeTask,
    name="dataforge.sync_accounts",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def sync_accounts(self) -> dict:
    """同步所有云客账号

    检查所有账号的登录状态，自动刷新过期的会话。

    Returns:
        dict: 同步结果统计
    """
    from app.services import account_service

    task_log("开始执行账号同步任务")
    logger.info("开始执行账号同步任务")

    accounts = account_service.get_all_accounts()
    task_log(f"找到 {len(accounts)} 个账号需要检查")

    results = {
        "total": len(accounts),
        "synced": 0,
        "failed": 0,
        "skipped": 0,
    }

    for acc in accounts:
        try:
            task_log(f"检查账号 {acc.id}: {acc.username}")

            # 使用 run_async 在独立线程中执行异步代码
            status = run_async(account_service.check_account_status(acc.id))

            if not status.get("valid", False):
                task_log(f"  账号 {acc.id} 需要重新登录")
                login_result = run_async(account_service.auto_login(acc.id))

                if login_result.get("success", False):
                    task_log(f"  账号 {acc.id} 登录成功")
                    results["synced"] += 1
                else:
                    task_log(f"  账号 {acc.id} 登录失败: {login_result.get('message')}")
                    results["failed"] += 1
            else:
                task_log(f"  账号 {acc.id} 状态正常，跳过")
                results["skipped"] += 1

            # 长任务续期锁
            if results["total"] > 5:
                self.extend_lock()

        except Exception as e:
            task_log(f"  同步账号 {acc.id} 出错: {e}")
            logger.error(f"同步账号 {acc.id} 失败: {e}")
            results["failed"] += 1

    msg = (
        f"账号同步完成: 共 {results['total']} 个，"
        f"同步 {results['synced']} 个，"
        f"跳过 {results['skipped']} 个，"
        f"失败 {results['failed']} 个"
    )
    task_log(msg)
    logger.info(f"账号同步完成: {results}")
    return results


# ============================================================================
# 通话记录同步任务
# ============================================================================


def _parse_datetime(dt_str: str) -> datetime | None:
    """解析日期时间字符串"""
    if not dt_str:
        return None

    if isinstance(dt_str, str):
        formats = [
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d %H:%M",
            "%Y/%m/%d %H:%M:%S",
            "%Y/%m/%d %H:%M",
        ]
        for fmt in formats:
            try:
                return datetime.strptime(dt_str, fmt)
            except ValueError:
                continue

        # 尝试解析时间戳
        try:
            ts = int(dt_str)
            if ts > 1e12:
                ts = ts / 1000
            return datetime.fromtimestamp(ts)
        except (ValueError, TypeError, OSError):
            pass

    elif isinstance(dt_str, (int, float)):
        try:
            ts = dt_str
            if ts > 1e12:
                ts = ts / 1000
            return datetime.fromtimestamp(ts)
        except (ValueError, TypeError, OSError):
            pass

    return None


def _get_call_time(record: dict) -> datetime | None:
    """获取通话时间"""
    call_time = _parse_datetime(record.get("startCallTime", ""))
    if call_time:
        return call_time
    return _parse_datetime(record.get("createdTime", ""))


def _normalize_time_param(value, default_time: str = "00:00") -> str:
    """标准化时间参数"""
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M")
    if isinstance(value, str):
        value = value.strip()
        # 如果只有日期，添加默认时间
        if len(value) == 10:
            return f"{value} {default_time}"
        return value
    return ""


# 字段映射配置
FIELD_MAPPING = [
    {"yunke_field": "id", "db_name": "通话记录ID", "is_unique": True},
    {"yunke_field": "callNumber", "db_name": "客户电话"},
    {"yunke_field": "planCustomerName", "db_name": "客户名称"},
    {"yunke_field": "planCustomerCompany", "db_name": "客户公司"},
    {"yunke_field": "userIdName", "db_name": "坐席名称"},
    {"yunke_field": "departmentList", "db_name": "部门"},
    {"yunke_field": "callStatus", "db_name": "通话状态"},
    {"yunke_field": "startCallTime", "db_name": "通话时间"},
    {"yunke_field": "callSeconds", "db_name": "通话时长(秒)"},
    {"yunke_field": "callDuration", "db_name": "通话时长"},
    {"yunke_field": "progress", "db_name": "销售进度"},
    {"yunke_field": "simPhone", "db_name": "拨打号码"},
    {"yunke_field": "createdTime", "db_name": "创建时间"},
    {"yunke_field": "ringSecond", "db_name": "振铃时长(秒)"},
    {"yunke_field": "incomingCall", "db_name": "呼入标记"},
    {"yunke_field": "recordFile", "db_name": "录音地址"},
]


def _convert_record(record: dict, field_mapping: list[dict]) -> dict:
    """将云客记录转换为映射后的字段格式"""
    fields = {}
    for mapping in field_mapping:
        yunke_field = mapping["yunke_field"]
        db_name = mapping["db_name"]
        value = record.get(yunke_field)
        if value is not None and value != "":
            fields[db_name] = value
    return fields


@celery_app.task(
    base=DataForgeTask,
    name="dataforge.sync_call_logs",
    bind=True,
    max_retries=3,
    default_retry_delay=120,
    lock_timeout=7200,  # 2小时超时
)
def sync_call_logs(
    self,
    yunke_account_id: int,
    start_time: str = "",
    end_time: str = "",
    page_size: int = 50,
    call_type: str = "s",
    scheduled_task_id: int | None = None,
) -> dict:
    """同步云客通话记录到 PostgreSQL

    Args:
        yunke_account_id: 云客账号ID
        start_time: 开始时间，格式 "YYYY-MM-DD HH:mm"
        end_time: 结束时间，格式 "YYYY-MM-DD HH:mm"
        page_size: 每页记录数，默认 50，最大 200
        call_type: 通话类型，s=外呼，i=呼入，空=全部
        scheduled_task_id: 调度任务ID（用于精细锁控制）

    Returns:
        dict: 同步结果统计
    """
    from app.clients.yunke import CallLogClient
    from app.services.account_service import auto_login

    task_log("开始同步云客通话记录到 PostgreSQL")
    task_log(f"参数: yunke_account_id={yunke_account_id}")

    # 处理默认时间
    if not start_time or not end_time:
        today = datetime.now()
        start_time = start_time or today.strftime("%Y-%m-%d 00:00")
        end_time = end_time or today.strftime("%Y-%m-%d 23:59")

    start_time = _normalize_time_param(start_time, "00:00")
    end_time = _normalize_time_param(end_time, "23:59")
    task_log(f"时间范围: {start_time} - {end_time}")

    result = {
        "total_fetched": 0,
        "new_records": 0,
        "skipped_records": 0,
        "skipped_no_call_time": 0,
        "failed_records": 0,
        "start_time": start_time,
        "end_time": end_time,
    }

    with Session(engine) as session:
        # 1. 验证云客账号
        yunke_account = session.get(YunkeAccount, yunke_account_id)
        if not yunke_account:
            raise ValueError(f"云客账号 {yunke_account_id} 不存在")

        yunke_company = session.get(YunkeCompany, yunke_account.company_id)
        if not yunke_company:
            raise ValueError(f"云客公司 {yunke_account.company_id} 不存在")

        task_log(f"云客账号: {yunke_account.phone} ({yunke_company.company_name})")

        # 2. 检查登录状态
        if not yunke_account.cookies or not yunke_account.user_id:
            task_log("云客账号未登录，尝试自动登录...")
            login_result = run_async(auto_login(yunke_account_id))
            if not login_result["success"]:
                raise ValueError(f"云客自动登录失败: {login_result.get('message')}")
            session.refresh(yunke_account)
            task_log("云客自动登录成功")

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

        # 3. 分页获取通话记录
        task_log("开始获取云客通话记录...")
        all_records = []
        page = 1
        page_size = min(page_size, 200)

        while True:
            task_log(f"获取第 {page} 页...", print_console=False)

            response = run_async(
                yunke_client.get_call_logs(
                    start_time=start_time,
                    end_time=end_time,
                    page=page,
                    page_size=page_size,
                    call_type=call_type,
                )
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

            # 每10页续期一次锁
            if page % 10 == 0:
                self.extend_lock()

        result["total_fetched"] = len(all_records)
        task_log(f"获取完成，共 {len(all_records)} 条记录")

        if not all_records:
            task_log("没有获取到任何记录，同步结束")
            return result

        # 4. 去重检查
        task_log("开始去重检查...")
        record_ids = [str(r.get("id", "")) for r in all_records if r.get("id")]
        existing_records = session.exec(
            select(CallRecord.record_id)
            .where(CallRecord.source == "yunke")
            .where(CallRecord.record_id.in_(record_ids))
        ).all()
        existing_ids = set(existing_records)
        task_log(f"已存在 {len(existing_ids)} 条记录")

        new_records = [
            r for r in all_records if str(r.get("id", "")) not in existing_ids
        ]
        result["skipped_records"] = len(all_records) - len(new_records)
        task_log(f"需要新增 {len(new_records)} 条记录")

        if not new_records:
            task_log("所有记录已存在，同步结束")
            return result

        # 5. 批量写入数据库
        task_log("开始批量写入数据库...")
        total_created = 0
        skipped_no_call_time = 0
        batch_size = 500

        for i in range(0, len(new_records), batch_size):
            batch = new_records[i : i + batch_size]
            batch_num = i // batch_size + 1

            try:
                values = []
                batch_skipped_no_time = 0

                for record in batch:
                    call_time = _get_call_time(record)
                    if call_time is None:
                        batch_skipped_no_time += 1
                        continue

                    mapped_data = _convert_record(record, FIELD_MAPPING)
                    values.append(
                        {
                            "source": "yunke",
                            "record_id": str(record.get("id", "")),
                            "caller": str(record.get("simPhone", "")) or None,
                            "callee": str(record.get("callNumber", "")) or None,
                            "call_time": call_time,
                            "duration": record.get("callSeconds"),
                            "call_type": (
                                "outbound"
                                if record.get("incomingCall") == 0
                                else "inbound"
                            ),
                            "call_result": str(record.get("callStatus", "")) or None,
                            "customer_name": record.get("planCustomerName") or None,
                            "staff_name": record.get("userIdName") or None,
                            "department": record.get("departmentList") or None,
                            "raw_data": mapped_data,
                        }
                    )

                skipped_no_call_time += batch_skipped_no_time

                if not values:
                    task_log(f"批次 {batch_num}: {batch_skipped_no_time} 条无时间跳过")
                    continue

                stmt = pg_insert(CallRecord).values(values)
                stmt = stmt.on_conflict_do_nothing(
                    index_elements=["source", "record_id"]
                )
                result_proxy = session.exec(stmt)
                session.commit()

                rowcount = result_proxy.rowcount
                inserted = rowcount if rowcount >= 0 else len(batch)
                total_created += inserted
                skipped = len(batch) - inserted
                if skipped > 0:
                    result["skipped_records"] += skipped
                task_log(f"批次 {batch_num}: 插入 {inserted}, 跳过 {skipped}")

                # 每批次续期锁
                self.extend_lock()

            except Exception as e:
                session.rollback()
                result["failed_records"] += len(batch)
                task_log(f"批次 {batch_num} 写入失败: {e}")

        result["new_records"] = total_created
        result["skipped_no_call_time"] = skipped_no_call_time

        task_log(
            f"同步完成: 总计 {result['total_fetched']}, "
            f"新增 {result['new_records']}, "
            f"跳过(重复) {result['skipped_records']}, "
            f"跳过(无时间) {result['skipped_no_call_time']}, "
            f"失败 {result['failed_records']}"
        )

        return result
