"""ASR 客户端抽象基类"""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class TranscriptSegment:
    """转写片段"""

    start_time: float  # 开始时间（秒）
    end_time: float  # 结束时间（秒）
    speaker: str  # 说话人 ("staff" 或 "customer")
    text: str  # 转写文本
    emotion: str | None = None  # 情绪标签 (angry/happy/neutral/sad/surprise)


class ASRClient(ABC):
    """ASR 客户端抽象基类

    所有 ASR 提供商客户端必须继承此基类并实现 transcribe 方法。
    """

    @abstractmethod
    async def transcribe(
        self,
        audio_url: str,
        speaker_labels: dict[str, str] | None = None,
    ) -> list[TranscriptSegment]:
        """
        转写音频文件

        Args:
            audio_url: 音频文件 URL
            speaker_labels: 说话人标签映射，如 {"channel_0": "staff", "channel_1": "customer"}
                           默认: channel_0 为 staff，channel_1 为 customer

        Returns:
            list[TranscriptSegment]: 转写结果片段列表，按时间顺序排列
        """
        pass

    @staticmethod
    def format_time(seconds: float) -> str:
        """将秒数格式化为 MM:SS"""
        minutes = int(seconds) // 60
        secs = int(seconds) % 60
        return f"{minutes:02d}:{secs:02d}"

    @staticmethod
    def format_transcript(
        segments: list[TranscriptSegment],
        staff_name: str = "员工",
        customer_name: str = "客户",
    ) -> str:
        """
        格式化转写结果

        输出格式:
        [00:00-00:01][1.6s] 员工：你好。
        [00:02-00:03][1.2s] 客户：你好。

        Args:
            segments: 转写片段列表
            staff_name: 员工名称
            customer_name: 客户名称

        Returns:
            str: 格式化的转写文本
        """
        lines = []
        for seg in segments:
            start = ASRClient.format_time(seg.start_time)
            end = ASRClient.format_time(seg.end_time)
            duration = seg.end_time - seg.start_time
            speaker_name = staff_name if seg.speaker == "staff" else customer_name
            line = f"[{start}-{end}][{duration:.1f}s] {speaker_name}：{seg.text}"
            lines.append(line)
        return "\n".join(lines)
