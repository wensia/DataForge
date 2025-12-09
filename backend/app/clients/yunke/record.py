"""云客录音API客户端

提供通话录音下载地址获取等API。
"""

from typing import Any

from loguru import logger

from app.clients.yunke.client import YunkeApiClient, YunkeApiException


class RecordClient(YunkeApiClient):
    """云客录音API客户端

    提供通话录音相关API接口。

    使用示例:
        ```python
        client = RecordClient(
            phone="13800138000",
            company_code="2fy7qa",
            user_id="xxx",
            cookies={"user": "xxx", "userToken": "xxx"},
            auto_login_callback=auto_login_func,
        )

        # 获取录音下载地址
        url = await client.get_record_url("voiceId123")
        ```
    """

    async def get_record_url(self, voice_id: str) -> str:
        """获取录音下载地址

        通过voiceId获取MP3录音文件的下载URL。

        Args:
            voice_id: 录音ID（从云客URL中提取的voiceId参数）

        Returns:
            str: MP3文件下载地址

        Raises:
            YunkeApiException: API调用失败
        """
        logger.info(f"获取录音下载地址: voice_id={voice_id}")

        # 使用multipart/form-data格式发送请求
        # 参数名是 callActionId，值是 voiceId
        response = await self._request(
            "POST",
            "/pc/callLog/getRecordUrl",
            files={"callActionId": (None, voice_id)},
            referer="/cms/customer/callDetail",
        )

        logger.debug(f"云客录音API响应: {response}")

        # 检查响应
        if not response.get("success"):
            message = response.get("message", "获取录音地址失败")
            raise YunkeApiException(message)

        download_url = response.get("data", "")
        if not download_url:
            raise YunkeApiException("录音下载地址为空")

        logger.info(f"获取录音下载地址成功: {download_url[:50]}...")
        return download_url
