"""数据库连接配置"""

from sqlmodel import Session, SQLModel, create_engine

from app.config import settings

# 根据数据库类型配置引擎参数
_is_sqlite = settings.database_url.startswith("sqlite")
_engine_args = {}

if _is_sqlite:
    # SQLite 需要此配置
    _engine_args["connect_args"] = {"check_same_thread": False}
else:
    # PostgreSQL 连接池配置
    _engine_args["pool_size"] = 5
    _engine_args["max_overflow"] = 10
    _engine_args["pool_pre_ping"] = True

# 创建数据库引擎
engine = create_engine(
    settings.database_url,
    echo=settings.debug,
    **_engine_args,
)


def init_db() -> None:
    """初始化数据库，创建所有表"""
    SQLModel.metadata.create_all(engine)


def get_session():
    """获取数据库会话"""
    with Session(engine) as session:
        yield session






