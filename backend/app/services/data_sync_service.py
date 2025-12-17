"""数据同步服务

从飞书多维表格或云客 API 同步数据到本地数据库。
"""

from datetime import datetime
from typing import Any

from loguru import logger
from sqlalchemy import distinct
from sqlmodel import Session, select

from app.models.call_record import CallRecord, DataSource
from app.models.feishu_bitable import FeishuBitable
from app.models.feishu_client import FeishuClient
from app.models.feishu_table import FeishuTable
from app.services import feishu_bitable_service as feishu_svc


class DataSyncError(Exception):
    """数据同步异常"""

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


async def sync_feishu_table_to_local(
    session: Session,
    client: FeishuClient,
    bitable: FeishuBitable,
    table: FeishuTable,
    field_mapping: dict[str, str] | None = None,
    record_id_field: str = "record_id",
    batch_size: int = 500,
) -> dict[str, Any]:
    """从飞书数据表同步数据到本地

    Args:
        session: 数据库会话
        client: 飞书客户端配置
        bitable: 多维表格配置
        table: 数据表配置
        field_mapping: 字段映射 {飞书字段名: 本地字段名}
        record_id_field: 飞书表中用作唯一标识的字段名
        batch_size: 每批同步的记录数

    Returns:
        dict: {"total": int, "added": int, "updated": int, "skipped": int, "errors": int}
    """
    result = {"total": 0, "added": 0, "updated": 0, "skipped": 0, "errors": 0}

    try:
        # 获取飞书 token
        access_token = await feishu_svc.get_tenant_access_token(
            client.app_id, client.app_secret
        )

        # 分页拉取所有记录
        page_token = None
        while True:
            response = await feishu_svc.search_records(
                access_token=access_token,
                app_token=bitable.app_token,
                table_id=table.table_id,
                page_size=batch_size,
                page_token=page_token,
            )

            items = response.get("items", [])
            result["total"] += len(items)

            # 处理每条记录
            for item in items:
                try:
                    record_result = _process_feishu_record(
                        session=session,
                        item=item,
                        field_mapping=field_mapping,
                        record_id_field=record_id_field,
                    )
                    result[record_result] += 1
                except Exception as e:
                    logger.warning(f"处理记录失败: {e}")
                    result["errors"] += 1

            # 检查是否有更多数据
            if not response.get("has_more"):
                break
            page_token = response.get("page_token")

        session.commit()
        logger.info(
            f"同步完成: 总计 {result['total']}，"
            f"新增 {result['added']}，更新 {result['updated']}，"
            f"跳过 {result['skipped']}，错误 {result['errors']}"
        )

    except feishu_svc.FeishuBitableError as e:
        raise DataSyncError(f"飞书 API 错误: {e.message}") from e

    return result


def _process_feishu_record(
    session: Session,
    item: dict,
    field_mapping: dict[str, str] | None,
    record_id_field: str,
) -> str:
    """处理单条飞书记录

    Returns:
        str: "added" | "updated" | "skipped"
    """
    feishu_record_id = item.get("record_id", "")
    fields = item.get("fields", {})

    # 提取记录标识
    record_id = fields.get(record_id_field) or feishu_record_id
    if isinstance(record_id, list):
        record_id = record_id[0].get("text", str(record_id[0])) if record_id else ""

    # 检查是否已存在
    existing = session.exec(
        select(CallRecord).where(
            CallRecord.source == DataSource.FEISHU,
            CallRecord.record_id == str(record_id),
        )
    ).first()

    # 映射字段
    mapped_data = _map_feishu_fields(fields, field_mapping)

    # 验证必填字段：call_time
    if mapped_data.get("call_time") is None:
        logger.warning(f"跳过飞书记录 {record_id}: 缺少通话时间")
        return "skipped"

    if existing:
        # 更新现有记录
        for key, value in mapped_data.items():
            if hasattr(existing, key) and value is not None:
                setattr(existing, key, value)
        existing.raw_data = fields
        existing.updated_at = datetime.now()
        session.add(existing)
        return "updated"
    else:
        # 创建新记录
        new_record = CallRecord(
            source=DataSource.FEISHU,
            record_id=str(record_id),
            raw_data=fields,
            **mapped_data,
        )
        session.add(new_record)
        return "added"


def _map_feishu_fields(
    fields: dict, field_mapping: dict[str, str] | None
) -> dict[str, Any]:
    """将飞书字段映射到本地字段

    Args:
        fields: 飞书记录的字段值
        field_mapping: 字段映射配置

    Returns:
        dict: 映射后的字段值
    """
    if not field_mapping:
        # 使用默认映射
        field_mapping = {
            "主叫": "caller",
            "被叫": "callee",
            "通话时间": "call_time",
            "通话时长": "duration",
            "通话类型": "call_type",
            "通话结果": "call_result",
            "客户名称": "customer_name",
            "员工": "staff_name",
            "部门": "department",
        }

    result = {}
    for feishu_field, local_field in field_mapping.items():
        value = fields.get(feishu_field)
        if value is not None:
            result[local_field] = _convert_feishu_value(value, local_field)

    return result


