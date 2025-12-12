"""ASR 语音识别服务

提供 ASR 配置管理和语音转写功能。
录音 URL 直接从数据库 raw_data 中提取，无需调用云客 API。
"""

import json
import logging
import traceback
from typing import Any

from sqlmodel import Session, select

from app.clients.asr import (
    AlibabaASRClient,
    ASRClient,
    TencentASRClient,
    TranscriptSegment,
    VolcengineASRClient,
)
from app.database import engine
from app.models.asr_config import ASRConfig, ASRProvider
from app.models.call_record import CallRecord
from app.scheduler.task_logger import task_log

logger = logging.getLogger(__name__)


class ASRService:
    """ASR 语音识别服务"""

    def get_config(self, config_id: int) -> ASRConfig | None:
        """获取 ASR 配置

        Args:
            config_id: 配置 ID

        Returns:
            ASRConfig | None: 配置对象，不存在返回 None
        """
        with Session(engine) as session:
            return session.get(ASRConfig, config_id)

    def get_active_configs(self) -> list[ASRConfig]:
        """获取所有启用的 ASR 配置

        Returns:
            list[ASRConfig]: 启用的配置列表
        """
        with Session(engine) as session:
            statement = select(ASRConfig).where(ASRConfig.is_active)
            return list(session.exec(statement).all())

    def get_config_options(self) -> list[dict[str, Any]]:
        """获取 ASR 配置下拉选项

        Returns:
            list[dict]: 配置选项列表，格式：[{id, name, provider}]
        """
        configs = self.get_active_configs()
        return [
            {
                "id": c.id,
                "name": c.name,
                "provider": c.provider,
            }
            for c in configs
        ]

    def create_client(self, config: ASRConfig) -> ASRClient:
        """根据配置创建 ASR 客户端

        Args:
            config: ASR 配置

        Returns:
            ASRClient: 对应提供商的客户端实例

        Raises:
            ValueError: 不支持的提供商
        """
        credentials = json.loads(config.credentials) if config.credentials else {}
        provider = config.provider

        if provider == ASRProvider.TENCENT:
            return TencentASRClient(
                secret_id=credentials.get("secret_id", ""),
                secret_key=credentials.get("secret_key", ""),
                app_id=credentials.get("app_id"),
            )
        elif provider == ASRProvider.ALIBABA:
            return AlibabaASRClient(
                access_key_id=credentials.get("access_key_id", ""),
                access_key_secret=credentials.get("access_key_secret", ""),
                app_key=credentials.get("app_key", ""),
            )
        elif provider == ASRProvider.VOLCENGINE:
            return VolcengineASRClient(
                app_id=credentials.get("app_id", ""),
                access_token=credentials.get("access_token", ""),
                cluster=credentials.get("cluster", "volc.bigasr.auc"),
                qps=int(credentials.get("qps", 20)),
            )
        else:
            raise ValueError(f"不支持的 ASR 提供商: {provider}")

    async def get_client_by_id(self, config_id: int) -> ASRClient:
        """根据配置 ID 获取 ASR 客户端

        Args:
            config_id: 配置 ID

        Returns:
            ASRClient: ASR 客户端

        Raises:
            ValueError: 配置不存在或未启用
        """
        config = self.get_config(config_id)
        if not config:
            raise ValueError(f"ASR 配置不存在: {config_id}")
        if not config.is_active:
            raise ValueError(f"ASR 配置未启用: {config_id}")
        return self.create_client(config)

    @staticmethod
    def extract_record_url(raw_data: dict[str, Any]) -> str | None:
        """从 raw_data 中提取录音 URL

        录音 URL 已经在同步时保存到 raw_data 中，直接提取即可。

        Args:
            raw_data: 通话记录的原始数据

        Returns:
            str | None: 录音 URL，不存在返回 None
        """
        # 尝试多种可能的字段名
        url = (
            raw_data.get("录音地址")
            or raw_data.get("voiceUrl")
            or raw_data.get("voice_url")
            or raw_data.get("recordUrl")
            or raw_data.get("record_url")
        )

        if url and isinstance(url, str) and url.startswith("http"):
            return url

        return None

    def get_record_url(self, record: CallRecord) -> str | None:
        """获取通话记录的录音 URL

        直接从 raw_data 中提取，不需要调用外部 API。

        Args:
            record: 通话记录

        Returns:
            str | None: 录音 URL，无录音返回 None
        """
        url = self.extract_record_url(record.raw_data)
        if not url:
            logger.debug(f"通话记录 {record.id} 无录音")
        return url

    @staticmethod
    def format_transcript(
        segments: list[TranscriptSegment],
        staff_name: str = "员工",
        customer_name: str = "客户",
    ) -> str:
        """格式化转写结果

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
        return ASRClient.format_transcript(segments, staff_name, customer_name)

    async def transcribe_record(
        self,
        record: CallRecord,
        asr_config_id: int,
        staff_name: str | None = None,
        correct_table_name: str | None = None,
    ) -> list[dict] | None:
        """转写单条通话记录

        Args:
            record: 通话记录
            asr_config_id: ASR 配置 ID
            staff_name: 员工名称（保留参数，用于日志显示）
            correct_table_name: 替换词本名称（仅火山引擎有效）

        Returns:
            list[dict] | None: 转写结果列表，失败返回 None
        """
        # 1. 获取录音 URL（直接从 raw_data 提取）
        audio_url = self.get_record_url(record)
        if not audio_url:
            task_log("  - 无法获取录音 URL")
            logger.warning(f"通话记录 {record.id} 无法获取录音 URL")
            return None

        task_log(f"  - 录音 URL: {audio_url[:80]}...")

        # 2. 获取 ASR 客户端
        asr_client = await self.get_client_by_id(asr_config_id)
        task_log("  - 创建 ASR 任务...")

        # 3. 执行转写
        try:
            task_log("  - [DEBUG] 开始调用 ASR transcribe...")
            segments = await asr_client.transcribe(
                audio_url,
                correct_table_name=correct_table_name,
            )
            task_log("  - [DEBUG] ASR transcribe 返回")
            task_log(f"  - ASR 返回 {len(segments)} 个语音片段")
        except Exception as e:
            # 获取完整的异常信息，包括类型和 traceback
            error_type = type(e).__name__
            error_msg = str(e) or "(无错误消息)"
            tb_lines = traceback.format_exc().split("\n")[-5:-1]  # 取最后几行
            tb_short = " | ".join(line.strip() for line in tb_lines if line.strip())
            task_log(f"  - [ERROR] ASR 转写异常: [{error_type}] {error_msg}")
            task_log(f"  - [ERROR] 调用栈: {tb_short}")
            tb = traceback.format_exc()
            logger.error(f"ASR 转写失败: [{error_type}] {error_msg}\n{tb}")
            return None

        # 4. 检查结果
        if not segments:
            task_log("  - [WARN] ASR 返回空结果（无语音片段）")
            return None

        # 5. 转换为字典列表（直接保存为 JSON 字段）
        transcript = [
            {
                "start_time": seg.start_time,
                "end_time": seg.end_time,
                "speaker": seg.speaker,
                "text": seg.text,
                "emotion": seg.emotion,  # 情绪标签 (火山引擎支持)
            }
            for seg in segments
        ]

        task_log(f"  - 转写成功，{len(transcript)} 个片段")
        return transcript

    def update_record_transcript(
        self,
        record_id: int,
        transcript: list[dict],
    ) -> bool:
        """更新通话记录的转写文本

        Args:
            record_id: 通话记录 ID
            transcript: 转写数据列表

        Returns:
            bool: 是否更新成功
        """
        with Session(engine) as session:
            record = session.get(CallRecord, record_id)
            if not record:
                logger.error(f"通话记录不存在: {record_id}")
                return False

            record.transcript = transcript
            session.add(record)
            session.commit()
            logger.info(f"更新通话记录 {record_id} 转写文本成功")
            return True


# 全局单例
asr_service = ASRService()
