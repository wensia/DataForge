"""ASR 语音识别任务

将通话记录进行语音识别转写，支持多种 ASR 服务商。
"""

import asyncio
from dataclasses import dataclass, field
from datetime import datetime

from loguru import logger
from sqlalchemy import or_, text
from sqlmodel import Session, select

from app.celery_app import celery_app
from app.database import engine
from app.models import ASRProvider, CallRecord, TranscriptStatus
from app.scheduler import task_log
from app.services.asr_service import asr_service
from app.tasks.base import DataForgeTask
from app.utils.async_helper import run_async


def _normalize_time_param(value, default_time: str = "00:00") -> datetime:
    """标准化时间参数为 datetime 对象"""
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        value = value.strip()
        # 如果只有日期，添加默认时间
        if len(value) == 10:
            value = f"{value} {default_time}"
        try:
            return datetime.strptime(value, "%Y-%m-%d %H:%M")
        except ValueError:
            pass
        try:
            return datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            pass
    raise ValueError(f"无法解析时间: {value}")


@dataclass
class TranscribeStats:
    """转写统计计数器"""

    success_count: int = 0
    failed_count: int = 0
    skipped_count: int = 0
    error_records: list = field(default_factory=list)

    def inc_success(self) -> int:
        self.success_count += 1
        return self.success_count

    def inc_failed(self, error_info: dict | None = None) -> None:
        self.failed_count += 1
        if error_info:
            self.error_records.append(error_info)

    def inc_skipped(self) -> None:
        self.skipped_count += 1

    def get_success_count(self) -> int:
        return self.success_count


def _build_base_query(
    start_time: datetime,
    end_time: datetime,
    skip_existing: bool = True,
    min_duration: int = 0,
):
    """构建基础查询语句"""
    statement = select(CallRecord).where(
        CallRecord.call_time >= start_time,
        CallRecord.call_time <= end_time,
    )

    if skip_existing:
        statement = statement.where(
            or_(
                CallRecord.transcript_status.is_(None),
                CallRecord.transcript_status == TranscriptStatus.PENDING,
            )
        )

    if min_duration > 0:
        statement = statement.where(CallRecord.duration >= min_duration)

    # 过滤有录音 URL 的记录
    statement = statement.where(
        or_(
            text("raw_data->>'录音地址' IS NOT NULL AND raw_data->>'录音地址' != ''"),
            text("raw_data->>'voiceUrl' IS NOT NULL AND raw_data->>'voiceUrl' != ''"),
            text("raw_data->>'voice_url' IS NOT NULL AND raw_data->>'voice_url' != ''"),
            text("raw_data->>'recordUrl' IS NOT NULL AND raw_data->>'recordUrl' != ''"),
            text("raw_data->>'record_url' IS NOT NULL AND raw_data->>'record_url' != ''"),
        )
    )

    return statement


def _count_records_to_transcribe(
    start_time: datetime,
    end_time: datetime,
    skip_existing: bool = True,
    min_duration: int = 0,
) -> int:
    """统计需要转写的记录总数"""
    from sqlalchemy import func

    with Session(engine) as session:
        base_query = _build_base_query(
            start_time, end_time, skip_existing, min_duration
        )
        count_query = select(func.count()).select_from(base_query.subquery())
        return session.exec(count_query).one()


def _get_records_paged(
    start_time: datetime,
    end_time: datetime,
    skip_existing: bool = True,
    min_duration: int = 0,
    page_size: int = 500,
):
    """分页获取需要转写的通话记录"""
    offset = 0

    while True:
        with Session(engine) as session:
            statement = _build_base_query(
                start_time, end_time, skip_existing, min_duration
            )
            statement = statement.order_by(CallRecord.call_time.desc())
            statement = statement.limit(page_size).offset(offset)

            records = list(session.exec(statement).all())

            if not records:
                break

            yield records
            offset += page_size

            if len(records) < page_size:
                break