def _convert_feishu_value(value: Any, field_name: str) -> Any:
    """转换飞书字段值为本地格式

    Args:
        value: 飞书字段值
        field_name: 本地字段名

    Returns:
        转换后的值
    """
    # 处理飞书的特殊类型
    if isinstance(value, list):
        if len(value) == 0:
            return None
        first_item = value[0]
        if isinstance(first_item, dict):
            # 可能是人员、链接等复杂类型
            return first_item.get("text") or first_item.get("name") or str(first_item)
        return str(first_item)

    if isinstance(value, dict):
        return value.get("text") or value.get("name") or str(value)

    # 处理日期时间
    if field_name == "call_time":
        if isinstance(value, (int, float)):
            # 飞书时间戳是毫秒
            return datetime.fromtimestamp(value / 1000)
        elif isinstance(value, str):
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError:
                return None

    # 处理时长
    if field_name == "duration":
        if isinstance(value, str):
            try:
                return int(value)
            except ValueError:
                return None
        return int(value) if value else None

    return value


async def sync_all_feishu_tables(
    session: Session,
    field_mapping: dict[str, str] | None = None,
) -> dict[str, Any]:
    """同步所有配置的飞书数据表

    Args:
        session: 数据库会话
        field_mapping: 字段映射配置

    Returns:
        dict: {"success": int, "failed": int, "details": list}
    """
    result = {"success": 0, "failed": 0, "details": []}

    # 获取所有活跃的飞书配置
    clients = session.exec(select(FeishuClient).where(FeishuClient.is_active)).all()

    for client in clients:
        bitables = session.exec(
            select(FeishuBitable).where(
                FeishuBitable.client_id == client.id,
                FeishuBitable.is_active,
            )
        ).all()

        for bitable in bitables:
            tables = session.exec(
                select(FeishuTable).where(
                    FeishuTable.bitable_id == bitable.id,
                    FeishuTable.is_active,
                )
            ).all()

            for table in tables:
                try:
                    sync_result = await sync_feishu_table_to_local(
                        session=session,
                        client=client,
                        bitable=bitable,
                        table=table,
                        field_mapping=field_mapping,
                    )
                    result["success"] += 1
                    result["details"].append(
                        {
                            "table": f"{bitable.name}/{table.name}",
                            "status": "success",
                            "result": sync_result,
                        }
                    )
                except DataSyncError as e:
                    result["failed"] += 1
                    result["details"].append(
                        {
                            "table": f"{bitable.name}/{table.name}",
                            "status": "failed",
                            "error": e.message,
                        }
                    )
                    logger.error(
                        f"同步表 {bitable.name}/{table.name} 失败: {e.message}"
                    )

    return result


def get_unique_staff_names(session: Session) -> list[str]:
    """获取所有通话记录中的唯一员工名称

    Args:
        session: 数据库会话

    Returns:
        list[str]: 唯一员工名称列表（按字母排序）
    """
    statement = (
        select(distinct(CallRecord.staff_name))
        .where(CallRecord.staff_name.isnot(None))
        .where(CallRecord.staff_name != "")
        .order_by(CallRecord.staff_name)
    )
    return [name for name in session.exec(statement).all() if name]


