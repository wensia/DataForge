"""云客账号管理服务"""

import base64
import json
from datetime import datetime
from typing import Optional

from loguru import logger
from sqlmodel import Session, select

from app.clients.yunke import check_and_get_users, password_login
from app.database import engine
from app.models.yunke_account import (
    YunkeAccount,
    YunkeAccountCreate,
    YunkeAccountResponse,
    YunkeAccountUpdate,
)
from app.models.yunke_company import YunkeCompany


def _encrypt_password(password: str) -> str:
    """简单加密密码（Base64编码）

    生产环境建议使用更安全的加密方式

    Args:
        password: 明文密码

    Returns:
        str: 加密后的密码
    """
    return base64.b64encode(password.encode()).decode()


def _decrypt_password(encrypted: str) -> str:
    """解密密码

    Args:
        encrypted: 加密的密码

    Returns:
        str: 明文密码
    """
    return base64.b64decode(encrypted.encode()).decode()


def _get_or_create_company(
    session: Session,
    company_code: str,
    company_name: str,
    domain: str = "",
) -> YunkeCompany:
    """获取或创建公司

    Args:
        session: 数据库会话
        company_code: 公司代码
        company_name: 公司名称
        domain: 公司域名

    Returns:
        YunkeCompany: 公司对象
    """
    statement = select(YunkeCompany).where(YunkeCompany.company_code == company_code)
    company = session.exec(statement).first()

    if company:
        # 更新公司信息（如果有变化）
        updated = False
        if company.company_name != company_name:
            company.company_name = company_name
            updated = True
        if domain and company.domain != domain:
            company.domain = domain
            updated = True
        if updated:
            company.updated_at = datetime.now()
            session.add(company)
            logger.info(f"更新公司信息: {company_name} ({company_code}), domain={domain}")
        return company

    # 创建新公司
    company = YunkeCompany(
        company_code=company_code,
        company_name=company_name,
        domain=domain,
    )
    session.add(company)
    session.flush()  # 获取ID
    logger.info(f"创建公司: {company_name} ({company_code})")
    return company


def _account_to_response(account: YunkeAccount, company: YunkeCompany) -> YunkeAccountResponse:
    """转换账号为响应模型

    Args:
        account: 账号对象
        company: 公司对象

    Returns:
        YunkeAccountResponse: 响应模型
    """
    return YunkeAccountResponse(
        id=account.id,
        phone=account.phone,
        company_id=account.company_id,
        company_code=company.company_code,
        company_name=company.company_name,
        user_id=account.user_id,
        last_login=account.last_login,
        status=account.status,
        created_at=account.created_at,
        updated_at=account.updated_at,
    )


def get_all_accounts() -> list[YunkeAccountResponse]:
    """获取所有账号列表

    Returns:
        list: 账号列表
    """
    with Session(engine) as session:
        statement = select(YunkeAccount, YunkeCompany).join(YunkeCompany)
        results = session.exec(statement).all()
        return [_account_to_response(acc, comp) for acc, comp in results]


def get_account_by_id(account_id: int) -> Optional[tuple[YunkeAccount, YunkeCompany]]:
    """根据ID获取账号

    Args:
        account_id: 账号ID

    Returns:
        tuple or None: (账号, 公司) 元组
    """
    with Session(engine) as session:
        account = session.get(YunkeAccount, account_id)
        if not account:
            return None
        company = session.get(YunkeCompany, account.company_id)
        return (account, company)


def get_account_by_phone_company(phone: str, company_code: str) -> Optional[YunkeAccount]:
    """根据手机号和公司代码获取账号

    Args:
        phone: 手机号
        company_code: 公司代码

    Returns:
        YunkeAccount or None
    """
    with Session(engine) as session:
        statement = (
            select(YunkeAccount)
            .join(YunkeCompany)
            .where(YunkeAccount.phone == phone)
            .where(YunkeCompany.company_code == company_code)
        )
        return session.exec(statement).first()


def create_or_update_account(data: YunkeAccountCreate) -> tuple[YunkeAccountResponse, bool]:
    """创建或更新账号（Upsert）

    如果手机号+公司代码已存在则更新，否则创建新账号

    Args:
        data: 账号数据

    Returns:
        tuple: (账号响应, 是否为新建)
    """
    with Session(engine) as session:
        # 获取或创建公司
        company = _get_or_create_company(
            session,
            data.company_code,
            data.company_name,
            data.domain,
        )

        # 查找是否已存在
        statement = (
            select(YunkeAccount)
            .where(YunkeAccount.phone == data.phone)
            .where(YunkeAccount.company_id == company.id)
        )
        existing = session.exec(statement).first()

        if existing:
            # 更新已有账号
            existing.password = _encrypt_password(data.password)
            existing.status = 0  # 重置状态，需要重新登录
            existing.updated_at = datetime.now()
            session.add(existing)
            session.commit()
            session.refresh(existing)
            logger.info(f"更新账号: phone={data.phone}, company={data.company_name}")
            return (_account_to_response(existing, company), False)

        # 创建新账号
        account = YunkeAccount(
            phone=data.phone,
            password=_encrypt_password(data.password),
            company_id=company.id,
            status=0,
        )
        session.add(account)
        session.commit()
        session.refresh(account)
        logger.info(f"创建账号: phone={data.phone}, company={data.company_name}")
        return (_account_to_response(account, company), True)


