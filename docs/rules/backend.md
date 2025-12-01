# 后端开发规则

> FastAPI + SQLite + SQLModel

## 技术栈

| 组件 | 技术 |
|------|------|
| 框架 | FastAPI |
| 数据库 | SQLite |
| ORM | SQLModel |
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
│   │   ├── __init__.py
│   │   └── base.py
│   ├── schemas/             # Pydantic 响应模型
│   │   ├── __init__.py
│   │   └── response.py      # 统一响应模型
│   ├── api/                 # API 路由
│   │   ├── __init__.py
│   │   └── v1/
│   ├── services/            # 业务逻辑层
│   │   └── __init__.py
│   └── utils/               # 工具函数
│       └── __init__.py
├── pyproject.toml
└── .python-version
```

## 统一响应模型

所有 API 接口必须使用统一的响应模型：

```python
from typing import Generic, TypeVar, Optional
from pydantic import BaseModel

T = TypeVar("T")

class ResponseModel(BaseModel, Generic[T]):
    """统一响应模型"""
    code: int = 200
    message: str = "success"
    data: Optional[T] = None

    @classmethod
    def success(cls, data: T = None, message: str = "success") -> "ResponseModel[T]":
        """成功响应"""
        return cls(code=200, message=message, data=data)

    @classmethod
    def error(cls, code: int = 400, message: str = "error", data: T = None) -> "ResponseModel[T]":
        """错误响应"""
        return cls(code=code, message=message, data=data)
```

## API 路由示例

```python
from fastapi import APIRouter
from app.schemas.response import ResponseModel

router = APIRouter()

@router.get("/items", response_model=ResponseModel[list[Item]])
async def get_items():
    """获取所有项目"""
    items = await ItemService.get_all()
    return ResponseModel.success(data=items)

@router.get("/items/{item_id}", response_model=ResponseModel[Item])
async def get_item(item_id: int):
    """获取单个项目"""
    item = await ItemService.get_by_id(item_id)
    if not item:
        return ResponseModel.error(code=404, message="项目不存在")
    return ResponseModel.success(data=item)
```

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

## 数据库配置示例

```python
from sqlmodel import SQLModel, create_engine, Session

DATABASE_URL = "sqlite:///./app.db"

engine = create_engine(DATABASE_URL, echo=True)

def init_db():
    """初始化数据库"""
    SQLModel.metadata.create_all(engine)

def get_session():
    """获取数据库会话"""
    with Session(engine) as session:
        yield session
```

## 开发规范

1. **异步优先**: 所有数据库操作和 I/O 操作使用 async/await
2. **类型注解**: 所有函数必须有完整的类型注解
3. **文档字符串**: 所有公共函数必须有 docstring
4. **异常处理**: 使用全局异常处理器处理所有异常
5. **日志记录**: 使用 loguru 进行日志记录

## 全局异常处理

```python
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from app.schemas.response import ResponseModel

app = FastAPI()

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """全局异常处理"""
    return JSONResponse(
        status_code=500,
        content=ResponseModel.error(
            code=500, 
            message=str(exc)
        ).model_dump()
    )
```

## HTTP 请求规范

**所有外部 API 请求必须使用 httpx 异步客户端。**

### 基础封装

```python
# app/utils/http_client.py
import httpx
from typing import Any, Optional
from loguru import logger

# 默认超时配置
DEFAULT_TIMEOUT = httpx.Timeout(
    connect=5.0,    # 连接超时
    read=30.0,      # 读取超时
    write=10.0,     # 写入超时
    pool=5.0,       # 连接池超时
)

async def http_get(
    url: str,
    params: Optional[dict] = None,
    headers: Optional[dict] = None,
    timeout: Optional[httpx.Timeout] = None,
) -> dict[str, Any]:
    """异步 GET 请求"""
    async with httpx.AsyncClient(timeout=timeout or DEFAULT_TIMEOUT) as client:
        try:
            response = await client.get(url, params=params, headers=headers)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP 错误: {e.response.status_code} - {url}")
            raise
        except httpx.RequestError as e:
            logger.error(f"请求错误: {e}")
            raise

async def http_post(
    url: str,
    data: Optional[dict] = None,
    json: Optional[dict] = None,
    headers: Optional[dict] = None,
    timeout: Optional[httpx.Timeout] = None,
) -> dict[str, Any]:
    """异步 POST 请求"""
    async with httpx.AsyncClient(timeout=timeout or DEFAULT_TIMEOUT) as client:
        try:
            response = await client.post(
                url, data=data, json=json, headers=headers
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP 错误: {e.response.status_code} - {url}")
            raise
        except httpx.RequestError as e:
            logger.error(f"请求错误: {e}")
            raise
```

### 使用示例

```python
from app.utils.http_client import http_get, http_post

# GET 请求
async def fetch_user_info(user_id: int) -> dict:
    url = f"https://api.example.com/users/{user_id}"
    return await http_get(url)

# POST 请求
async def create_order(order_data: dict) -> dict:
    url = "https://api.example.com/orders"
    return await http_post(url, json=order_data)
```

### 复用客户端（推荐用于高频请求）

```python
from contextlib import asynccontextmanager
import httpx

# 在应用生命周期中复用客户端
@asynccontextmanager
async def lifespan(app):
    # 创建全局客户端
    app.state.http_client = httpx.AsyncClient(timeout=30.0)
    yield
    # 关闭客户端
    await app.state.http_client.aclose()

# 在路由中使用
@router.get("/proxy")
async def proxy_request(request: Request):
    client = request.app.state.http_client
    response = await client.get("https://api.example.com/data")
    return response.json()
```

## 常用命令

```bash
# 创建虚拟环境
uv venv

# 激活虚拟环境
source .venv/bin/activate

# 安装依赖
uv pip install -r requirements.txt
# 或使用 pyproject.toml
uv pip install -e .

# 运行开发服务器
uvicorn app.main:app --reload --port 8000

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
    "loguru>=0.7.0",
    "httpx[http2]>=0.27.0",
]

[tool.ruff]
line-length = 88
target-version = "py311"
```

## 文档优先原则

在编写代码或修复 bug 时，优先查找官方文档：

1. **FastAPI**: https://fastapi.tiangolo.com/
2. **SQLModel**: https://sqlmodel.tiangolo.com/
3. **Pydantic**: https://docs.pydantic.dev/
4. **httpx**: https://www.python-httpx.org/

遵循官方最佳实践和示例代码。

