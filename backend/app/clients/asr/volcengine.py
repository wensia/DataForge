"""火山引擎 ASR 客户端

使用火山引擎录音文件识别 API 进行语音转文字。
文档: https://www.volcengine.com/docs/6561/1354868
"""

import asyncio
import logging
import re
import time
import uuid
from typing import Any

import httpx

from app.clients.asr.base import ASRClient, TranscriptSegment

logger = logging.getLogger(__name__)


class VolcengineASRClient(ASRClient):
    """火山引擎 ASR 客户端

    使用录音文件识别 API（提交任务 + 轮询结果）
    支持说话人分离，返回带时间戳的转写结果。
    """

    # API 地址
    API_HOST = "openspeech.bytedance.com"
    SUBMIT_URL = f"https://{API_HOST}/api/v1/auc/submit"
    QUERY_URL = f"https://{API_HOST}/api/v1/auc/query"

    def __init__(
        self,
        app_id: str,
        access_token: str,
        cluster: str = "volc_auc_common",
    ):
        """
        初始化火山引擎 ASR 客户端

        Args:
            app_id: 火山引擎 App ID
            access_token: 火山引擎 Access Token
            cluster: 集群配置，默认 volc_auc_common
        """
        self.app_id = app_id
        self.access_token = access_token
        self.cluster = cluster

    def _build_headers(self) -> dict[str, str]:
        """构建请求头"""
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer; {self.access_token}",
        }

    async def submit_task(
        self,
        audio_url: str,
        enable_diarization: bool = True,
    ) -> str:
        """
        提交录音文件识别任务

        Args:
            audio_url: 音频文件 URL
            enable_diarization: 是否启用说话人分离

        Returns:
            str: 任务 ID
        """
        task_id = str(uuid.uuid4())

        payload = {
            "app": {
                "appid": self.app_id,
                "cluster": self.cluster,
            },
            "user": {
                "uid": "dataforge-user",
            },
            "audio": {
                "url": audio_url,
                "format": "mp3",  # 自动检测，这里填默认值
            },
            "additions": {
                "use_itn": "True",  # 智能数字转换
                "with_speaker_info": "True" if enable_diarization else "False",
            },
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.SUBMIT_URL,
                json=payload,
                headers=self._build_headers(),
                params={"appid": self.app_id},
                timeout=30.0,
            )
            response.raise_for_status()
            result = response.json()

            if result.get("code") != 0:
                raise RuntimeError(
                    f"火山引擎 API 错误: {result.get('code')} - {result.get('message')}"
                )

            # 获取任务 ID（火山引擎返回的是 resp.id）
            resp_id = result.get("resp", {}).get("id") or result.get("id") or task_id
            logger.info(f"火山引擎 ASR 任务已提交: {resp_id}")
            return resp_id

    async def query_task(self, task_id: str) -> dict[str, Any]:
        """
        查询任务结果

        Args:
            task_id: 任务 ID

        Returns:
            dict: 任务结果
        """
        payload = {
            "appid": self.app_id,
            "cluster": self.cluster,
            "id": task_id,
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.QUERY_URL,
                json=payload,
                headers=self._build_headers(),
                params={"appid": self.app_id},
                timeout=30.0,
            )
            response.raise_for_status()
            return response.json()

    async def wait_for_task(
        self,
        task_id: str,
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
        start_time = time.time()
        while True:
            if time.time() - start_time > timeout:
                raise TimeoutError(f"ASR 任务超时: {task_id}")

            result = await self.query_task(task_id)
            code = result.get("code", -1)

            # code: 0=成功, 1000=处理中, 其他=失败
            if code == 0:
                logger.info(f"火山引擎 ASR 任务完成: {task_id}")
                return result
            elif code == 1000:
                # 任务还在处理中
                logger.debug(f"ASR 任务处理中: {task_id}")
            else:
                raise RuntimeError(
                    f"ASR 任务失败: {result.get('code')} - {result.get('message')}"
                )

            await asyncio.sleep(poll_interval)

    # 匹配文本中的时间戳和声道格式: [分:秒.毫秒,分:秒.毫秒,声道]
    # 例如: [0:0.700,0:1.650,0] 或 [1:7.740,1:9.110,1]
    TEXT_PREFIX_PATTERN = re.compile(r"^\[(\d+):(\d+\.?\d*),(\d+):(\d+\.?\d*),(\d+)\]\s*")

    def _parse_text_with_channel(self, raw_text: str) -> tuple[str, str | None]:
        """
        解析文本中的声道信息

        火山引擎返回的文本格式可能包含时间戳前缀:
        [0:0.700,0:1.650,0]  喂，你好。

        Args:
            raw_text: 原始文本

        Returns:
            tuple[str, str | None]: (纯净文本, 声道ID)
        """
        match = self.TEXT_PREFIX_PATTERN.match(raw_text)
        if match:
            channel_id = match.group(5)  # 第5个分组是声道ID
            clean_text = raw_text[match.end() :].strip()
            return clean_text, channel_id
        return raw_text.strip(), None

    def _parse_result(
        self,
        result: dict[str, Any],
        speaker_labels: dict[str, str] | None = None,
    ) -> list[TranscriptSegment]:
        """
        解析识别结果

        Args:
            result: 火山引擎返回的识别结果
            speaker_labels: 说话人标签映射

        Returns:
            list[TranscriptSegment]: 转写片段列表
        """
        segments = []
        speaker_labels = speaker_labels or {}
        # 默认声道映射：0=员工(坐席), 1=客户
        default_labels = {"0": "staff", "1": "customer"}

        # 获取识别结果
        resp = result.get("resp", {})
        utterances = resp.get("utterances", [])

        for utterance in utterances:
            raw_text = utterance.get("text", "")

            # 尝试从文本中解析声道信息
            clean_text, text_channel = self._parse_text_with_channel(raw_text)

            # 优先使用文本中的声道，其次使用 utterance 的 speaker 字段
            if text_channel is not None:
                speaker_id = text_channel
            else:
                speaker_id = str(utterance.get("speaker", 0))

            # 映射声道到说话人标签
            speaker = speaker_labels.get(
                f"channel_{speaker_id}",
                default_labels.get(speaker_id, "staff"),
            )

            # 时间戳（毫秒 -> 秒）
            start_time = utterance.get("start_time", 0) / 1000
            end_time = utterance.get("end_time", 0) / 1000

            if clean_text:
                segments.append(
                    TranscriptSegment(
                        start_time=start_time,
                        end_time=end_time,
                        speaker=speaker,
                        text=clean_text,
                    )
                )

        # 按时间排序
        segments.sort(key=lambda x: x.start_time)
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
        # 1. 提交任务
        task_id = await self.submit_task(audio_url, enable_diarization=True)

        # 2. 等待完成
        result = await self.wait_for_task(task_id)

        # 3. 解析结果
        return self._parse_result(result, speaker_labels)
