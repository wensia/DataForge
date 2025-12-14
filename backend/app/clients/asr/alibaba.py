"""阿里云智能语音 ASR 客户端

使用阿里云录音文件识别 API 进行语音转文字。
文档: https://help.aliyun.com/zh/isi/developer-reference/api-Chinese-recording-file-recognition
"""

import asyncio
import hashlib
import hmac
import json
import logging
import time
import urllib.parse
import uuid
from base64 import b64encode
from datetime import UTC, datetime
from typing import Any

import httpx

from app.clients.asr.base import ASRClient, TranscriptSegment

logger = logging.getLogger(__name__)


class AlibabaASRClient(ASRClient):
    """阿里云智能语音 ASR 客户端

    使用录音文件识别 API（提交任务 + 轮询结果）
    支持说话人分离，返回带时间戳的转写结果。
    """

    # API 地址（录音文件识别）
    API_HOST = "filetrans.cn-shanghai.aliyuncs.com"
    API_VERSION = "2018-08-17"

    def __init__(
        self,
        access_key_id: str,
        access_key_secret: str,
        app_key: str,
    ):
        """
        初始化阿里云 ASR 客户端

        Args:
            access_key_id: 阿里云 AccessKey ID
            access_key_secret: 阿里云 AccessKey Secret
            app_key: 智能语音服务 AppKey
        """
        self.access_key_id = access_key_id
        self.access_key_secret = access_key_secret
        self.app_key = app_key

    def _sign_request(self, params: dict) -> str:
        """生成签名"""
        # 按参数名排序
        sorted_params = sorted(params.items(), key=lambda x: x[0])

        # URL 编码
        def encode(s: str) -> str:
            return urllib.parse.quote(str(s), safe="~")

        # 构造待签名字符串
        query_string = "&".join(f"{encode(k)}={encode(v)}" for k, v in sorted_params)
        string_to_sign = f"POST&{encode('/')}&{encode(query_string)}"

        # HMAC-SHA1 签名
        key = (self.access_key_secret + "&").encode("utf-8")
        signature = hmac.new(key, string_to_sign.encode("utf-8"), hashlib.sha1).digest()
        return b64encode(signature).decode("utf-8")

    def _build_common_params(self, action: str) -> dict[str, str]:
        """构建公共请求参数"""
        timestamp = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
        return {
            "Format": "JSON",
            "Version": self.API_VERSION,
            "AccessKeyId": self.access_key_id,
            "SignatureMethod": "HMAC-SHA1",
            "Timestamp": timestamp,
            "SignatureVersion": "1.0",
            "SignatureNonce": str(uuid.uuid4()),
            "Action": action,
        }

    async def _call_api(self, action: str, params: dict) -> dict[str, Any]:
        """调用阿里云 API"""
        # 合并公共参数和业务参数
        all_params = self._build_common_params(action)
        all_params.update(params)

        # 计算签名
        signature = self._sign_request(all_params)
        all_params["Signature"] = signature

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"https://{self.API_HOST}",
                data=all_params,
                timeout=30.0,
            )
            response.raise_for_status()
            result = response.json()

            if result.get("Code") and result.get("Code") != "0":
                raise RuntimeError(
                    f"阿里云 API 错误: {result.get('Code')} - {result.get('Message')}"
                )
            return result

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
        # 构建任务配置
        task_config = {
            "appkey": self.app_key,
            "file_link": audio_url,
            "version": "4.0",
            "enable_words": True,  # 返回词级别时间戳
        }

        if enable_diarization:
            task_config["enable_diarization"] = True
            task_config["speaker_count"] = 2  # 双人对话

        params = {"Task": json.dumps(task_config)}

        result = await self._call_api("SubmitTask", params)
        task_id = result.get("TaskId")
        if not task_id:
            raise RuntimeError(f"提交任务失败: {result}")

        logger.info(f"阿里云 ASR 任务已提交: {task_id}")
        return task_id

    async def get_task_result(self, task_id: str) -> dict[str, Any]:
        """
        查询任务结果

        Args:
            task_id: 任务 ID

        Returns:
            dict: 任务结果
        """
        params = {"TaskId": task_id}
        return await self._call_api("GetTaskResult", params)

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

            result = await self.get_task_result(task_id)
            status_text = result.get("StatusText", "")

            # 状态: RUNNING, SUCCESS, FAILED
            if status_text == "SUCCESS":
                logger.info(f"阿里云 ASR 任务完成: {task_id}")
                return result
            elif status_text == "FAILED":
                raise RuntimeError(f"ASR 任务失败: {result.get('Result')}")

            logger.debug(f"ASR 任务状态: {status_text}, 等待中...")
            await asyncio.sleep(poll_interval)

    def _parse_result(
        self,
        result: dict[str, Any],
        speaker_labels: dict[str, str] | None = None,
    ) -> list[TranscriptSegment]:
        """
        解析识别结果

        Args:
            result: 阿里云返回的识别结果
            speaker_labels: 说话人标签映射

        Returns:
            list[TranscriptSegment]: 转写片段列表
        """
        segments = []
        speaker_labels = speaker_labels or {}
        default_labels = {"0": "staff", "1": "customer"}

        # 解析结果 JSON
        result_json = result.get("Result", "{}")
        if isinstance(result_json, str):
            result_data = json.loads(result_json)
        else:
            result_data = result_json

        # 获取句子列表
        sentences = result_data.get("Sentences", [])

        for sentence in sentences:
            speaker_id = str(sentence.get("SpeakerId", 0))
            speaker = speaker_labels.get(
                f"channel_{speaker_id}",
                default_labels.get(speaker_id, "staff"),
            )

            # 时间戳（毫秒 -> 秒）
            start_time = sentence.get("BeginTime", 0) / 1000
            end_time = sentence.get("EndTime", 0) / 1000
            text = sentence.get("Text", "").strip()

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
        task_id = await self.submit_task(audio_url, enable_diarization=True)

        # 2. 等待完成
        result = await self.wait_for_task(task_id)

        # 3. 解析结果
        return self._parse_result(result, speaker_labels)
