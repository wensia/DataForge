"""ASR 转写文本替换脚本

使用替换词本对已转录的通话记录进行错别字纠正。
"""

from datetime import datetime
from pathlib import Path

from sqlmodel import Session, select

from app.database import engine
from app.models import CallRecord
from app.scheduler import task_log
from scripts._utils import normalize_time_param

TASK_INFO = {
    "name": "asr_text_replace",
    "description": "ASR 转写文本替换纠错",
}

# 替换词本路径
REPLACEMENT_DICT_PATH = Path(__file__).parent.parent.parent / "asr_replacement_dict.txt"


def load_replacement_dict() -> dict[str, str]:
    """加载替换词本

    Returns:
        dict: 错误词 -> 正确词 的映射字典
    """
    replacements = {}
    if not REPLACEMENT_DICT_PATH.exists():
        task_log(f"替换词本不存在: {REPLACEMENT_DICT_PATH}")
        return replacements

    with open(REPLACEMENT_DICT_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and "|" in line:
                parts = line.split("|", 1)
                if len(parts) == 2:
                    wrong, correct = parts
                    if wrong and correct:
                        replacements[wrong] = correct
    return replacements


def replace_text(text: str, replacements: dict[str, str]) -> str:
    """对文本进行替换

    Args:
        text: 原始文本
        replacements: 替换词典

    Returns:
        str: 替换后的文本
    """
    for wrong, correct in replacements.items():
        text = text.replace(wrong, correct)
    return text


async def run(
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    batch_size: int = 500,
    dry_run: bool = False,
) -> dict:
    """执行 ASR 文本替换

    Args:
        start_time: 开始时间（可选，默认处理所有）
        end_time: 结束时间（可选）
        batch_size: 批量处理大小
        dry_run: 试运行模式（不实际更新数据库）

    Returns:
        dict: 执行结果统计
    """
    # 加载替换词本
    replacements = load_replacement_dict()
    task_log(f"已加载 {len(replacements)} 条替换规则")

    if not replacements:
        return {
            "status": "error",
            "message": "替换词本为空或不存在",
            "total": 0,
            "updated": 0,
        }

    # 统计
    total = 0
    updated = 0
    skipped = 0
    examples = []  # 记录替换示例

    with Session(engine) as session:
        # 构建查询
        statement = select(CallRecord).where(CallRecord.transcript.isnot(None))

        if start_time:
            start_time = normalize_time_param(start_time)
            statement = statement.where(CallRecord.call_time >= start_time)
        if end_time:
            end_time = normalize_time_param(end_time)
            statement = statement.where(CallRecord.call_time <= end_time)

        records = session.exec(statement).all()
        total = len(records)
        task_log(f"找到 {total} 条待处理记录")

        # 分批处理
        for i in range(0, total, batch_size):
            batch = records[i : i + batch_size]

            for record in batch:
                if not record.transcript:
                    skipped += 1
                    continue

                # 对每个 segment 的 text 进行替换
                modified = False
                new_transcript = []
                for segment in record.transcript:
                    new_segment = segment.copy()
                    if "text" in segment and segment["text"]:
                        original_text = segment["text"]
                        new_text = replace_text(original_text, replacements)
                        if new_text != original_text:
                            modified = True
                            new_segment["text"] = new_text
                            # 记录前几个替换示例
                            if len(examples) < 5:
                                examples.append(
                                    {
                                        "record_id": record.id,
                                        "original": original_text[:50],
                                        "replaced": new_text[:50],
                                    }
                                )
                    new_transcript.append(new_segment)

                if modified:
                    if not dry_run:
                        record.transcript = new_transcript
                        session.add(record)
                    updated += 1

            if not dry_run:
                session.commit()

            task_log(f"已处理 {min(i + batch_size, total)}/{total} 条记录")

    # 打印替换示例
    if examples:
        task_log("替换示例:")
        for ex in examples:
            task_log(f"  记录 {ex['record_id']}: '{ex['original']}' -> '{ex['replaced']}'")

    result = {
        "status": "completed",
        "message": f"替换完成，更新 {updated} 条记录",
        "total": total,
        "updated": updated,
        "skipped": skipped,
        "dry_run": dry_run,
        "examples": examples,
    }
    task_log(f"执行完成: 总计 {total} 条，更新 {updated} 条，跳过 {skipped} 条")
    return result


# 支持直接运行
if __name__ == "__main__":
    import asyncio
    import sys

    # 检查是否为 dry_run 模式
    dry_run = "--dry-run" in sys.argv or "-d" in sys.argv

    print(f"运行模式: {'试运行 (dry_run)' if dry_run else '正式执行'}")
    result = asyncio.run(run(dry_run=dry_run))
    print(f"结果: {result}")
