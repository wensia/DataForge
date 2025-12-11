"""火山引擎 ASR 客户端

使用火山引擎录音文件识别标准版 v3 API 进行语音转文字。
文档: https://www.volcengine.com/docs/6561/1354868
"""

import asyncio
import logging
import random
import threading
import time
import uuid
from typing import Any

import httpx

from app.clients.asr.base import ASRClient, TranscriptSegment

logger = logging.getLogger(__name__)

# 全局请求限流器（使用线程锁，兼容多事件循环）

_rate_limit_lock = threading.Lock()
_last_request_time: float = 0
_MIN_REQUEST_INTERVAL = 0.05  # 最小请求间隔（秒），20 QPS = 0.05s


async def _rate_limited_request():
    """请求前的限流等待（线程安全，兼容多事件循环）"""
    global _last_request_time

    with _rate_limit_lock:
        now = time.time()
        elapsed = now - _last_request_time
        if elapsed < _MIN_REQUEST_INTERVAL:
            wait_time = _MIN_REQUEST_INTERVAL - elapsed
        else:
            wait_time = 0
        _last_request_time = now + wait_time

    # 在锁外等待，避免阻塞其他线程
    if wait_time > 0:
        await asyncio.sleep(wait_time)


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

    async def submit_task(self, audio_url: str, max_retries: int = 5) -> str:
        """
        提交录音文件识别任务（带重试和限流）

        Args:
            audio_url: 音频文件 URL
            max_retries: 最大重试次数

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
                "enable_emotion_detection": True,  # 情绪检测
            },
        }

        for attempt in range(max_retries + 1):
            try:
                # 请求前限流
                logger.debug("[volcengine] submit_task 开始限流等待...")
                await _rate_limited_request()
                logger.debug("[volcengine] 限流完成，发送 POST 到 SUBMIT_URL...")

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
                        raise RuntimeError(
                            f"火山引擎提交任务失败: {status_code} - {message}"
                        )

                    logger.info(f"火山引擎 ASR 任务已提交: {request_id}")
                    return request_id

            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429:
                    # 429 Too Many Requests - 指数退避重试
                    if attempt < max_retries:
                        wait_time = (2**attempt) + random.uniform(0, 1)
                        logger.warning(
                            f"火山引擎提交 429 限流，{wait_time:.1f}秒后重试 "
                            f"({attempt + 1}/{max_retries})"
                        )
                        await asyncio.sleep(wait_time)
                        continue
                    else:
                        logger.error(f"火山引擎提交429限流，重试{max_retries}次仍失败")
                raise

        # 不应该到达这里
        raise RuntimeError("提交任务意外退出")

    async def query_task(
        self, request_id: str, max_retries: int = 5
    ) -> tuple[str, dict[str, Any]]:
        """
        查询任务结果（带重试和限流）

        Args:
            request_id: 请求 ID
            max_retries: 最大重试次数

        Returns:
            tuple[str, dict]: (状态码, 响应 body)
        """
        for attempt in range(max_retries + 1):
            try:
                # 请求前限流
                await _rate_limited_request()

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

            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429:
                    # 429 Too Many Requests - 指数退避重试
                    if attempt < max_retries:
                        wait_time = (2**attempt) + random.uniform(0, 1)
                        logger.warning(
                            f"火山引擎 429 限流，{wait_time:.1f}秒后重试 "
                            f"({attempt + 1}/{max_retries})"
                        )
                        await asyncio.sleep(wait_time)
                        continue
                    else:
                        logger.error(f"火山引擎 429 限流，重试{max_retries}次后仍失败")
                raise

        # 不应该到达这里
        raise RuntimeError("查询任务意外退出")

    async def wait_for_task(
        self,
        request_id: str,
        poll_interval: float = 5.0,
        timeout: float = 600.0,
    ) -> dict[str, Any]:
        """
        等待任务完成

        Args:
            request_id: 请求 ID
            poll_interval: 轮询间隔（秒），默认 5 秒避免限流
            timeout: 超时时间（秒）

        Returns:
            dict: 识别结果
        """
        start_time = time.time()

        # 添加随机初始延迟，避免多个任务同时轮询
        initial_delay = random.uniform(0, 2.0)
        await asyncio.sleep(initial_delay)

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
            # v3 API: channel_id 和 emotion 在 additions 字段中
            additions = utterance.get("additions", {})
            channel_id = str(additions.get("channel_id", "1"))
            emotion = additions.get("emotion")  # 情绪标签

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
                        emotion=emotion,
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
        logger.info("[volcengine] transcribe 开始，提交任务...")
        request_id = await self.submit_task(audio_url)
        logger.info(f"[volcengine] 任务已提交，request_id={request_id}")

        # 2. 等待完成
        logger.info("[volcengine] 开始等待任务完成...")
        result = await self.wait_for_task(request_id)
        result_keys = list(result.keys()) if result else "None"
        logger.info(f"[volcengine] 任务完成，结果 keys: {result_keys}")

        # 3. 解析结果
        return self._parse_result(result, speaker_labels)
