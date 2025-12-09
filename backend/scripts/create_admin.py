"""创建初始管理员账号脚本

用法:
    cd backend
    uv run python -m scripts.create_admin

或者指定参数:
    uv run python -m scripts.create_admin --email admin@example.com --password yourpassword --name 管理员
"""

import argparse
import sys
from pathlib import Path

# 添加项目根目录到 sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlmodel import Session, select

from app.database import engine, init_db
from app.models.user import User, UserRole
from app.utils.jwt_auth import get_password_hash


def create_admin(email: str, password: str, name: str) -> bool:
    """创建管理员账号

    Args:
        email: 邮箱
        password: 密码
        name: 姓名

    Returns:
        bool: 是否创建成功
    """
    # 初始化数据库
    init_db()

    with Session(engine) as session:
        # 检查是否已存在该邮箱
        existing = session.exec(select(User).where(User.email == email)).first()
        if existing:
            print(f"错误: 邮箱 {email} 已被使用")
            return False

        # 创建管理员
        admin = User(
            email=email,
            password_hash=get_password_hash(password),
            name=name,
            role=UserRole.ADMIN,
            is_active=True,
        )

        session.add(admin)
        session.commit()
        session.refresh(admin)

        print(f"管理员创建成功!")
        print(f"  ID: {admin.id}")
        print(f"  邮箱: {admin.email}")
        print(f"  姓名: {admin.name}")
        print(f"  角色: {admin.role.value}")

        return True


def main():
    parser = argparse.ArgumentParser(description="创建初始管理员账号")
    parser.add_argument("--email", type=str, help="管理员邮箱")
    parser.add_argument("--password", type=str, help="管理员密码")
    parser.add_argument("--name", type=str, help="管理员姓名")

    args = parser.parse_args()

    # 交互式输入
    email = args.email
    if not email:
        email = input("请输入管理员邮箱: ").strip()
        if not email:
            print("错误: 邮箱不能为空")
            sys.exit(1)

    password = args.password
    if not password:
        import getpass

        password = getpass.getpass("请输入管理员密码: ")
        if not password:
            print("错误: 密码不能为空")
            sys.exit(1)

        # 确认密码
        password_confirm = getpass.getpass("请确认管理员密码: ")
        if password != password_confirm:
            print("错误: 两次输入的密码不一致")
            sys.exit(1)

    name = args.name
    if not name:
        name = input("请输入管理员姓名 [管理员]: ").strip() or "管理员"

    # 创建管理员
    if create_admin(email, password, name):
        print("\n您现在可以使用该账号登录后台管理系统")
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