def update_account(account_id: int, data: YunkeAccountUpdate) -> Optional[YunkeAccountResponse]:
    """更新账号信息

    Args:
        account_id: 账号ID
        data: 更新数据

    Returns:
        YunkeAccountResponse or None
    """
    with Session(engine) as session:
        account = session.get(YunkeAccount, account_id)
        if not account:
            return None

        if data.password:
            account.password = _encrypt_password(data.password)
            account.status = 0  # 密码变更需要重新登录

        account.updated_at = datetime.now()
        session.add(account)
        session.commit()
        session.refresh(account)

        company = session.get(YunkeCompany, account.company_id)
        logger.info(f"更新账号: id={account_id}")
        return _account_to_response(account, company)


def delete_account(account_id: int) -> bool:
    """删除账号

    Args:
        account_id: 账号ID

    Returns:
        bool: 是否删除成功
    """
    with Session(engine) as session:
        account = session.get(YunkeAccount, account_id)
        if not account:
            return False

        session.delete(account)
        session.commit()
        logger.info(f"删除账号: id={account_id}")
        return True


async def auto_login(account_id: int) -> dict:
    """自动登录账号

    Args:
        account_id: 账号ID

    Returns:
        dict: 登录结果
    """
    with Session(engine) as session:
        account = session.get(YunkeAccount, account_id)
        if not account:
            return {"success": False, "message": "账号不存在"}

        company = session.get(YunkeCompany, account.company_id)
        if not company:
            return {"success": False, "message": "公司信息不存在"}

        try:
            # 解密密码
            plain_password = _decrypt_password(account.password)

            # 执行登录（使用公司对应的域名）
            login_result = await password_login(
                phone=account.phone,
                password=plain_password,
                company_code=company.company_code,
                domain=company.domain if company.domain else None,
            )

            login_data = login_result["json"]
            if login_data.get("success") or str(login_data.get("code")) == "10000":
                # 登录成功，更新账号信息
                data = login_data.get("data", {})
                account.token = data.get("token", "")
                account.user_id = data.get("id", "")
                account.cookies = json.dumps(login_result["cookies"])
                account.last_login = datetime.now()
                account.status = 1
                account.updated_at = datetime.now()

                session.add(account)
                session.commit()

                logger.info(f"账号登录成功: phone={account.phone}, company={company.company_name}")
                return {
                    "success": True,
                    "message": "登录成功",
                    "data": {
                        "token": account.token,
                        "company": company.company_name,
                    },
                }
            else:
                # 登录失败
                account.status = 0
                session.add(account)
                session.commit()

                message = login_data.get("message", "登录失败")
                logger.warning(f"账号登录失败: phone={account.phone}, message={message}")
                return {"success": False, "message": message}

        except Exception as e:
            logger.error(f"账号登录异常: phone={account.phone}, error={e}")
            account.status = 0
            session.add(account)
            session.commit()
            return {"success": False, "message": str(e)}


async def check_account_status(account_id: int) -> dict:
    """检查账号状态

    Args:
        account_id: 账号ID

    Returns:
        dict: 状态信息
    """
    with Session(engine) as session:
        account = session.get(YunkeAccount, account_id)
        if not account:
            return {"valid": False, "message": "账号不存在"}

        # 检查是否有token
        if not account.token:
            return {"valid": False, "message": "未登录", "status": account.status}

        # 检查最后登录时间（超过24小时认为失效）
        if account.last_login:
            hours_since_login = (datetime.now() - account.last_login).total_seconds() / 3600
            if hours_since_login > 24:
                account.status = 0
                session.add(account)
                session.commit()
                return {"valid": False, "message": "登录已过期", "status": 0}

        return {
            "valid": account.status == 1,
            "message": "正常" if account.status == 1 else "失效",
            "status": account.status,
            "last_login": account.last_login.isoformat() if account.last_login else None,
        }


async def get_valid_account(phone: str = None, company_code: str = None) -> Optional[dict]:
    """获取有效账号供外部API使用

    Args:
        phone: 指定手机号
        company_code: 指定公司代码

    Returns:
        dict: 账号信息（包含token和cookies）
    """
    with Session(engine) as session:
        statement = select(YunkeAccount, YunkeCompany).join(YunkeCompany)

        if phone:
            statement = statement.where(YunkeAccount.phone == phone)
        if company_code:
            statement = statement.where(YunkeCompany.company_code == company_code)
        if not phone and not company_code:
            statement = statement.where(YunkeAccount.status == 1)

        result = session.exec(statement).first()

        if not result:
            return None

        account, company = result

        # 检查状态，如果失效则尝试自动登录
        if account.status != 1:
            login_result = await auto_login(account.id)
            if not login_result["success"]:
                return None
            # 重新获取账号信息
            session.refresh(account)

        return {
            "phone": account.phone,
            "token": account.token,
            "cookies": json.loads(account.cookies) if account.cookies else {},
            "company_code": company.company_code,
            "company_name": company.company_name,
        }