def get_call_records(
    session: Session,
    source: str | None = None,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    department: str | None = None,
    staff_name: str | None = None,
    call_type: str | None = None,
    call_result: str | None = None,
    callee: str | None = None,
    duration_min: int | None = None,
    duration_max: int | None = None,
    limit: int = 100,
    offset: int = 0,
    allowed_departments: list[str] | None = None,
    allowed_staff_names: list[str] | None = None,
) -> tuple[list[CallRecord], int]:
    """查询通话记录

    Args:
        session: 数据库会话
        source: 数据来源筛选
        start_time: 开始时间
        end_time: 结束时间
        department: 部门筛选
        staff_name: 员工筛选
        call_type: 通话类型筛选
        call_result: 通话结果筛选
        callee: 被叫号码筛选（模糊匹配）
        duration_min: 最小通话时长（秒）
        duration_max: 最大通话时长（秒）
        limit: 返回数量限制
        offset: 偏移量
        allowed_departments: 允许的部门列表（用于用户权限控制）
        allowed_staff_names: 允许的员工列表（用于用户权限控制）

    Returns:
        tuple: (记录列表, 总数)
    """
    query = select(CallRecord)

    # 应用筛选条件
    if source:
        query = query.where(CallRecord.source == source)
    if start_time:
        query = query.where(CallRecord.call_time >= start_time)
    if end_time:
        query = query.where(CallRecord.call_time <= end_time)
    if department:
        query = query.where(CallRecord.department == department)
    if staff_name:
        query = query.where(CallRecord.staff_name == staff_name)
    if call_type:
        query = query.where(CallRecord.call_type == call_type)
    if call_result:
        query = query.where(CallRecord.call_result == call_result)
    if callee:
        query = query.where(CallRecord.callee.contains(callee))
    if duration_min is not None:
        query = query.where(CallRecord.duration >= duration_min)
    if duration_max is not None:
        query = query.where(CallRecord.duration <= duration_max)

    # 应用权限控制筛选（用户只能看特定部门/员工的数据）
    if allowed_departments:
        query = query.where(CallRecord.department.in_(allowed_departments))
    if allowed_staff_names:
        query = query.where(CallRecord.staff_name.in_(allowed_staff_names))

    # 获取总数
    from sqlalchemy import func

    count_query = select(func.count()).select_from(query.subquery())
    total = session.exec(count_query).one()

    # 分页和排序
    query = query.order_by(CallRecord.call_time.desc())
    query = query.offset(offset).limit(limit)

    records = session.exec(query).all()
    return list(records), total


def get_call_record_stats(
    session: Session,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    call_type: str | None = None,
    allowed_departments: list[str] | None = None,
    allowed_staff_names: list[str] | None = None,
) -> dict[str, Any]:
    """获取通话记录统计

    Args:
        session: 数据库会话
        start_time: 开始时间
        end_time: 结束时间
        call_type: 通话类型过滤（用于用户权限控制）
        allowed_departments: 允许的部门列表（用于用户权限控制）
        allowed_staff_names: 允许的员工列表（用于用户权限控制）

    Returns:
        dict: 统计结果
    """

    query = select(CallRecord)

    if start_time:
        query = query.where(CallRecord.call_time >= start_time)
    if end_time:
        query = query.where(CallRecord.call_time <= end_time)
    if call_type:
        query = query.where(CallRecord.call_type == call_type)

    # 应用权限控制筛选
    if allowed_departments:
        query = query.where(CallRecord.department.in_(allowed_departments))
    if allowed_staff_names:
        query = query.where(CallRecord.staff_name.in_(allowed_staff_names))

    records = session.exec(query).all()

    # 计算统计
    total_count = len(records)
    total_duration = sum(r.duration or 0 for r in records)
    avg_duration = total_duration / total_count if total_count > 0 else 0

    # 按来源统计
    by_source: dict[str, int] = {}
    for r in records:
        by_source[r.source] = by_source.get(r.source, 0) + 1

    # 按类型统计
    by_call_type: dict[str, int] = {}
    for r in records:
        if r.call_type:
            by_call_type[r.call_type] = by_call_type.get(r.call_type, 0) + 1

    # 按部门统计
    by_department: dict[str, int] = {}
    for r in records:
        if r.department:
            by_department[r.department] = by_department.get(r.department, 0) + 1

    return {
        "total_count": total_count,
        "total_duration": total_duration,
        "avg_duration": round(avg_duration, 2),
        "by_source": by_source,
        "by_call_type": by_call_type,
        "by_department": by_department,
    }


def delete_call_records(session: Session, record_ids: list[int]) -> int:
    """批量删除通话记录

    Args:
        session: 数据库会话
        record_ids: 要删除的记录 ID 列表

    Returns:
        int: 实际删除的记录数
    """
    if not record_ids:
        return 0

    # 查询要删除的记录
    records = session.exec(
        select(CallRecord).where(CallRecord.id.in_(record_ids))
    ).all()

    deleted_count = len(records)

    # 删除记录
    for record in records:
        session.delete(record)

    session.commit()
    logger.info(f"删除了 {deleted_count} 条通话记录")

    return deleted_count


# ============ 云客数据同步 ============


