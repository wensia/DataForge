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

import asyncio
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import or_, text
from sqlmodel import Session, select

from app.database import engine
from app.models import ASRProvider, CallRecord, TranscriptStatus
from app.scheduler import task_log
from app.services.asr_service import asr_service
from scripts._utils import normalize_time_param


@dataclass
class ConcurrentStats:
    """统计计数器

    在 asyncio 单线程模型中，简单的整数操作是原子的，
    因此不需要 asyncio.Lock（且 Lock 是不可重入的，容易导致死锁）。
    """

    success_count: int = 0
    failed_count: int = 0
    skipped_count: int = 0
    error_records: list = field(default_factory=list)

    def inc_success(self) -> int:
        """增加成功计数并返回当前值"""
        self.success_count += 1
        return self.success_count

    def inc_failed(self, error_info: dict | None = None) -> None:
        """增加失败计数"""
        self.failed_count += 1
        if error_info:
            self.error_records.append(error_info)

    def inc_skipped(self) -> None:
        """增加跳过计数"""
        self.skipped_count += 1

    def get_success_count(self) -> int:
        """获取成功计数"""
        return self.success_count


# 任务元信息
TASK_INFO = {
    "name": "ASR 语音识别",
    "description": "对通话记录进行语音识别转写，支持腾讯云、阿里云、火山引擎",
}


def _build_base_query(
    start_time: datetime,
    end_time: datetime,
    skip_existing: bool = True,
    min_duration: int = 0,
):
    """构建基础查询语句

    Args:
        start_time: 开始时间
        end_time: 结束时间
        skip_existing: 是否跳过已有转写结果的记录
        min_duration: 最小通话时长（秒）

    Returns:
        SQLAlchemy Select 语句
    """
    statement = select(CallRecord).where(
        CallRecord.call_time >= start_time,
        CallRecord.call_time <= end_time,
    )

    if skip_existing:
        # 跳过已完成和空内容的记录
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
            text(
                "raw_data->>'record_url' IS NOT NULL AND raw_data->>'record_url' != ''"
            ),
        )
    )

    return statement


def _count_records_to_transcribe(
    start_time: datetime,
    end_time: datetime,
    skip_existing: bool = True,
    min_duration: int = 0,
) -> int:
    """统计需要转写的记录总数（不加载数据到内存）

    Args:
        start_time: 开始时间
        end_time: 结束时间
        skip_existing: 是否跳过已有转写结果的记录
        min_duration: 最小通话时长（秒）

    Returns:
        int: 记录总数
    """
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
) -> list[CallRecord]:
    """分页获取需要转写的通话记录（生成器模式）

    每次从数据库获取 page_size 条记录，避免一次性加载全量数据到内存。

    Args:
        start_time: 开始时间
        end_time: 结束时间
        skip_existing: 是否跳过已有转写结果的记录
        min_duration: 最小通话时长（秒）
        page_size: 每页记录数，默认 500

    Yields:
        list[CallRecord]: 每页的通话记录列表
    """
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

            # 如果本页记录数小于 page_size，说明已经是最后一页
            if len(records) < page_size:
                break


def _get_records_to_transcribe(
    start_time: datetime,
    end_time: datetime,
    skip_existing: bool = True,
    min_duration: int = 0,
    limit: int | None = None,
) -> list[CallRecord]:
    """获取需要转写的通话记录（兼容旧接口，仅用于小数据量场景）

    警告：此函数会一次性加载所有数据到内存，仅适用于小数据量场景。
    对于大数据量，请使用 _get_records_paged 分页查询。

    Args:
        start_time: 开始时间
        end_time: 结束时间
        skip_existing: 是否跳过已有转写结果的记录
        min_duration: 最小通话时长（秒）
        limit: 最大记录数

    Returns:
        list[CallRecord]: 通话记录列表
    """
    with Session(engine) as session:
        statement = _build_base_query(
            start_time, end_time, skip_existing, min_duration
        )
        statement = statement.order_by(CallRecord.call_time.desc())

        if limit:
            statement = statement.limit(limit)

        return list(session.exec(statement).all())


