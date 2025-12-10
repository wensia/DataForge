"""ASR 语音识别任务

将指定日期范围内的通话记录进行语音识别转写，并保存结果到数据库。
录音 URL 直接从数据库 raw_data 中提取，无需云客账号。

转写结果以 JSON 格式保存到 transcript 字段，每条记录包含:
- start_time: 开始时间（秒）
- end_time: 结束时间（秒）
- speaker: 说话人（staff/customer）
- text: 转写文本

使用示例:
    手动触发时传入参数:
    {
        "asr_config_id": 1,
        "start_time": "2025-12-01 00:00",
        "end_time": "2025-12-08 23:59",
        "skip_existing": true,
        "batch_size": 10
    }
"""

from datetime import datetime

from sqlmodel import Session, select

from app.database import engine
from app.models import CallRecord
from app.scheduler import task_log
from app.services.asr_service import asr_service
from scripts._utils import normalize_time_param

# 任务元信息
TASK_INFO = {
    "name": "ASR 语音识别",
    "description": "对通话记录进行语音识别转写，支持腾讯云、阿里云、火山引擎",
}


def _get_records_to_transcribe(
    start_time: datetime,
    end_time: datetime,
    skip_existing: bool = True,
    min_duration: int = 0,
    limit: int | None = None,
) -> list[CallRecord]:
    """获取需要转写的通话记录

    Args:
        start_time: 开始时间
        end_time: 结束时间
        skip_existing: 是否跳过已有转写结果的记录
        min_duration: 最小通话时长（秒），过滤掉时长小于此值的记录
        limit: 最大记录数

    Returns:
        list[CallRecord]: 通话记录列表
    """
    with Session(engine) as session:
        statement = select(CallRecord).where(
            CallRecord.call_time >= start_time,
            CallRecord.call_time <= end_time,
        )

        if skip_existing:
            # 跳过已有转写结果的记录（JSON 字段只需检查 None）
            statement = statement.where(CallRecord.transcript == None)

        if min_duration > 0:
            # 过滤通话时长
            statement = statement.where(CallRecord.duration >= min_duration)

        statement = statement.order_by(CallRecord.call_time.desc())

        if limit:
            statement = statement.limit(limit)

        return list(session.exec(statement).all())


async def run(
    asr_config_id: int,
    start_time: datetime,
    end_time: datetime,
    skip_existing: bool = True,
    min_duration: int = 0,
    batch_size: int = 10,
    max_records: int = 0,
) -> dict:
    """ASR 语音识别任务入口

    Args:
        asr_config_id: ASR 配置 ID（从下拉框选择）
        start_time: 开始时间
        end_time: 结束时间
        skip_existing: 是否跳过已有转写结果的记录，默认 True
        min_duration: 最小通话时长（秒），只处理时长>=此值的记录，默认 0 不限制
        batch_size: 每批处理数量，默认 10
        max_records: 最大识别成功数量，达到此数量后停止处理，0 表示不限制

    Returns:
        dict: 执行结果
    """
    # 参数标准化
    start_time = normalize_time_param(start_time)
    end_time = normalize_time_param(end_time)

    task_log(f"开始 ASR 语音识别任务")
    task_log(f"时间范围: {start_time} ~ {end_time}")
    task_log(f"ASR 配置 ID: {asr_config_id}")
    task_log(f"跳过已有转写: {skip_existing}")
    task_log(f"最小通话时长: {min_duration} 秒")
    task_log(f"每批处理数量: {batch_size}")

    # 验证 ASR 配置
    asr_config = asr_service.get_config(asr_config_id)
    if not asr_config:
        error_msg = f"ASR 配置不存在: {asr_config_id}"
        task_log(f"[ERROR] {error_msg}")
        return {"status": "failed", "message": error_msg}

    if not asr_config.is_active:
        error_msg = f"ASR 配置未启用: {asr_config_id}"
        task_log(f"[ERROR] {error_msg}")
        return {"status": "failed", "message": error_msg}

    task_log(f"使用 ASR 配置: {asr_config.name} ({asr_config.provider})")
    if max_records > 0:
        task_log(f"最大识别成功数量: {max_records}")

    # 获取需要转写的记录（不限制数量，由 max_records 控制成功数量）
    records = _get_records_to_transcribe(
        start_time, end_time, skip_existing, min_duration, limit=None
    )

    total_count = len(records)
    task_log(f"找到 {total_count} 条待转写记录")

    if total_count == 0:
        return {
            "status": "completed",
            "message": "没有需要转写的记录",
            "total": 0,
            "success": 0,
            "failed": 0,
            "skipped": 0,
        }

    # 统计
    success_count = 0
    failed_count = 0
    skipped_count = 0
    error_records = []

    # 分批处理
    reached_max = False
    for i in range(0, total_count, batch_size):
        if reached_max:
            break

        batch = records[i : i + batch_size]
        batch_num = i // batch_size + 1
        task_log(f"处理第 {batch_num} 批（{len(batch)} 条）")

        for record in batch:
            # 检查是否已达到最大成功数量
            if max_records > 0 and success_count >= max_records:
                task_log(f"已达到最大识别成功数量 {max_records}，停止处理")
                reached_max = True
                break

            try:
                # 检查是否有录音 URL
                record_url = asr_service.extract_record_url(record.raw_data)
                if not record_url:
                    task_log(f"记录 {record.id} 无录音，跳过")
                    skipped_count += 1
                    continue

                # 执行转写
                task_log(f"转写记录 {record.id}: {record.caller} -> {record.callee}")
                transcript = await asr_service.transcribe_record(
                    record=record,
                    asr_config_id=asr_config_id,
                    staff_name=record.staff_name,
                )

                if transcript:
                    # 保存结果
                    asr_service.update_record_transcript(record.id, transcript)
                    success_count += 1
                    task_log(f"✓ 记录 {record.id} 转写成功 ({success_count}/{max_records if max_records > 0 else '∞'})")
                else:
                    failed_count += 1
                    error_records.append({
                        "id": record.id,
                        "caller": record.caller,
                        "callee": record.callee,
                        "duration": record.duration,
                        "error": "转写结果为空（可能是空音频或无语音内容）",
                    })
                    task_log(f"✗ 记录 {record.id} 转写结果为空")

            except Exception as e:
                failed_count += 1
                error_msg = str(e)
                error_records.append({
                    "id": record.id,
                    "caller": record.caller,
                    "callee": record.callee,
                    "duration": record.duration,
                    "error": error_msg,
                })
                task_log(f"✗ 记录 {record.id} 转写异常: {error_msg}")

        # 批次间日志
        if not reached_max:
            task_log(
                f"已完成: {success_count} 成功, {failed_count} 失败, {skipped_count} 跳过"
            )

    # 最终统计
    result = {
        "status": "completed",
        "message": f"转写完成: {success_count} 成功, {failed_count} 失败, {skipped_count} 跳过",
        "total": total_count,
        "success": success_count,
        "failed": failed_count,
        "skipped": skipped_count,
        "asr_config": asr_config.name,
        "time_range": f"{start_time} ~ {end_time}",
    }

    if error_records:
        result["errors"] = error_records[:20]  # 只保留前20条错误

    task_log(f"ASR 语音识别任务完成: {result['message']}")
    return result