async def _process_single_record(
    record: CallRecord,
    asr_config_id: int,
    stats: TranscribeStats,
    max_records: int,
    semaphore: asyncio.Semaphore,
    correct_table_name: str = "",
    qps: int = 20,
) -> bool:
    """处理单条记录（异步）"""
    async with semaphore:
        if max_records > 0:
            current_success = stats.get_success_count()
            if current_success >= max_records:
                return False

        try:
            record_url = asr_service.extract_record_url(record.raw_data)
            if not record_url:
                task_log(f"[Record {record.id}] 无录音，跳过")
                stats.inc_skipped()
                return True

            task_log(f"[Record {record.id}] 转写: {record.caller} -> {record.callee}")
            transcript = await asr_service.transcribe_record(
                record=record,
                asr_config_id=asr_config_id,
                staff_name=record.staff_name,
                correct_table_name=correct_table_name or None,
                qps=qps,
            )

            if transcript:
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(
                    None,
                    asr_service.update_record_transcript,
                    record.id,
                    transcript,
                    TranscriptStatus.COMPLETED,
                )
                current = stats.inc_success()
                max_display = max_records if max_records > 0 else "∞"
                task_log(f"[Record {record.id}] ✓ 转写成功 ({current}/{max_display})")
            else:
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(
                    None,
                    asr_service.update_record_transcript_status,
                    record.id,
                    TranscriptStatus.EMPTY,
                )
                stats.inc_failed(
                    {
                        "id": record.id,
                        "caller": record.caller,
                        "callee": record.callee,
                        "duration": record.duration,
                        "error": "空音频（已标记跳过）",
                    }
                )
                task_log(f"[Record {record.id}] ✗ 空音频，已标记跳过")

        except Exception as e:
            stats.inc_failed(
                {
                    "id": record.id,
                    "caller": record.caller,
                    "callee": record.callee,
                    "duration": record.duration,
                    "error": str(e),
                }
            )
            task_log(f"[Record {record.id}] ✗ 转写异常: {e}")

        return True


async def _run_asr_batch(
    asr_config_id: int,
    start_time: datetime,
    end_time: datetime,
    skip_existing: bool,
    min_duration: int,
    batch_size: int,
    max_records: int,
    concurrency: int,
    correct_table_name: str,
    qps: int,
    extend_lock_callback,
) -> dict:
    """执行 ASR 批量转写（异步入口）"""
    # 验证 ASR 配置
    asr_config = asr_service.get_config(asr_config_id)
    if not asr_config:
        return {"status": "failed", "message": f"ASR 配置不存在: {asr_config_id}"}

    if not asr_config.is_active:
        return {"status": "failed", "message": f"ASR 配置未启用: {asr_config_id}"}

    task_log(f"使用 ASR 配置: {asr_config.name} ({asr_config.provider})")

    # 并发自适应
    if concurrency <= 0:
        if asr_config.provider == ASRProvider.VOLCENGINE:
            poll_interval = 5.0
            poll_fraction = 0.4
            auto_concurrency = int(qps * poll_interval * poll_fraction)
            auto_concurrency = max(5, min(auto_concurrency, 50))
        else:
            auto_concurrency = 5
        concurrency = auto_concurrency
        task_log(f"并发数自动调整为: {concurrency}")

    # 统计记录数
    total_count = _count_records_to_transcribe(
        start_time, end_time, skip_existing, min_duration
    )
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

    db_page_size = 500
    effective_batch_size = max(batch_size, concurrency)
    semaphore = asyncio.Semaphore(concurrency)
    stats = TranscribeStats()

    batch_num = 0
    should_stop = False

    for page_records in _get_records_paged(
        start_time, end_time, skip_existing, min_duration, page_size=db_page_size
    ):
        if should_stop:
            break

        for i in range(0, len(page_records), effective_batch_size):
            if max_records > 0 and stats.get_success_count() >= max_records:
                task_log(f"已达到最大识别成功数量 {max_records}，停止处理")
                should_stop = True
                break

            batch = page_records[i : i + effective_batch_size]
            batch_num += 1
            task_log(f"处理第 {batch_num} 批（{len(batch)} 条，并发 {concurrency}）")

            tasks = [
                _process_single_record(
                    record=record,
                    asr_config_id=asr_config_id,
                    stats=stats,
                    max_records=max_records,
                    semaphore=semaphore,
                    correct_table_name=correct_table_name,
                    qps=qps,
                )
                for record in batch
            ]

            results = await asyncio.gather(*tasks, return_exceptions=True)

            if False in results:
                should_stop = True
                break

            task_log(
                f"批次完成: {stats.success_count} 成功, "
                f"{stats.failed_count} 失败, {stats.skipped_count} 跳过"
            )

            # 续期锁
            if extend_lock_callback:
                extend_lock_callback()

    msg = (
        f"转写完成: {stats.success_count} 成功, "
        f"{stats.failed_count} 失败, {stats.skipped_count} 跳过"
    )

    result = {
        "status": "completed",
        "message": msg,
        "total": total_count,
        "success": stats.success_count,
        "failed": stats.failed_count,
        "skipped": stats.skipped_count,
        "asr_config": asr_config.name,
        "time_range": f"{start_time} ~ {end_time}",
        "concurrency": concurrency,
    }

    if stats.error_records:
        result["errors"] = stats.error_records[:20]

    task_log(f"ASR 语音识别任务完成: {result['message']}")
    return result


