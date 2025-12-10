"""ASR 语音识别客户端模块"""

from app.clients.asr.alibaba import AlibabaASRClient
from app.clients.asr.base import ASRClient, TranscriptSegment
from app.clients.asr.tencent import TencentASRClient
from app.clients.asr.volcengine import VolcengineASRClient

__all__ = [
    "ASRClient",
    "TranscriptSegment",
    "TencentASRClient",
    "AlibabaASRClient",
    "VolcengineASRClient",
]