async def sync_yunke_call_logs(
    session: Session,
    account_id: int,
    start_time: str,
    end_time: str,
    page_size: int = 100,
) -> dict[str, Any]:
    """从云客 API 同步通话记录

    Args:
        session: 数据库会话
        account_id: 云客账号 ID
        start_time: 开始时间，格式 "YYYY-MM-DD HH:mm"
        end_time: 结束时间，格式 "YYYY-MM-DD HH:mm"
        page_size: 每页数量

    Returns:
        dict: {"total": int, "added": int, "updated": int, "skipped": int, "errors": int}
    """
    from app.clients.yunke.call_log import CallLogClient
    from app.models.yunke_account import YunkeAccount
    from app.services.account_service import get_account_client

    result = {"total": 0, "added": 0, "updated": 0, "skipped": 0, "errors": 0}

    # 获取云客账号
    account = session.get(YunkeAccount, account_id)
    if not account:
        raise DataSyncError(f"云客账号不存在: {account_id}")

    if not account.is_active:
        raise DataSyncError(f"云客账号已禁用: {account.phone}")

    try:
        # 获取云客客户端
        client = await get_account_client(session, account_id, CallLogClient)

        # 分页拉取通话记录
        page = 1
        while True:
            response = await client.get_call_logs(
                start_time=start_time,
                end_time=end_time,
                page=page,
                page_size=page_size,
            )

            data = response.get("data", {})
            records = data.get("data", [])
            data.get("totalCount", 0)
            page_count = data.get("pageCount", 0)

            result["total"] += len(records)

            # 处理每条记录
            for record in records:
                try:
                    record_result = _process_yunke_call_log(session, record)
                    result[record_result] += 1
                except Exception as e:
                    logger.warning(f"处理云客通话记录失败: {e}")
                    result["errors"] += 1

            # 检查是否还有更多页
            if page >= page_count:
                break
            page += 1

        session.commit()
        logger.info(
            f"云客通话记录同步完成: 总计 {result['total']}，"
            f"新增 {result['added']}，更新 {result['updated']}，"
            f"跳过 {result['skipped']}，错误 {result['errors']}"
        )

    except Exception as e:
        raise DataSyncError(f"云客 API 错误: {e}") from e

    return result


def _process_yunke_call_log(session: Session, record: dict) -> str:
    """处理单条云客通话记录

    Args:
        session: 数据库会话
        record: 云客通话记录数据

    Returns:
        str: "added" | "updated" | "skipped"
    """
    # 使用云客通话记录的 id 作为唯一标识
    call_id = str(record.get("id", ""))
    if not call_id:
        logger.warning("云客通话记录缺少 id 字段，跳过")
        return "skipped"

    # 检查是否已存在（基于 source + record_id 唯一约束）
    existing = session.exec(
        select(CallRecord).where(
            CallRecord.source == DataSource.YUNKE,
            CallRecord.record_id == call_id,
        )
    ).first()

    # 映射云客字段到本地字段
    mapped_data = _map_yunke_fields(record)

    # 验证必填字段：call_time
    if mapped_data.get("call_time") is None:
        logger.warning(f"跳过云客记录 {call_id}: 缺少通话时间")
        return "skipped"

    if existing:
        # 更新现有记录
        for key, value in mapped_data.items():
            if hasattr(existing, key) and value is not None:
                setattr(existing, key, value)
        existing.raw_data = record
        existing.updated_at = datetime.now()
        session.add(existing)
        return "updated"
    else:
        # 创建新记录
        new_record = CallRecord(
            source=DataSource.YUNKE,
            record_id=call_id,
            raw_data=record,
            **mapped_data,
        )
        session.add(new_record)
        return "added"


def _map_yunke_fields(record: dict) -> dict[str, Any]:
    """将云客通话记录字段映射到本地字段

    Args:
        record: 云客通话记录原始数据

    Returns:
        dict: 映射后的字段值
    """
    result: dict[str, Any] = {}

    # 主叫/被叫
    result["caller"] = record.get("callerNumber") or record.get("userName")
    result["callee"] = record.get("calleeNumber") or record.get("customerPhone")

    # 通话时间
    call_time_str = record.get("lastConnectTime") or record.get("createTime")
    if call_time_str:
        try:
            # 云客时间格式通常为 "YYYY-MM-DD HH:mm:ss"
            result["call_time"] = datetime.strptime(call_time_str, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            try:
                result["call_time"] = datetime.strptime(call_time_str, "%Y-%m-%d %H:%M")
            except ValueError:
                result["call_time"] = None

    # 通话时长（秒）
    duration = record.get("voiceTime") or record.get("callTime")
    if duration is not None:
        try:
            result["duration"] = int(duration)
        except (ValueError, TypeError):
            result["duration"] = None

    # 通话类型
    call_type = record.get("callType")
    if call_type == "s":
        result["call_type"] = "外呼"
    elif call_type == "i":
        result["call_type"] = "呼入"
    else:
        result["call_type"] = call_type

    # 通话结果
    result["call_result"] = record.get("callResult") or record.get("status")

    # 客户信息
    result["customer_name"] = record.get("customerName")

    # 员工信息
    result["staff_name"] = record.get("userName")

    # 部门
    result["department"] = record.get("departmentName")

    # 通话录音转写文本
    result["transcript"] = record.get("voiceText") or record.get("transcript")

    return result
