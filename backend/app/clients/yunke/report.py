"""云客报表API客户端

提供通话报表等统计API。
"""

from datetime import date
from typing import Any, Callable, Optional

from loguru import logger

from app.clients.yunke.client import YunkeApiClient


class ReportClient(YunkeApiClient):
    """云客报表API客户端
    
    提供通话报表、统计等API接口。
    
    使用示例:
        ```python
        client = ReportClient(
            phone="13800138000",
            company_code="2fy7qa",
            user_id="xxx",
            cookies={"user": "xxx", "userToken": "xxx"},
            auto_login_callback=auto_login_func,
        )
        
        # 获取外呼报表
        result = await client.get_call_index_detail(
            start_date="2025-11-30",
            end_date="2025-11-30",
            depart_id="xxx",
            child_module="outCall",
        )
        ```
    """
    
    async def get_call_index_detail(
        self,
        start_date: str | date,
        end_date: str | date,
        depart_id: str,
        child_module: str = "outCall",
        search_user_id: str = "",
        option: str = "1",
        page: int = 1,
        page_size: int = 10,
    ) -> dict[str, Any]:
        """获取通话报表详情
        
        获取指定时间范围内的通话统计数据，支持按部门和员工筛选。
        
        Args:
            start_date: 开始日期，格式 YYYY-MM-DD
            end_date: 结束日期，格式 YYYY-MM-DD
            depart_id: 部门ID
            child_module: 子模块类型
                - outCall: 外呼
                - inCall: 呼入
                - allCall: 全部
            search_user_id: 搜索的用户ID（可选）
            option: 选项，默认 "1"
            page: 页码，默认 1
            page_size: 每页数量，默认 10
            
        Returns:
            dict: 报表数据
            
        Raises:
            YunkePasswordException: 密码错误
            YunkeApiException: API调用失败
        """
        # 转换日期格式
        if isinstance(start_date, date):
            start_date = start_date.strftime("%Y-%m-%d")
        if isinstance(end_date, date):
            end_date = end_date.strftime("%Y-%m-%d")
        
        payload = {
            "childModule": child_module,
            "starttime": start_date,
            "endtime": end_date,
            "departId": depart_id,
            "searchUserId": search_user_id,
            "option": option,
            "page": page,
            "pageSize": page_size,
        }
        
        logger.info(
            f"获取通话报表: module={child_module}, "
            f"date={start_date}~{end_date}, depart={depart_id}"
        )
        
        return await self._request(
            "POST",
            "/yunke-report-phone/module/getIndexDetail",
            json=payload,
            referer="/cms/home/reportform/call",
        )
    
    async def get_outbound_call_report(
        self,
        start_date: str | date,
        end_date: str | date,
        depart_id: str,
        search_user_id: str = "",
        page: int = 1,
        page_size: int = 10,
    ) -> dict[str, Any]:
        """获取外呼报表（快捷方法）
        
        Args:
            start_date: 开始日期
            end_date: 结束日期
            depart_id: 部门ID
            search_user_id: 搜索的用户ID（可选）
            page: 页码
            page_size: 每页数量
            
        Returns:
            dict: 外呼报表数据
        """
        return await self.get_call_index_detail(
            start_date=start_date,
            end_date=end_date,
            depart_id=depart_id,
            child_module="outCall",
            search_user_id=search_user_id,
            page=page,
            page_size=page_size,
        )
    
    async def get_inbound_call_report(
        self,
        start_date: str | date,
        end_date: str | date,
        depart_id: str,
        search_user_id: str = "",
        page: int = 1,
        page_size: int = 10,
    ) -> dict[str, Any]:
        """获取呼入报表（快捷方法）
        
        Args:
            start_date: 开始日期
            end_date: 结束日期
            depart_id: 部门ID
            search_user_id: 搜索的用户ID（可选）
            page: 页码
            page_size: 每页数量
            
        Returns:
            dict: 呼入报表数据
        """
        return await self.get_call_index_detail(
            start_date=start_date,
            end_date=end_date,
            depart_id=depart_id,
            child_module="inCall",
            search_user_id=search_user_id,
            page=page,
            page_size=page_size,
        )



