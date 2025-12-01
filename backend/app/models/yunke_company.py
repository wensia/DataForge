"""云客公司模型"""

from typing import TYPE_CHECKING, List

from sqlmodel import Field, Relationship, SQLModel

from app.models.base import BaseTable

if TYPE_CHECKING:
    from app.models.yunke_account import YunkeAccount


class YunkeCompany(BaseTable, table=True):
    """云客公司表

    Attributes:
        company_code: 公司代码（唯一）
        company_name: 公司名称
        domain: 公司域名
        user_center_domain: 用户中心域名
    """

    __tablename__ = "yunke_companies"

    company_code: str = Field(unique=True, index=True, description="公司代码")
    company_name: str = Field(description="公司名称")
    domain: str = Field(default="", description="公司域名")
    user_center_domain: str = Field(default="", description="用户中心域名")

    # 关联关系
    accounts: List["YunkeAccount"] = Relationship(back_populates="company")


class YunkeCompanyCreate(SQLModel):
    """创建公司请求模型"""

    company_code: str = Field(..., description="公司代码")
    company_name: str = Field(..., description="公司名称")
    domain: str = Field(default="", description="公司域名")
    user_center_domain: str = Field(default="", description="用户中心域名")


class YunkeCompanyResponse(SQLModel):
    """公司响应模型"""

    id: int
    company_code: str
    company_name: str
    domain: str
    user_center_domain: str
