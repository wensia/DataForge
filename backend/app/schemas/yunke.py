"""云客相关的Pydantic模型"""

import re
from typing import Any

from pydantic import BaseModel, Field, field_validator

# 中国手机号正则表达式
PHONE_PATTERN = re.compile(r"^1[3-9]\d{9}$")


def validate_phone(value: str) -> str:
    """验证手机号格式

    Args:
        value: 手机号字符串

    Returns:
        str: 验证通过的手机号

    Raises:
        ValueError: 手机号格式不正确
    """
    if not PHONE_PATTERN.match(value):
        raise ValueError("手机号格式不正确，请输入11位有效手机号")
    return value


class YunkeLoginRequest(BaseModel):
    """云客登录请求参数"""

    phone: str = Field(..., description="手机号")
    password: str = Field(..., description="密码")
    company_code: str = Field(default="2fy7qa", description="公司代码")
    login_type: str = Field(default="yunkecn", description="登录类型")

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str) -> str:
        return validate_phone(v)


class YunkeLoginData(BaseModel):
    """云客登录响应数据"""

    json: dict[str, Any] = Field(..., description="云客返回的原始JSON")
    cookies: dict[str, str] = Field(..., description="登录后的cookies")


class YunkeSecureKeyRequest(BaseModel):
    """获取RSA公钥请求参数"""

    phone: str = Field(..., description="手机号")

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str) -> str:
        return validate_phone(v)


class YunkeSecureKeyData(BaseModel):
    """RSA公钥响应数据"""

    modulus: str = Field(..., description="RSA模数（十六进制）")
    public_exponent: str = Field(..., description="RSA公钥指数（十六进制）")
    cookies: dict[str, str] = Field(..., description="请求后的cookies")


class YunkeCheckUsersRequest(BaseModel):
    """检查用户公司列表请求参数"""

    account: str = Field(..., description="手机号")
    password: str = Field(..., description="密码")

    @field_validator("account")
    @classmethod
    def check_account(cls, v: str) -> str:
        return validate_phone(v)


class YunkeCheckUsersData(BaseModel):
    """用户公司列表响应数据"""

    json: dict[str, Any] = Field(..., description="云客返回的原始JSON")
    cookies: dict[str, str] = Field(..., description="请求后的cookies")


class YunkeCallReportRequest(BaseModel):
    """通话报表请求参数
    
    对应云客API: /yunke-report-phone/module/getIndexDetail
    """

    account_id: int = Field(..., description="账号ID（用于获取登录凭证）")
    child_module: str = Field(
        default="outCall",
        description="子模块类型: outCall(外呼), inCall(呼入), allCall(全部)",
    )
    start_date: str = Field(..., alias="starttime", description="开始日期，格式 YYYY-MM-DD")
    end_date: str = Field(..., alias="endtime", description="结束日期，格式 YYYY-MM-DD")
    depart_id: str = Field(..., alias="departId", description="部门ID")
    search_user_id: str = Field(default="", alias="searchUserId", description="搜索的用户ID（可选）")
    option: str = Field(default="1", description="选项")
    page: int = Field(default=1, ge=1, description="页码")
    page_size: int = Field(default=10, ge=1, le=100, alias="pageSize", description="每页数量")

    model_config = {"populate_by_name": True}

    @field_validator("start_date", "end_date")
    @classmethod
    def check_date_format(cls, v: str) -> str:
        """验证日期格式"""
        import re
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", v):
            raise ValueError("日期格式不正确，请使用 YYYY-MM-DD 格式")
        return v
    
    @field_validator("child_module")
    @classmethod
    def check_child_module(cls, v: str) -> str:
        """验证子模块类型"""
        valid_modules = {"outCall", "inCall", "allCall"}
        if v not in valid_modules:
            raise ValueError(f"child_module 必须是 {valid_modules} 之一")
        return v


class YunkeCallReportData(BaseModel):
    """外呼报表响应数据"""

    json: dict[str, Any] = Field(..., description="云客返回的原始JSON")
