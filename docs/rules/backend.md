# 后端开发规则

> FastAPI + PostgreSQL + SQLModel

## 技术栈

| 组件 | 技术 |
|------|------|
| 框架 | FastAPI |
| 数据库 | PostgreSQL 16 |
| ORM | SQLModel |
| 数据库驱动 | psycopg2-binary |
| HTTP 客户端 | httpx（异步） |
| 包管理 | uv |
| 代码格式化 | ruff |

## 项目结构

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI 应用入口
│   ├── config.py            # 配置管理
│   ├── database.py          # 数据库连接配置
│   ├── models/              # SQLModel 模型
│   ├── schemas/             # Pydantic 响应模型
│   │   └── response.py      # 统一响应模型
│   ├── api/v1/              # API 路由
│   ├── services/            # 业务逻辑层
│   ├── clients/             # 外部 API 客户端
│   │   ├── yunke/           # 云客 API
│   │   └── ai/              # AI 服务客户端
│   ├── scheduler/           # 任务调度器模块
│   └── utils/               # 工具函数
├── scripts/                 # 任务脚本文件夹
├── pyproject.toml
└── .python-version
```

## 统一响应模型（强制）

**⚠️ 重要：所有 API 接口必须使用统一的响应模型，禁止使用 HTTPException！**

### 规则

1. **所有响应必须使用 `ResponseModel`**
2. **禁止使用 `HTTPException`** - 它会返回 `{"detail": "..."}` 格式，破坏统一性
3. **错误响应使用 `ResponseModel.error()`**

### 正确示例 ✅

```python
from app.schemas.response import ResponseModel

@router.get("/items", response_model=ResponseModel)
async def get_items():
    items = await ItemService.get_all()
    return ResponseModel(data=items)

@router.get("/items/{item_id}", response_model=ResponseModel)
async def get_item(item_id: int):
    item = await ItemService.get_by_id(item_id)
    if not item:
        # ✅ 使用 ResponseModel.error()
        return ResponseModel.error(code=404, message="项目不存在")
    return ResponseModel(data=item)

@router.post("/items", response_model=ResponseModel)
async def create_item(data: ItemCreate):
    if not data.name:
        # ✅ 使用 ResponseModel.error()
        return ResponseModel.error(code=400, message="名称不能为空")
    item = await ItemService.create(data)
    return ResponseModel(message="创建成功", data=item)
```

### 错误示例 ❌

```python
from fastapi import HTTPException

@router.get("/items/{item_id}")
async def get_item(item_id: int):
    item = await ItemService.get_by_id(item_id)
    if not item:
        # ❌ 错误！HTTPException 返回 {"detail": "..."} 格式
        raise HTTPException(status_code=404, detail="项目不存在")
    return item
```

### 响应格式对比

| 方式 | 返回格式 | 是否统一 |
|------|---------|---------|
| `ResponseModel.error(code=404, message="不存在")` | `{"code": 404, "message": "不存在", "data": null}` | ✅ |
| `raise HTTPException(status_code=404, detail="不存在")` | `{"detail": "不存在"}` | ❌ |

## SQLModel 模型规范

```python
from datetime import datetime
from typing import Optional
from sqlmodel import Field, SQLModel

class BaseTable(SQLModel):
    """基础模型，包含通用字段"""
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

class User(BaseTable, table=True):
    """用户模型"""
    __tablename__ = "users"

    username: str = Field(unique=True, index=True)
    email: str = Field(unique=True, index=True)
    password_hash: str
```

## 数据库配置

### 环境变量

```bash
# .env 文件

# 本地开发：使用公网 IP
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@124.220.15.80:5432/production

# 服务器部署：使用本地回环
# DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@127.0.0.1:5432/production
```

### 数据库连接

```python
# app/database.py
from sqlmodel import SQLModel, create_engine, Session
from app.config import settings

_is_sqlite = settings.database_url.startswith("sqlite")

_engine_args = {}
if _is_sqlite:
    _engine_args["connect_args"] = {"check_same_thread": False}
else:
    _engine_args["pool_size"] = 5
    _engine_args["max_overflow"] = 10
    _engine_args["pool_pre_ping"] = True

engine = create_engine(settings.database_url, echo=settings.debug, **_engine_args)

def get_session():
    with Session(engine) as session:
        yield session
```

## 开发规范

1. **异步优先**: 所有数据库操作和 I/O 操作使用 async/await
2. **类型注解**: 所有函数必须有完整的类型注解
3. **文档字符串**: 所有公共函数必须有 docstring
4. **异常处理**: 使用全局异常处理器处理所有异常
5. **日志记录**: 使用 loguru 进行日志记录

## HTTP 请求规范

所有外部 API 请求必须使用 httpx 异步客户端：

```python
import httpx
from loguru import logger

DEFAULT_TIMEOUT = httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=5.0)

async def http_get(url: str, params: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        return response.json()

async def http_post(url: str, json: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        response = await client.post(url, json=json)
        response.raise_for_status()
        return response.json()
```

## 常用命令

```bash
# 创建虚拟环境
uv venv

# 激活虚拟环境
source .venv/bin/activate

# 安装依赖
uv pip install -e .

# 运行开发服务器
uvicorn app.main:app --reload --port 8847

# 代码格式化
ruff format .

# 代码检查
ruff check .

# 代码检查并自动修复
ruff check --fix .
```

## 依赖参考

```toml
# pyproject.toml
[project]
dependencies = [
    "fastapi>=0.109.0",
    "uvicorn[standard]>=0.27.0",
    "sqlmodel>=0.0.14",
    "pydantic>=2.5.0",
    "pydantic-settings>=2.0.0",
    "loguru>=0.7.0",
    "httpx[http2]>=0.27.0",
    "psycopg2-binary>=2.9.0",
    "apscheduler>=3.10.0",
    "bcrypt>=4.0.0",
    "python-jose[cryptography]>=3.3.0",
]

[tool.ruff]
line-length = 100
target-version = "py311"
```

## 文档优先原则

在编写代码或修复 bug 时，优先查找官方文档：

1. **FastAPI**: https://fastapi.tiangolo.com/
2. **SQLModel**: https://sqlmodel.tiangolo.com/
3. **Pydantic**: https://docs.pydantic.dev/
4. **httpx**: https://www.python-httpx.org/

## 相关文档

- 定时任务系统详见 `docs/rules/scheduler.md`
- 云客 API 客户端详见 `docs/rules/yunke-api.md`
- AI 服务集成详见 `docs/rules/ai-integration.md`
- 用户认证详见 `docs/rules/auth.md`
