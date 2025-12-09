"""云客外呼记录同步到飞书多维表格

将云客通话记录同步到飞书多维表格，支持增量同步（按通话记录ID去重）。

使用示例:
    手动触发时传入参数:
    {
        "yunke_account_id": 1,
        "feishu_client_id": 1,
        "bitable_app_token": "PtRdbPjCFa5Og5sry0lcD1yPnKg",
        "table_name": "通话记录",
        "start_time": "2025-12-01 00:00",
        "end_time": "2025-12-08 23:59",
        "page_size": 50,
        "call_type": "s",
        "only_with_record": true
    }
"""

import json
from datetime import datetime

from sqlmodel import Session

from app.clients.yunke import CallLogClient
from app.database import engine
from app.models import YunkeAccount, YunkeCompany
from app.models.feishu_client import FeishuClient
from app.scheduler import task_log
from app.services.account_service import auto_login
from app.services.feishu_bitable_service import (
    FeishuBitableError,
    batch_create_records,
    ensure_fields,
    get_all_field_values,
    get_or_create_table,
    get_tenant_access_token,
)

from scripts._utils import normalize_time_param

# 任务元信息
TASK_INFO = {
    "name": "云客通话记录同步",
    "description": "将云客外呼记录同步到飞书多维表格",
}

# 字段映射配置（根据实际API返回字段定义）
# 云客字段 -> 飞书字段
FIELD_MAPPING = [
    {
        "yunke_field": "id",
        "feishu_name": "通话记录ID",
        "feishu_type": 1,  # 文本
        "is_unique": True,  # 用于去重
    },
    {
        "yunke_field": "callNumber",
        "feishu_name": "客户电话",
        "feishu_type": 13,  # 电话号码
    },
    {
        "yunke_field": "planCustomerName",
        "feishu_name": "客户名称",
        "feishu_type": 1,
    },
    {
        "yunke_field": "planCustomerCompany",
        "feishu_name": "客户公司",
        "feishu_type": 1,
    },
    {
        "yunke_field": "userIdName",
        "feishu_name": "坐席名称",
        "feishu_type": 1,
    },
    {
        "yunke_field": "departmentList",
        "feishu_name": "部门",
        "feishu_type": 1,
    },
    {
        "yunke_field": "callStatus",
        "feishu_name": "通话状态",
        "feishu_type": 2,  # 数字
    },
    {
        "yunke_field": "startCallTime",
        "feishu_name": "通话时间",
        "feishu_type": 5,  # 日期
    },
    {
        "yunke_field": "callSeconds",
        "feishu_name": "通话时长(秒)",
        "feishu_type": 2,
    },
    {
        "yunke_field": "callDuration",
        "feishu_name": "通话时长",
        "feishu_type": 1,
    },
    {
        "yunke_field": "progress",
        "feishu_name": "销售进度",
        "feishu_type": 2,
    },
    {
        "yunke_field": "simPhone",
        "feishu_name": "拨打号码",
        "feishu_type": 13,
    },
    {
        "yunke_field": "createdTime",
        "feishu_name": "创建时间",
        "feishu_type": 5,  # 日期
    },
    {
        "yunke_field": "ringSecond",
        "feishu_name": "振铃时长(秒)",
        "feishu_type": 2,
    },
    {
        "yunke_field": "incomingCall",
        "feishu_name": "呼入标记",
        "feishu_type": 2,  # 0=外呼, 1=呼入
    },
    {
        "yunke_field": "recordFile",
        "feishu_name": "录音地址",
        "feishu_type": 15,  # 超链接
    },
]


def _parse_datetime(dt_str: str) -> int | None:
    """解析日期时间字符串为毫秒时间戳

    Args:
        dt_str: 日期时间字符串，格式 "YYYY-MM-DD HH:mm:ss"

    Returns:
        int | None: 毫秒时间戳，解析失败返回 None
    """
    if not dt_str:
        return None

    try:
        dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S")
        return int(dt.timestamp() * 1000)
    except ValueError:
        try:
            dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M")
            return int(dt.timestamp() * 1000)
        except ValueError:
            return None


