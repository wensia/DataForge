"""云客API客户端

提供云客CRM系统的API访问能力，包括：
- 认证登录 (auth)
- 报表查询 (report)
- 更多API...

使用示例:
    ```python
    # 1. 使用独立函数进行登录
    from app.clients.yunke import password_login

    result = await password_login(
        phone="13800138000",
        password="password",
        company_code="2fy7qa",
    )

    # 2. 使用客户端类访问API（推荐，支持自动登录重试）
    from app.clients.yunke import ReportClient

    client = ReportClient(
        phone="13800138000",
        company_code="2fy7qa",
        user_id="xxx",
        cookies={"user": "xxx", "userToken": "xxx"},
        auto_login_callback=auto_login_func,
    )

    report = await client.get_outbound_call_report(
        start_date="2025-11-30",
        end_date="2025-11-30",
        depart_id="xxx",
    )
    ```
"""

# 认证相关
from app.clients.yunke.auth import (
    check_and_get_users,
    encrypt_with_rsa,
    get_secure_key,
    password_login,
)

# 通话记录客户端
from app.clients.yunke.call_log import CallLogClient

# 客户端基类
from app.clients.yunke.client import (
    YunkeApiClient,
    YunkeApiException,
    YunkeLoginRequiredException,
    YunkePasswordException,
)

# 部门客户端
from app.clients.yunke.dept import DeptClient

# 录音客户端
from app.clients.yunke.record import RecordClient

# 报表客户端
from app.clients.yunke.report import ReportClient

__all__ = [
    # 认证
    "check_and_get_users",
    "encrypt_with_rsa",
    "get_secure_key",
    "password_login",
    # 客户端基类
    "YunkeApiClient",
    "YunkeApiException",
    "YunkeLoginRequiredException",
    "YunkePasswordException",
    # 报表
    "ReportClient",
    # 录音
    "RecordClient",
    # 通话记录
    "CallLogClient",
    # 部门
    "DeptClient",
]