async def _process_single_record(
    record: CallRecord,
    asr_config_id: int,
    stats: ConcurrentStats,
    max_records: int,
    semaphore: asyncio.Semaphore,
    correct_table_name: str = "",
    qps: int = 20,
) -> bool:
    """处理单条记录 (并发安全)

    Args:
        record: 通话记录
        asr_config_id: ASR 配置 ID
        stats: 统计计数器
        max_records: 最大成功数量限制
        semaphore: 并发信号量
        correct_table_name: 替换词本名称（仅火山引擎有效）
        qps: 每秒请求数限制（仅火山引擎有效）

    Returns:
        bool: 是否应该继续处理 (False 表示已达到 max_records)
    """
    async with semaphore:
        # 检查是否已达到最大成功数量
        if max_records > 0:
            current_success = stats.get_success_count()
            if current_success >= max_records:
                return False

        try:
            # 1. 检查录音 URL
            record_url = asr_service.extract_record_url(record.raw_data)
            if not record_url:
                task_log(f"[Record {record.id}] 无录音，跳过")
                stats.inc_skipped()
                return True

            # 2. 执行转写
            task_log(f"[Record {record.id}] 转写: {record.caller} -> {record.callee}")
            transcript = await asr_service.transcribe_record(
                record=record,
                asr_config_id=asr_config_id,
                staff_name=record.staff_name,
                correct_table_name=correct_table_name or None,
                qps=qps,
            )

            # 3. 处理结果
            if transcript:
                # 同步 DB 写入放到线程，避免阻塞事件循环
                # 转写成功，标记状态为 completed
                await asyncio.to_thread(
                    asr_service.update_record_transcript,
                    record.id,
                    transcript,
                    TranscriptStatus.COMPLETED,
                )
                current = stats.inc_success()
                max_display = max_records if max_records > 0 else "∞"
                task_log(f"[Record {record.id}] ✓ 转写成功 ({current}/{max_display})")
            else:
                # 空结果，标记为 empty（下次不再重试）
                await asyncio.to_thread(
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


async def run(
    asr_config_id: int,
    start_time: datetime,
    end_time: datetime,
    skip_existing: bool = True,
    min_duration: int = 0,
    batch_size: int = 10,
    max_records: int = 0,
    concurrency: int = 0,
    correct_table_name: str = "",
    qps: int = 20,
    _lock_key: str | None = None,
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
        concurrency: 并发数，0 表示自动（默认）
        correct_table_name: 替换词本名称（仅火山引擎有效）
        qps: 每秒请求数限制（仅火山引擎有效），默认 20
        _lock_key: 分布式锁键名（内部参数，用于长任务续期）

    Returns:
        dict: 执行结果
    """
    # 参数标准化（开始时间默认 00:00，结束时间默认 23:59）
    start_time = normalize_time_param(start_time, default_time="00:00")
    end_time = normalize_time_param(end_time, default_time="23:59")

    task_log("开始 ASR 语音识别任务")
    task_log(f"时间范围: {start_time} ~ {end_time}")
    task_log(f"ASR 配置 ID: {asr_config_id}")
    task_log(f"跳过已有转写: {skip_existing}")
    task_log(f"最小通话时长: {min_duration} 秒")
    task_log(f"每批处理数量: {batch_size}")
    task_log(f"QPS 限制: {qps}")
    if correct_table_name:
        task_log(f"替换词本: {correct_table_name}")

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

    # 并发自适应（火山引擎按轮询间隔推算需要的 in-flight 数）
    if concurrency <= 0:
        if asr_config.provider == ASRProvider.VOLCENGINE:
            poll_interval = 5.0  # 与 VolcengineASRClient.wait_for_task 默认一致
            # 轮询会消耗 QPS（query_task），需预留一部分 QPS 给 submit_task
            # 经验值：约 40% QPS 用于轮询，60% 用于提交，避免服务端排队过长
            poll_fraction = 0.4
            auto_concurrency = int(qps * poll_interval * poll_fraction)
            # 安全边界，避免极端参数导致过多并发
            auto_concurrency = max(5, min(auto_concurrency, 50))
        else:
            auto_concurrency = 5
        concurrency = auto_concurrency
        task_log(f"并发数自动调整为: {concurrency}")
    else:
        task_log(f"并发数: {concurrency}")

    # 统计需要转写的记录总数（不加载数据到内存）
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

    # 分页大小：每次从数据库获取的记录数
    # 设置为 500，平衡内存使用和查询效率
    db_page_size = 500
    task_log(f"使用分页查询，每页 {db_page_size} 条记录")

    # batch_size 至少覆盖并发数，否则会被批次顺序限制吞吐
    effective_batch_size = max(batch_size, concurrency)
    # 创建并发控制和统计
    semaphore = asyncio.Semaphore(concurrency)
    stats = ConcurrentStats()

    # 使用分页查询，避免一次性加载全量数据到内存
    batch_num = 0
    should_stop = False

    for page_records in _get_records_paged(
        start_time, end_time, skip_existing, min_duration, page_size=db_page_size
    ):
        if should_stop:
            break

        # 将数据库分页的记录再分成处理批次
        for i in range(0, len(page_records), effective_batch_size):
            # 检查是否已达到 max_records
            if max_records > 0 and stats.get_success_count() >= max_records:
                task_log(f"已达到最大识别成功数量 {max_records}，停止处理")
                should_stop = True
                break

            batch = page_records[i : i + effective_batch_size]
            batch_num += 1
            task_log(
                f"处理第 {batch_num} 批（{len(batch)} 条，并发 {concurrency}）"
            )

            # 并发执行本批次所有任务
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

            # 等待本批次完成
            results = await asyncio.gather(*tasks, return_exceptions=True)

            # 检查是否有任务返回 False (达到 max_records)
            if False in results:
                task_log(f"已达到最大识别成功数量 {max_records}，停止处理")
                should_stop = True
                break

            # 批次间日志
            task_log(
                f"批次完成: {stats.success_count} 成功, "
                f"{stats.failed_count} 失败, {stats.skipped_count} 跳过"
            )

            # 续期分布式锁（借鉴 celery-once 的设计，防止长任务锁过期）
            if _lock_key:
                from app.utils.task_lock import extend_task_lock

                if extend_task_lock(_lock_key, timeout=3600):
                    task_log(f"锁已续期: {_lock_key}")
                else:
                    task_log(f"[WARN] 锁续期失败: {_lock_key}")

    # 最终统计
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
        result["errors"] = stats.error_records[:20]  # 只保留前20条错误

    task_log(f"ASR 语音识别任务完成: {result['message']}")
    return result