def _convert_record_to_feishu(record: dict, field_mapping: list[dict]) -> dict:
    """将云客记录转换为飞书字段格式

    Args:
        record: 云客通话记录
        field_mapping: 字段映射配置

    Returns:
        dict: 飞书字段格式 {"字段名": 值}
    """
    fields = {}

    for mapping in field_mapping:
        yunke_field = mapping["yunke_field"]
        feishu_name = mapping["feishu_name"]
        feishu_type = mapping["feishu_type"]

        value = record.get(yunke_field)
        if value is None or value == "":
            continue

        # 根据类型转换
        if feishu_type == 5:  # 日期
            # 转换为毫秒时间戳
            timestamp = _parse_datetime(str(value))
            if timestamp:
                value = timestamp
            else:
                continue  # 跳过无效日期
        elif feishu_type == 2:  # 数字
            try:
                value = int(value) if isinstance(value, (int, float, str)) else value
            except (ValueError, TypeError):
                value = 0
        elif feishu_type == 13:  # 电话号码
            value = str(value)
        elif feishu_type == 15:  # 超链接
            url = str(value)
            value = {"link": url, "text": "录音"}
        elif feishu_type == 1:  # 文本
            value = str(value)

        fields[feishu_name] = value

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
    feishu_client_id: int,
    bitable_app_token: str,
    table_name: str = "通话记录",
    start_time: str = "",
    end_time: str = "",
    page_size: int = 50,
    call_type: str = "s",
    only_with_record: bool = True,
) -> dict:
    """云客通话记录同步到飞书

    Args:
        yunke_account_id: 云客账号ID（数据库中的 YunkeAccount.id）
        feishu_client_id: 飞书客户端ID（数据库中的 FeishuClient.id）
        bitable_app_token: 多维表格 app_token
        table_name: 目标数据表名称，不存在则创建
        start_time: 开始时间，格式 "YYYY-MM-DD HH:mm"，默认今天 00:00
        end_time: 结束时间，格式 "YYYY-MM-DD HH:mm"，默认今天 23:59
        page_size: 每页记录数，默认 50，最大 200
        call_type: 通话类型，s=外呼，i=呼入，空=全部
        only_with_record: 是否只同步有录音的记录，默认 True

    Returns:
        dict: 同步结果统计
    """
    task_log("开始同步云客通话记录")
    task_log(f"参数: yunke_account_id={yunke_account_id}")
    task_log(f"参数: feishu_client_id={feishu_client_id}")
    task_log(f"多维表格: {bitable_app_token}, 表名: {table_name}")
    task_log(f"只同步有录音的记录: {only_with_record}")

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

        # ========== 2. 验证飞书客户端 ==========
        feishu_client = session.get(FeishuClient, feishu_client_id)
        if not feishu_client:
            raise ValueError(f"飞书客户端 {feishu_client_id} 不存在")

        task_log(f"飞书客户端: {feishu_client.name} ({feishu_client.app_id})")

        # ========== 3. 初始化云客客户端 ==========
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

        # ========== 4. 获取飞书访问令牌 ==========
        task_log("获取飞书 access_token...")
        try:
            access_token = await get_tenant_access_token(
                feishu_client.app_id, feishu_client.app_secret
            )
            task_log("获取飞书 access_token 成功")
        except FeishuBitableError as e:
            raise ValueError(f"获取飞书 access_token 失败: {e.message}")

        # ========== 5. 获取或创建数据表 ==========
        task_log(f"检查目标表: {table_name}")

        # 准备字段定义（创建表时使用）
        field_definitions = [
            {"field_name": m["feishu_name"], "type": m["feishu_type"]}
            for m in FIELD_MAPPING
        ]

        try:
            table_id, is_created = await get_or_create_table(
                access_token=access_token,
                app_token=bitable_app_token,
                table_name=table_name,
                fields=field_definitions if field_definitions else None,
            )

            if is_created:
                task_log(f"表 {table_name} 已创建，table_id={table_id}")
            else:
                task_log(f"表 {table_name} 已存在，table_id={table_id}")

        except FeishuBitableError as e:
            raise ValueError(f"获取/创建数据表失败: {e.message}")

        # ========== 6. 确保字段存在 ==========
        task_log("检查字段...")

        required_fields = [
            {
                "field_name": m["feishu_name"],
                "type": m["feishu_type"],
                "property": m.get("property"),
            }
            for m in FIELD_MAPPING
        ]

        try:
            field_result = await ensure_fields(
                access_token=access_token,
                app_token=bitable_app_token,
                table_id=table_id,
                required_fields=required_fields,
            )

            if field_result["created"]:
                task_log(f"创建了 {len(field_result['created'])} 个缺失字段")
            else:
                task_log("所有字段已存在")

        except FeishuBitableError as e:
            raise ValueError(f"检查/创建字段失败: {e.message}")

        # ========== 7. 分页获取云客通话记录 ==========
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

        # 过滤只有录音文件的记录
        if only_with_record:
            original_count = len(all_records)
            all_records = [r for r in all_records if r.get("recordFile")]
            filtered_count = original_count - len(all_records)
            task_log(
                f"过滤无录音记录: 过滤 {filtered_count} 条，剩余 {len(all_records)} 条"
            )

            if not all_records:
                task_log("过滤后没有记录，同步结束")
                return result

        # ========== 8. 去重检查 ==========
        task_log("开始去重检查（获取已存在记录ID）...")

        # 获取唯一标识字段
        unique_field = next(
            (m for m in FIELD_MAPPING if m.get("is_unique")), FIELD_MAPPING[0]
        )
        unique_feishu_name = unique_field["feishu_name"]
        unique_yunke_field = unique_field["yunke_field"]

        # 一次性获取表中所有已存在的记录ID（高效方案）
        # 相比逐批 OR 查询，这种方式在表数据量适中时更高效
        existing_ids = await get_all_field_values(
            access_token=access_token,
            app_token=bitable_app_token,
            table_id=table_id,
            field_name=unique_feishu_name,
        )

        task_log(f"多维表格中已存在 {len(existing_ids)} 条记录")

        # 过滤出需要新增的记录
        new_records = [
            r
            for r in all_records
            if str(r.get(unique_yunke_field, "")) not in existing_ids
        ]

        result["skipped_records"] = len(all_records) - len(new_records)
        task_log(f"需要新增 {len(new_records)} 条记录")

        if not new_records:
            task_log("所有记录已存在，同步结束")
            return result

        # ========== 9. 批量写入飞书 ==========
        task_log("开始批量写入飞书...")

        # 转换记录格式
        feishu_records = [
            {"fields": _convert_record_to_feishu(r, FIELD_MAPPING)} for r in new_records
        ]

        # 分批写入（每批最多500条）
        batch_size = 500
        total_created = 0

        for i in range(0, len(feishu_records), batch_size):
            batch = feishu_records[i : i + batch_size]
            batch_num = i // batch_size + 1

            try:
                await batch_create_records(
                    access_token=access_token,
                    app_token=bitable_app_token,
                    table_id=table_id,
                    records=batch,
                )
                total_created += len(batch)
                task_log(f"批次 {batch_num} 写入成功: {len(batch)} 条")

            except FeishuBitableError as e:
                result["failed_records"] += len(batch)
                task_log(f"批次 {batch_num} 写入失败: {e.message}")

        result["new_records"] = total_created

        # ========== 10. 完成 ==========
        task_log(
            f"同步完成: 总计 {result['total_fetched']}, "
            f"新增 {result['new_records']}, "
            f"跳过 {result['skipped_records']}, "
            f"失败 {result['failed_records']}"
        )

        return result
