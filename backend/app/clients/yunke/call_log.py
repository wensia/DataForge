"""云客通话记录API客户端

提供通话记录列表查询等API。
"""

from typing import Any

from loguru import logger

from app.clients.yunke.client import YunkeApiClient, YunkeApiException


class CallLogClient(YunkeApiClient):
    """云客通话记录API客户端

    提供通话记录相关API接口。

    使用示例:
        ```python
        client = CallLogClient(
            phone="13800138000",
            company_code="2fy7qa",
            user_id="xxx",
            cookies={"user": "xxx", "userToken": "xxx"},
            auto_login_callback=auto_login_func,
        )

        # 获取通话记录
        result = await client.get_call_logs(
            start_time="2025-11-01 00:00",
            end_time="2025-11-30 23:59",
            page=1,
            page_size=100,
        )
        ```
    """

    async def get_call_logs(
        self,
        start_time: str,
        end_time: str,
        page: int = 1,
        page_size: int = 100,
        department_id: str = "",
        user_id: str = "",
        call_type: str = "",
        search_info: str = "",
        search_phone: str = "",
    ) -> dict[str, Any]:
        """获取通话记录列表

        根据日期范围和筛选条件获取通话记录。

        Args:
            start_time: 开始时间，格式 "YYYY-MM-DD HH:mm"
            end_time: 结束时间，格式 "YYYY-MM-DD HH:mm"
            page: 页码，从1开始
            page_size: 每页数量，最大200
            department_id: 部门ID，为空查全部
            user_id: 用户ID，为空查全部
            call_type: 通话类型，s=外呼，i=呼入，空=全部
            search_info: 搜索关键词
            search_phone: 搜索电话号码

        Returns:
            dict: 包含通话记录列表的响应数据
                - data.data: 通话记录列表
                - data.totalCount: 总记录数
                - data.pageCount: 总页数

        Raises:
            YunkeApiException: API调用失败
        """
        logger.info(
            f"获取通话记录: {start_time} - {end_time}, page={page}, size={page_size}"
        )

        payload = {
            "page": page,
            "pageSize": page_size,
            "lastConnectTimeStart": start_time,
            "lastConnectTimeEnd": end_time,
            "departmentId": department_id,
            "userId": user_id,
            "callType": call_type,
            "searchInfo": search_info,
            "searchPhone": search_phone,
            # 以下为可选的其他筛选参数
            "salesProgress": "",
            "startVoiceTime": "",
            "endVoiceTime": "",
            "startCreateTime": "",
            "endCreateTime": "",
            "id": "",
            "userKey": "",
            "callTimeStar": "",
            "callTimeEnd": "",
            "recordFroms": [],
            "quitUserId": "",
            "customerSource": "",
        }

        response = await self._request(
            "POST",
            "/pc/callLog/list",
            json=payload,
            referer="/cms/customer/callHistory",
        )

        # 检查响应
        if not response.get("success"):
            message = response.get("message", "获取通话记录失败")
            raise YunkeApiException(message)

        data = response.get("data", {})
        total_count = data.get("totalCount", 0)
        page_count = data.get("pageCount", 0)
        records = data.get("data", [])

        logger.info(
            f"获取通话记录成功: 共{total_count}条, {page_count}页, 当前页{len(records)}条"
        )

        return response
