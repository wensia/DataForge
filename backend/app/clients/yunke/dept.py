"""云客部门API客户端

提供部门树等组织架构API。
"""

from typing import Any

from loguru import logger

from app.clients.yunke.client import YunkeApiClient


class DeptClient(YunkeApiClient):
    """云客部门API客户端

    提供部门树、组织架构等API接口。

    使用示例:
        ```python
        client = DeptClient(
            phone="13800138000",
            company_code="2fy7qa",
            user_id="xxx",
            cookies={"user": "xxx", "userToken": "xxx"},
            auto_login_callback=auto_login_func,
        )

        # 获取部门树（不传 root_dept_id 则获取整个部门树）
        result = await client.get_dept_tree(show_user=True)
        ```
    """

    async def get_dept_tree(
        self,
        root_dept_id: str | None = None,
        show_user: bool = True,
        show_user_status: str = "",
        query_qywx_status: bool = False,
    ) -> dict[str, Any]:
        """获取部门树

        获取公司的部门组织架构树形结构。

        Args:
            root_dept_id: 根部门ID（可选，不传则获取整个部门树）
            show_user: 是否显示用户
            show_user_status: 用户状态筛选
            query_qywx_status: 是否查询企微状态

        Returns:
            dict: 部门树数据

        Raises:
            YunkePasswordException: 密码错误
            YunkeApiException: API调用失败
        """
        payload: dict[str, Any] = {
            "showUser": show_user,
            "showUserStatus": show_user_status,
            "queryQywxStatus": query_qywx_status,
        }

        # 只有传入 root_dept_id 时才添加到 payload
        if root_dept_id:
            payload["id"] = root_dept_id

        logger.info(
            f"获取部门树: root_dept_id={root_dept_id or '全部'}, show_user={show_user}"
        )

        return await self._request(
            "POST",
            "/usercenter/dept/tree",
            json=payload,
            referer="/cms/home/statistics",
        )
