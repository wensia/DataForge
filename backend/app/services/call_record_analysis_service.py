"""通话记录分析服务

使用 DeepSeek Function Calling 实现智能通话记录分析。
"""

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from loguru import logger
from sqlmodel import Session

from app.clients.ai import DeepSeekClient
from app.clients.ai.base import AIClientError, ChatMessage
from app.clients.ai.prompts import CALL_RECORD_ANALYSIS_PROMPT
from app.clients.ai.tools import CALL_RECORD_TOOLS, execute_tool
from app.config import settings
from app.models.ai_config import AIConfig


@dataclass
class AnalysisResponse:
    """分析响应"""

    content: str
    queries_executed: list[dict[str, Any]]
    tokens_used: int | None
    error: str | None = None


class CallRecordAnalysisError(Exception):
    """通话记录分析错误"""

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


class CallRecordAnalysisService:
    """通话记录分析服务

    使用 DeepSeek + Function Calling 实现智能分析。
    """

    MAX_TOOL_ITERATIONS = 5  # 最大工具调用迭代次数

    def __init__(self, session: Session):
        self.session = session
        self._client: DeepSeekClient | None = None

    def _get_client(self) -> DeepSeekClient:
        """获取 DeepSeek 客户端"""
        if self._client:
            return self._client

        # 优先从数据库获取配置
        db_config = self.session.exec(
            AIConfig.__table__.select().where(
                AIConfig.provider == "deepseek",
                AIConfig.is_active == True,  # noqa: E712
            )
        ).first()

        if db_config:
            logger.info(f"使用数据库 AI 配置: {db_config.name}")
            self._client = DeepSeekClient(
                api_key=db_config.api_key,
                base_url=db_config.base_url or None,
            )
        elif settings.deepseek_api_key:
            logger.info("使用环境变量 DeepSeek 配置")
            self._client = DeepSeekClient(api_key=settings.deepseek_api_key)
        else:
            raise CallRecordAnalysisError("未配置 DeepSeek API Key")

        return self._client

    async def analyze(
        self,
        question: str,
        history: list[dict[str, str]] | None = None,
    ) -> AnalysisResponse:
        """分析通话记录

        Args:
            question: 用户问题
            history: 对话历史 [{"role": "user/assistant", "content": "..."}]

        Returns:
            AnalysisResponse: 分析结果
        """
        logger.info(f"开始分析: {question[:100]}...")

        try:
            client = self._get_client()
        except CallRecordAnalysisError:
            raise
        except Exception as e:
            raise CallRecordAnalysisError(f"获取 AI 客户端失败: {e}") from e

        # 构建消息列表
        messages: list[ChatMessage] = [
            ChatMessage(role="system", content=CALL_RECORD_ANALYSIS_PROMPT),
        ]

        # 添加历史消息
        if history:
            for msg in history:
                messages.append(
                    ChatMessage(
                        role=msg.get("role", "user"),
                        content=msg.get("content", ""),
                    )
                )

        # 添加当前问题
        messages.append(ChatMessage(role="user", content=question))

        # 记录执行的查询
        queries_executed: list[dict[str, Any]] = []
        total_tokens = 0

        try:
            # Function Calling 循环
            for iteration in range(self.MAX_TOOL_ITERATIONS):
                logger.debug(f"Function Calling 迭代 {iteration + 1}")

                # 调用 DeepSeek
                response = await client.chat_with_tools(
                    messages=messages,
                    tools=CALL_RECORD_TOOLS,
                    tool_choice="auto",
                    temperature=0.3,  # 降低温度提高准确性
                )

                if response.tokens_used:
                    total_tokens += response.tokens_used

                # 检查是否有工具调用
                if not response.tool_calls:
                    # 没有工具调用，返回最终结果
                    logger.info(f"分析完成，执行了 {len(queries_executed)} 次查询")
                    return AnalysisResponse(
                        content=response.content,
                        queries_executed=queries_executed,
                        tokens_used=total_tokens,
                    )

                # 处理工具调用
                # 将 assistant 消息（包含 tool_calls）添加到历史
                messages.append(
                    ChatMessage(
                        role="assistant",
                        content=response.content or "",
                        tool_calls=response.tool_calls,
                    )
                )

                # 执行每个工具调用
                for tool_call in response.tool_calls:
                    tool_name = tool_call.function.name
                    tool_args = json.loads(tool_call.function.arguments)

                    logger.info(f"执行工具: {tool_name}")
                    logger.debug(f"工具参数: {tool_args}")

                    # 执行工具
                    result = await execute_tool(
                        tool_name=tool_name,
                        tool_args=tool_args,
                        session=self.session,
                    )

                    # 记录查询
                    queries_executed.append(
                        {
                            "tool": tool_name,
                            "args": tool_args,
                            "result": result,
                            "timestamp": datetime.now().isoformat(),
                        }
                    )

                    # 将工具结果添加到消息
                    messages.append(
                        ChatMessage(
                            role="tool",
                            content=json.dumps(result, ensure_ascii=False),
                            tool_call_id=tool_call.id,
                        )
                    )

            # 达到最大迭代次数
            logger.warning(f"达到最大迭代次数 {self.MAX_TOOL_ITERATIONS}")

            # 最后一次调用获取总结
            final_response = await client.chat(
                messages=messages,
                temperature=0.3,
            )

            if final_response.tokens_used:
                total_tokens += final_response.tokens_used

            return AnalysisResponse(
                content=final_response.content,
                queries_executed=queries_executed,
                tokens_used=total_tokens,
            )

        except AIClientError as e:
            logger.error(f"AI 客户端错误: {e}")
            raise CallRecordAnalysisError(f"AI 服务错误: {e.message}") from e
        except Exception as e:
            logger.error(f"分析错误: {e}")
            raise CallRecordAnalysisError(f"分析失败: {e}") from e

    async def quick_query(
        self,
        phones: list[str],
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> AnalysisResponse:
        """快速查询被叫号码

        不使用 AI，直接执行 SQL 查询。

        Args:
            phones: 被叫号码列表
            start_date: 开始日期 (YYYY-MM-DD)
            end_date: 结束日期 (YYYY-MM-DD)

        Returns:
            AnalysisResponse: 查询结果
        """
        if not phones:
            raise CallRecordAnalysisError("请提供被叫号码列表")

        # 构建 SQL
        phone_list = ", ".join(f"'{p}'" for p in phones)
        sql = f"""
        SELECT
            callee as 被叫号码,
            COUNT(*) as 通话数,
            COUNT(DISTINCT staff_name) as 对接员工数,
            SUM(duration) as 总时长秒,
            ROUND(AVG(duration)::numeric, 1) as 平均时长秒,
            SUM(CASE WHEN duration >= 60 THEN 1 ELSE 0 END) as 有效通话数,
            MAX(call_time) as 最后通话时间
        FROM call_records
        WHERE callee IN ({phone_list})
        """

        if start_date:
            sql += f" AND call_time >= '{start_date}'"
        if end_date:
            sql += f" AND call_time < '{end_date}'"

        sql += " GROUP BY callee ORDER BY 通话数 DESC"

        # 执行查询
        result = await execute_tool(
            tool_name="execute_call_record_query",
            tool_args={"sql": sql, "description": "快速查询被叫号码"},
            session=self.session,
        )

        if not result["success"]:
            raise CallRecordAnalysisError(result["error"] or "查询失败")

        # 格式化结果
        data = result["data"]
        if not data:
            content = f"未找到这些被叫号码的通话记录: {', '.join(phones)}"
        else:
            content = f"找到 {len(data)} 个被叫号码的通话记录：\n\n"
            content += "| 被叫号码 | 通话数 | 员工数 | 总时长 | 平均时长 | 有效通话 | 最后通话 |\n"
            content += "|:---------|-------:|-------:|-------:|---------:|---------:|:---------|\n"
            for row in data:
                duration_min = round(row["总时长秒"] / 60, 1) if row["总时长秒"] else 0
                content += (
                    f"| {row['被叫号码']} | {row['通话数']} | {row['对接员工数']} | "
                    f"{duration_min}分 | {row['平均时长秒']}秒 | {row['有效通话数']} | "
                    f"{row['最后通话时间'][:10] if row['最后通话时间'] else '-'} |\n"
                )

        return AnalysisResponse(
            content=content,
            queries_executed=[
                {
                    "tool": "execute_call_record_query",
                    "args": {"sql": sql},
                    "result": result,
                }
            ],
            tokens_used=None,
        )
