"""腾讯云 ASR 客户端

使用腾讯云录音文件识别 API 进行语音转文字。
文档: https://cloud.tencent.com/document/product/1093/37823
"""

import asyncio
import json
import logging
import re
from typing import Any

import httpx

from app.clients.asr.base import ASRClient, TranscriptSegment
from app.scheduler.task_logger import task_log

logger = logging.getLogger(__name__)


class TencentASRClient(ASRClient):
    """腾讯云 ASR 客户端

    使用录音文件识别极速版 API（CreateRecTask + DescribeTaskStatus）
    支持双声道分离，返回带时间戳的转写结果。
    """

    # API 地址
    API_HOST = "asr.tencentcloudapi.com"
    API_VERSION = "2019-06-14"

    def __init__(self, secret_id: str, secret_key: str, app_id: str | None = None):
        """
        初始化腾讯云 ASR 客户端

        Args:
            secret_id: 腾讯云 SecretId
            secret_key: 腾讯云 SecretKey
            app_id: 腾讯云 AppId（录音文件识别可不填）
        """
        self.secret_id = secret_id
        self.secret_key = secret_key
        self.app_id = app_id

    def _sign_request(
        self, action: str, payload: dict, timestamp: int
    ) -> dict[str, str]:
        """生成请求签名（TC3-HMAC-SHA256）"""
        import hashlib
        import hmac

        service = "asr"
        host = self.API_HOST
        algorithm = "TC3-HMAC-SHA256"
        date = (
            __import__("datetime")
            .datetime.utcfromtimestamp(timestamp)
            .strftime("%Y-%m-%d")
        )

        # 拼接规范请求串
        http_request_method = "POST"
        canonical_uri = "/"
        canonical_querystring = ""
        ct = "application/json; charset=utf-8"
        payload_str = json.dumps(payload)
        canonical_headers = f"content-type:{ct}\nhost:{host}\nx-tc-action:{action.lower()}\n"
        signed_headers = "content-type;host;x-tc-action"
        hashed_request_payload = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()
        canonical_request = (
            f"{http_request_method}\n{canonical_uri}\n{canonical_querystring}\n"
            f"{canonical_headers}\n{signed_headers}\n{hashed_request_payload}"
        )

        # 拼接待签名字符串
        credential_scope = f"{date}/{service}/tc3_request"
        hashed_canonical_request = hashlib.sha256(
            canonical_request.encode("utf-8")
        ).hexdigest()
        string_to_sign = (
            f"{algorithm}\n{timestamp}\n{credential_scope}\n{hashed_canonical_request}"
        )

        # 计算签名
        def sign(key: bytes, msg: str) -> bytes:
            return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()

        secret_date = sign(("TC3" + self.secret_key).encode("utf-8"), date)
        secret_service = sign(secret_date, service)
        secret_signing = sign(secret_service, "tc3_request")
        signature = hmac.new(
            secret_signing, string_to_sign.encode("utf-8"), hashlib.sha256
        ).hexdigest()

        # 拼接 Authorization
        authorization = (
            f"{algorithm} Credential={self.secret_id}/{credential_scope}, "
            f"SignedHeaders={signed_headers}, Signature={signature}"
        )

        return {
            "Authorization": authorization,
            "Content-Type": ct,
            "Host": host,
            "X-TC-Action": action,
            "X-TC-Timestamp": str(timestamp),
            "X-TC-Version": self.API_VERSION,
        }

    async def _call_api(self, action: str, params: dict) -> dict[str, Any]:
        """调用腾讯云 API"""
        import time

        timestamp = int(time.time())
        headers = self._sign_request(action, params, timestamp)

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"https://{self.API_HOST}",
                json=params,
                headers=headers,
                timeout=30.0,
            )
            response.raise_for_status()
            result = response.json()

            if "Response" in result:
                if "Error" in result["Response"]:
                    error = result["Response"]["Error"]
                    raise RuntimeError(
                        f"腾讯云 API 错误: {error.get('Code')} - {error.get('Message')}"
                    )
                return result["Response"]
            return result

    async def create_rec_task(
        self,
        audio_url: str,
        channel_num: int = 2,
        engine_type: str | None = None,
    ) -> int:
        """
        创建录音文件识别任务

        Args:
            audio_url: 音频文件 URL
            channel_num: 声道数，1=单声道，2=双声道
            engine_type: 引擎类型，默认根据声道数自动选择

        说明（根据腾讯云文档）:
            - 16k 音频: 只支持单声道 ChannelNum=1
            - 8k 电话音频: 支持双声道 ChannelNum=2，双声道自动分离说话人
            - 电话录音通常是 8k，使用 8k_zh 引擎 + 双声道

        Returns:
            int: 任务 ID
        """
        # 根据声道数选择引擎类型
        # 双声道（电话录音）: 使用 8k_zh，双声道自动分离说话人
        # 单声道: 使用 16k_zh + SpeakerDiarization
        if engine_type is None:
            engine_type = "8k_zh" if channel_num == 2 else "16k_zh"

        params = {
            "EngineModelType": engine_type,
            "ChannelNum": channel_num,
            "SourceType": 0,  # 0=URL 方式
            "Url": audio_url,
            "ResTextFormat": 0,  # 0=识别结果文本（含分段时间戳）
        }

        # 8k 双声道不需要设置 SpeakerDiarization，双声道会自动分离
        # 16k 单声道需要开启 SpeakerDiarization 进行说话人分离
        if channel_num == 1:
            params["SpeakerDiarization"] = 1
            params["SpeakerNumber"] = 0  # 0=自动识别说话人数量

        task_log(f"  - 引擎类型: {engine_type}, 声道数: {channel_num}")

        result = await self._call_api("CreateRecTask", params)
        task_id = result.get("Data", {}).get("TaskId")
        if not task_id:
            raise RuntimeError(f"创建任务失败，返回: {result}")
        logger.info(f"腾讯云 ASR 任务已创建: {task_id}")
        return task_id

    async def get_task_status(self, task_id: int) -> dict[str, Any]:
        """
        查询任务状态

        Args:
            task_id: 任务 ID

        Returns:
            dict: 任务状态信息
        """
        params = {"TaskId": task_id}
        result = await self._call_api("DescribeTaskStatus", params)
        return result.get("Data", {})

    async def wait_for_task(
        self,
        task_id: int,
        poll_interval: float = 3.0,
        timeout: float = 600.0,
    ) -> dict[str, Any]:
        """
        等待任务完成

        Args:
            task_id: 任务 ID
            poll_interval: 轮询间隔（秒）
            timeout: 超时时间（秒）

        Returns:
            dict: 识别结果
        """
        import time

        start_time = time.time()
        while True:
            if time.time() - start_time > timeout:
                raise TimeoutError(f"ASR 任务超时: {task_id}")

            status = await self.get_task_status(task_id)
            task_status = status.get("Status")

            # 状态: 0=等待中, 1=处理中, 2=成功, 3=失败
            if task_status == 2:
                logger.info(f"腾讯云 ASR 任务完成: {task_id}")
                return status
            elif task_status == 3:
                error_msg = status.get("ErrorMsg", "未知错误")
                raise RuntimeError(f"ASR 任务失败: {error_msg}")

            logger.debug(f"ASR 任务状态: {task_status}, 等待中...")
            await asyncio.sleep(poll_interval)

    def _parse_result(
        self,
        result: dict[str, Any],
        speaker_labels: dict[str, str] | None = None,
    ) -> list[TranscriptSegment]:
        """
        解析识别结果

        Args:
            result: 腾讯云返回的识别结果
            speaker_labels: 说话人标签映射

        Returns:
            list[TranscriptSegment]: 转写片段列表
        """
        segments = []
        speaker_labels = speaker_labels or {}
        default_labels = {"0": "staff", "1": "customer"}

        # 获取详细结果（含时间戳）- 注意处理 None 的情况
        result_detail = result.get("ResultDetail") or []

        if result_detail:
            # 有 ResultDetail，使用详细结果解析
            for item in result_detail:
                # 每个 item 是一个句子
                speaker_id = str(item.get("SpeakerId", 0))
                speaker = speaker_labels.get(
                    f"channel_{speaker_id}",
                    default_labels.get(speaker_id, "staff"),
                )

                # 时间戳（毫秒 -> 秒）
                start_time = item.get("StartMs", 0) / 1000
                end_time = item.get("EndMs", 0) / 1000
                text = item.get("FinalSentence", "").strip()

                if text:
                    segments.append(
                        TranscriptSegment(
                            start_time=start_time,
                            end_time=end_time,
                            speaker=speaker,
                            text=text,
                        )
                    )
        else:
            # 无 ResultDetail，从 Result 文本解析
            # 8k 双声道格式: "[0]:文字1\n[1]:文字2" 或 "文字1\n文字2"
            result_text = result.get("Result") or ""
            if result_text:
                segments = self._parse_result_text(result_text, default_labels)

        # 按时间排序
        segments.sort(key=lambda x: x.start_time)
        return segments

    # 匹配带时间戳和声道的格式: [分:秒.毫秒,分:秒.毫秒,声道]
    # 例如: [0:0.700,0:1.650,0] 或 [1:7.740,1:9.110,1]
    _TIMESTAMP_PATTERN = re.compile(
        r"^\[(\d+):(\d+\.?\d*),(\d+):(\d+\.?\d*),(\d+)\]\s*(.+)"
    )
    # 匹配简单声道格式: [0]:文字 或 [1]:文字
    _SIMPLE_CHANNEL_PATTERN = re.compile(r"^\[(\d+)\][：:]?\s*(.+)")

    def _parse_time_to_seconds(self, minutes: str, seconds: str) -> float:
        """将分:秒格式转换为秒数"""
        return int(minutes) * 60 + float(seconds)

    def _parse_result_text(
        self,
        result_text: str,
        default_labels: dict[str, str],
    ) -> list[TranscriptSegment]:
        """
        从纯文本结果解析（当没有 ResultDetail 时使用）

        支持两种格式:
        1. 带时间戳格式: [0:0.700,0:1.650,0]  喂，你好。
        2. 简单声道格式: [0]:喂你好。

        Args:
            result_text: 纯文本识别结果
            default_labels: 默认说话人标签

        Returns:
            list[TranscriptSegment]: 转写片段列表
        """
        segments = []
        time_offset = 0.0

        lines = result_text.strip().split("\n")

        for line in lines:
            line = line.strip()
            if not line:
                continue

            # 首先尝试匹配带时间戳的格式
            match = self._TIMESTAMP_PATTERN.match(line)
            if match:
                start_min, start_sec = match.group(1), match.group(2)
                end_min, end_sec = match.group(3), match.group(4)
                speaker_id = match.group(5)
                text = match.group(6).strip()

                start_time = self._parse_time_to_seconds(start_min, start_sec)
                end_time = self._parse_time_to_seconds(end_min, end_sec)
                speaker = default_labels.get(speaker_id, "staff")

                if text:
                    segments.append(
                        TranscriptSegment(
                            start_time=start_time,
                            end_time=end_time,
                            speaker=speaker,
                            text=text,
                        )
                    )
                continue

            # 尝试匹配简单声道格式 [0]:文字
            match = self._SIMPLE_CHANNEL_PATTERN.match(line)
            if match:
                speaker_id = match.group(1)
                text = match.group(2).strip()
                speaker = default_labels.get(speaker_id, "staff")
            else:
                # 没有声道标记，当作员工
                text = line
                speaker = "staff"

            if text:
                # 由于没有时间戳，使用估算（每 10 个字约 2 秒）
                duration = max(1.0, len(text) / 5)
                segments.append(
                    TranscriptSegment(
                        start_time=time_offset,
                        end_time=time_offset + duration,
                        speaker=speaker,
                        text=text,
                    )
                )
                time_offset += duration

        return segments

    async def transcribe(
        self,
        audio_url: str,
        speaker_labels: dict[str, str] | None = None,
    ) -> list[TranscriptSegment]:
        """
        转写音频文件

        Args:
            audio_url: 音频文件 URL
            speaker_labels: 说话人标签映射

        Returns:
            list[TranscriptSegment]: 转写结果片段列表
        """
        # 1. 创建任务
        task_id = await self.create_rec_task(audio_url, channel_num=2)
        task_log(f"  - 腾讯云 ASR 任务 ID: {task_id}")

        # 2. 等待完成
        result = await self.wait_for_task(task_id)
        task_log(f"  - 任务完成，开始解析结果...")

        # 3. 记录原始结果（用于调试）
        result_text = result.get("Result") or ""
        result_detail = result.get("ResultDetail") or []
        task_log(f"  - Result 长度: {len(result_text)} 字符")
        task_log(f"  - ResultDetail 数量: {len(result_detail)} 条")

        # 如果没有 ResultDetail，尝试从 Result 文本中解析
        if not result_detail and result_text:
            task_log(f"  - 无 ResultDetail，将使用 Result 文本")

        # 4. 解析结果
        segments = self._parse_result(result, speaker_labels)
        return segments
