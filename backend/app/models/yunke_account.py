"""云客账号模型"""

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel

from app.models.base import BaseTable

if TYPE_CHECKING:
    from app.models.yunke_company import YunkeCompany


class YunkeAccount(BaseTable, table=True):
    """云客账号表

    Attributes:
        phone: 手机号
        password: 密码（加密存储）
        company_id: 关联公司ID
        user_id: 云客用户ID
        token: 登录token
        cookies: cookies JSON字符串
        last_login: 最后登录时间
        status: 状态：1正常 0失效

    Note:
        phone + company_id 为联合唯一索引
    """

    __tablename__ = "yunke_accounts"
    __table_args__ = (
        UniqueConstraint("phone", "company_id", name="uix_phone_company"),
    )

    phone: str = Field(index=True, description="手机号")
    password: str = Field(description="密码（加密存储）")
    company_id: int = Field(foreign_key="yunke_companies.id", description="关联公司ID")
    user_id: str | None = Field(default=None, description="云客用户ID")
    token: str | None = Field(default=None, description="登录token")
    cookies: str | None = Field(default=None, description="cookies JSON")
    last_login: datetime | None = Field(default=None, description="最后登录时间")
    status: int = Field(default=0, description="状态：1正常 0失效")

    # 关联关系
    company: Optional["YunkeCompany"] = Relationship(back_populates="accounts")


class YunkeAccountCreate(SQLModel):
    """创建账号请求模型"""

    phone: str = Field(..., description="手机号")
    password: str = Field(..., description="密码")
    company_code: str = Field(..., description="公司代码")
    company_name: str = Field(..., description="公司名称")
    domain: str = Field(default="", description="公司域名")


class YunkeAccountUpdate(SQLModel):
    """更新账号请求模型"""

    password: str | None = Field(default=None, description="密码")


class YunkeAccountResponse(SQLModel):
    """账号响应模型（不包含敏感信息）"""

    id: int
    phone: str
    company_id: int
    company_code: str
    company_name: str
    user_id: str | None
    last_login: datetime | None
    status: int
    created_at: datetime
    updated_at: datetime
