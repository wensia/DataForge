"""火山引擎 ASR 客户端

使用火山引擎录音文件识别标准版 v3 API 进行语音转文字。
文档: https://www.volcengine.com/docs/6561/1354868
"""

import asyncio
import logging
import time
import uuid
from typing import Any

import httpx

from app.clients.asr.base import ASRClient, TranscriptSegment

logger = logging.getLogger(__name__)


class VolcengineASRClient(ASRClient):
    """火山引擎 ASR 客户端

    使用录音文件识别标准版 v3 API（提交任务 + 轮询结果）
    支持双声道分离，返回带时间戳的转写结果。

    注意: v3 API 的状态码在 response headers 的 X-Api-Status-Code 中返回，
    而不是在 response body 中。
    """

    # API 地址 (v3 版本)
    API_HOST = "openspeech.bytedance.com"
    SUBMIT_URL = f"https://{API_HOST}/api/v3/auc/bigmodel/submit"
    QUERY_URL = f"https://{API_HOST}/api/v3/auc/bigmodel/query"

    # 状态码 (在 X-Api-Status-Code header 中)
    CODE_SUCCESS = "20000000"
    CODE_PROCESSING = "20000001"

    def __init__(
        self,
        app_id: str,
        access_token: str,
        cluster: str = "volc.bigasr.auc",
    ):
        """
        初始化火山引擎 ASR 客户端

        Args:
            app_id: 火山引擎 App ID (X-Api-App-Key)
            access_token: 火山引擎 Access Token (X-Api-Access-Key)
            cluster: 资源 ID (X-Api-Resource-Id)，默认 volc.bigasr.auc
        """
        self.app_id = app_id
        self.access_token = access_token
        self.cluster = cluster
        # 保存最后一次请求的 logid，用于查询时链路追踪
        self._last_logid: str | None = None

    def _build_headers(self, request_id: str) -> dict[str, str]:
        """构建请求头"""
        headers = {
            "Content-Type": "application/json",
            "X-Api-App-Key": self.app_id,
            "X-Api-Access-Key": self.access_token,
            "X-Api-Resource-Id": self.cluster,
            "X-Api-Request-Id": request_id,
            "X-Api-Sequence": "-1",  # 必需参数
        }
        if self._last_logid:
            headers["X-Tt-Logid"] = self._last_logid
        return headers

    def _detect_audio_format(self, audio_url: str) -> str:
        """从 URL 检测音频格式"""
        url_lower = audio_url.lower()
        if ".wav" in url_lower:
            return "wav"
        elif ".ogg" in url_lower:
            return "ogg"
        elif ".pcm" in url_lower or ".raw" in url_lower:
            return "raw"
        return "mp3"  # 默认 mp3

    async def submit_task(self, audio_url: str) -> str:
        """
        提交录音文件识别任务

        Args:
            audio_url: 音频文件 URL

        Returns:
            str: 请求 ID（用于查询结果）
        """
        request_id = str(uuid.uuid4())

        payload = {
            "user": {"uid": "dataforge-user"},
            "audio": {
                "format": self._detect_audio_format(audio_url),
                "url": audio_url,
                "codec": "raw",
            },
            "request": {
                "model_name": "bigmodel",
                "model_version": "400",
                "enable_itn": True,  # 逆文本归一化
                "enable_punc": True,  # 标点符号
                "enable_ddc": True,  # 数字转换
                "show_utterances": True,  # 显示分句结果
                "enable_channel_split": True,  # 双声道分离
            },
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.SUBMIT_URL,
                json=payload,
                headers=self._build_headers(request_id),
                timeout=30.0,
            )
            response.raise_for_status()

            # 保存 logid 用于查询
            self._last_logid = response.headers.get("X-Tt-Logid")

            # v3 API: 状态码在 response headers 中
            status_code = response.headers.get("X-Api-Status-Code", "")
            message = response.headers.get("X-Api-Message", "")

            logger.debug(f"火山引擎提交: status={status_code}, msg={message}")

            if status_code != self.CODE_SUCCESS:
                raise RuntimeError(f"火山引擎提交任务失败: {status_code} - {message}")

            logger.info(f"火山引擎 ASR 任务已提交: {request_id}")
            return request_id

    async def query_task(self, request_id: str) -> tuple[str, dict[str, Any]]:
        """
        查询任务结果

        Args:
            request_id: 请求 ID

        Returns:
            tuple[str, dict]: (状态码, 响应 body)
        """
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.QUERY_URL,
                json={},  # v3 API 查询时请求体为空
                headers=self._build_headers(request_id),
                timeout=30.0,
            )
            response.raise_for_status()

            # 更新 logid
            if response.headers.get("X-Tt-Logid"):
                self._last_logid = response.headers.get("X-Tt-Logid")

            # v3 API: 状态码在 response headers 中
            status_code = response.headers.get("X-Api-Status-Code", "")
            body = response.json()

            logger.debug(f"火山引擎查询: status={status_code}")
            return status_code, body

    async def wait_for_task(
        self,
        request_id: str,
        poll_interval: float = 3.0,
        timeout: float = 600.0,
    ) -> dict[str, Any]:
        """
        等待任务完成

        Args:
            request_id: 请求 ID
            poll_interval: 轮询间隔（秒）
            timeout: 超时时间（秒）

        Returns:
            dict: 识别结果
        """
        start_time = time.time()

        while True:
            if time.time() - start_time > timeout:
                raise TimeoutError(f"ASR 任务超时: {request_id}")

            status_code, body = await self.query_task(request_id)

            if status_code == self.CODE_SUCCESS:
                # 检查 body 是否有结果
                if body and body.get("result"):
                    logger.info(f"火山引擎 ASR 任务完成: {request_id}")
                    return body
                # 有时候 header 返回成功但 body 还没准备好，继续等待
                logger.debug("ASR 任务 header 成功但 body 为空，继续等待")
            elif status_code == self.CODE_PROCESSING:
                logger.debug(f"ASR 任务处理中: {request_id}")
            elif status_code.startswith("4"):
                # 4xx 错误
                message = body.get("message", "未知错误")
                raise RuntimeError(f"ASR 任务失败: {status_code} - {message}")
            else:
                logger.warning(f"ASR 未知状态: {status_code}")

            await asyncio.sleep(poll_interval)

    def _parse_result(
        self,
        result: dict[str, Any],
        speaker_labels: dict[str, str] | None = None,
    ) -> list[TranscriptSegment]:
        """
        解析识别结果

        Args:
            result: 火山引擎返回的识别结果
            speaker_labels: 说话人标签映射（可选）

        Returns:
            list[TranscriptSegment]: 转写片段列表
        """
        segments = []
        speaker_labels = speaker_labels or {}

        # v3 API: 声道映射 1=左声道(客户), 2=右声道(员工)
        default_labels = {"1": "customer", "2": "staff"}

        # v3 API 结果路径: result.utterances
        utterances = result.get("result", {}).get("utterances", [])

        for utterance in utterances:
            # v3 API: channel_id 在 additions 字段中
            additions = utterance.get("additions", {})
            channel_id = str(additions.get("channel_id", "1"))

            # 映射声道到说话人标签
            speaker = speaker_labels.get(
                f"channel_{channel_id}",
                default_labels.get(channel_id, "customer"),
            )

            # 时间戳（毫秒 -> 秒）
            start_time = utterance.get("start_time", 0) / 1000
            end_time = utterance.get("end_time", 0) / 1000
            text = utterance.get("text", "").strip()

            if text:
                segments.append(
                    TranscriptSegment(
                        start_time=start_time,
                        end_time=end_time,
                        speaker=speaker,
                        text=text,
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
        request_id = await self.submit_task(audio_url)

        # 2. 等待完成
        result = await self.wait_for_task(request_id)

        # 3. 解析结果
        return self._parse_result(result, speaker_labels)