@celery_app.task(
    base=DataForgeTask,
    name="dataforge.asr_transcribe",
    bind=True,
    max_retries=2,
    default_retry_delay=300,
    lock_timeout=14400,  # 4小时超时
)
def asr_transcribe(
    self,
    asr_config_id: int,
    start_time: str,
    end_time: str,
    skip_existing: bool = True,
    min_duration: int = 0,
    batch_size: int = 10,
    max_records: int = 0,
    concurrency: int = 0,
    correct_table_name: str = "",
    qps: int = 20,
    scheduled_task_id: int | None = None,
) -> dict:
    """ASR 语音识别任务

    Args:
        asr_config_id: ASR 配置 ID
        start_time: 开始时间 "YYYY-MM-DD HH:mm"
        end_time: 结束时间 "YYYY-MM-DD HH:mm"
        skip_existing: 是否跳过已有转写结果的记录
        min_duration: 最小通话时长（秒）
        batch_size: 每批处理数量
        max_records: 最大识别成功数量，0 表示不限制
        concurrency: 并发数，0 表示自动
        correct_table_name: 替换词本名称（仅火山引擎）
        qps: 每秒请求数限制（仅火山引擎）
        scheduled_task_id: 调度任务ID

    Returns:
        dict: 执行结果
    """
    # 参数标准化
    try:
        start_dt = _normalize_time_param(start_time, "00:00")
        end_dt = _normalize_time_param(end_time, "23:59")
    except ValueError as e:
        return {"status": "failed", "message": str(e)}

    task_log("开始 ASR 语音识别任务")
    task_log(f"时间范围: {start_dt} ~ {end_dt}")
    task_log(f"ASR 配置 ID: {asr_config_id}")
    task_log(f"跳过已有转写: {skip_existing}")
    task_log(f"最小通话时长: {min_duration} 秒")
    task_log(f"每批处理数量: {batch_size}")
    task_log(f"QPS 限制: {qps}")
    if correct_table_name:
        task_log(f"替换词本: {correct_table_name}")
    if max_records > 0:
        task_log(f"最大识别成功数量: {max_records}")

    # 创建锁续期回调
    def extend_lock_callback():
        self.extend_lock()

    # 使用 run_async 在独立线程中运行异步代码
    return run_async(
        _run_asr_batch(
            asr_config_id=asr_config_id,
            start_time=start_dt,
            end_time=end_dt,
            skip_existing=skip_existing,
            min_duration=min_duration,
            batch_size=batch_size,
            max_records=max_records,
            concurrency=concurrency,
            correct_table_name=correct_table_name,
            qps=qps,
            extend_lock_callback=extend_lock_callback,
        )
    )
