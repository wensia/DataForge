# 云客中转 - AI 开发规则

> 此文件适用于所有 AI 编程助手（Claude、GPT、Copilot 等）

## 项目概述

云客中转是一个前后端分离的 Web 应用项目，用于与云客 CRM 系统进行 API 交互，提供账号管理、数据报表等功能。

## 技术栈

### 后端
- **框架**: FastAPI
- **数据库**: SQLite
- **ORM**: SQLModel
- **HTTP 客户端**: httpx（异步）
- **包管理**: uv
- **代码格式化**: ruff

### 前端
- **框架**: Vue 3 (Composition API)
- **构建工具**: Vite
- **UI 组件库**: Naive UI
- **图标库**: xicons (Naive UI 推荐)
- **状态管理**: Pinia
- **路由**: Vue Router
- **代码检查**: Biome

### 部署
- **服务器**: 腾讯云轻量应用服务器
- **系统**: Ubuntu + 1Panel 面板
- **反向代理**: Nginx（通过 1Panel 管理）

## 规则文件

详细的开发规则请参考以下文件：

| 规则 | 路径 | 说明 |
|------|------|------|
| 后端规则 | [docs/rules/backend.md](docs/rules/backend.md) | FastAPI、SQLModel、httpx |
| 前端规则 | [docs/rules/frontend.md](docs/rules/frontend.md) | Vue 3、Naive UI、Biome |
| 云客API规则 | [docs/rules/yunke-api.md](docs/rules/yunke-api.md) | 云客CRM API客户端 |
| 部署规则 | [docs/rules/deploy.md](docs/rules/deploy.md) | 服务器部署与运维 |

## 统一执行标准

### 1. 文档优先原则

**无论是创建代码还是修复 bug，必须优先查找官方文档，执行最优的官方示例。**

官方文档链接：

| 技术 | 文档地址 |
|------|----------|
| FastAPI | https://fastapi.tiangolo.com/ |
| SQLModel | https://sqlmodel.tiangolo.com/ |
| Pydantic | https://docs.pydantic.dev/ |
| httpx | https://www.python-httpx.org/ |
| Vue 3 | https://vuejs.org/ |
| Naive UI | https://www.naiveui.com/ |
| Vite | https://vitejs.dev/ |
| xicons | https://www.xicons.org/ |
| Pinia | https://pinia.vuejs.org/ |
| Vue Router | https://router.vuejs.org/ |
| Biome | https://biomejs.dev/ |
| 1Panel | https://1panel.cn/docs/ |

### 2. 统一响应模型

后端所有 API 接口必须使用统一的响应模型：

```python
from typing import Generic, TypeVar, Optional
from pydantic import BaseModel

T = TypeVar("T")

class ResponseModel(BaseModel, Generic[T]):
    code: int = 200           # 响应码
    message: str = "success"  # 响应消息
    data: Optional[T] = None  # 响应数据
```

前端对应的 TypeScript 类型：

```typescript
interface ResponseModel<T = any> {
  code: number
  message: string
  data: T
}
```

### 3. 响应码规范

| 响应码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未授权 |
| 403 | 禁止访问 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

### 4. 代码风格

- **后端**: 使用 ruff 格式化代码，遵循 PEP 8 规范
- **前端**: 使用 Biome 格式化和检查代码（替代 ESLint + Prettier）

### 5. 命名规范

#### 后端
- 文件名: snake_case (如 `user_service.py`)
- 类名: PascalCase (如 `UserService`)
- 函数/变量: snake_case (如 `get_user_by_id`)

#### 前端
- 组件文件: PascalCase (如 `UserCard.vue`)
- 工具函数文件: camelCase (如 `useRequest.ts`)
- 变量/函数: camelCase (如 `getUserInfo`)

## 项目结构

```
云客中转/
├── backend/                 # 后端项目
│   ├── app/
│   │   ├── main.py          # 应用入口
│   │   ├── config.py        # 配置管理
│   │   ├── database.py      # 数据库连接
│   │   ├── models/          # SQLModel 模型
│   │   ├── schemas/         # Pydantic 响应模型
│   │   ├── api/             # API 路由
│   │   │   └── v1/          # API v1 版本
│   │   ├── clients/         # 外部 API 客户端
│   │   │   └── yunke/       # 云客 API 客户端
│   │   ├── services/        # 业务逻辑层
│   │   └── utils/           # 工具函数
│   ├── app.db               # SQLite 数据库
│   └── pyproject.toml
│
├── frontend/                # 前端项目
│   ├── src/
│   │   ├── main.ts          # 应用入口
│   │   ├── App.vue          # 根组件
│   │   ├── api/             # API 请求
│   │   ├── components/      # 公共组件
│   │   ├── composables/     # 组合式函数
│   │   ├── layouts/         # 布局组件
│   │   ├── router/          # 路由配置
│   │   ├── stores/          # Pinia 状态管理
│   │   ├── styles/          # 全局样式
│   │   ├── types/           # TypeScript 类型
│   │   ├── utils/           # 工具函数
│   │   └── views/           # 页面组件
│   ├── biome.json           # Biome 配置
│   ├── vite.config.ts
│   └── package.json
│
├── logs/                    # 日志目录
│   ├── backend.log
│   └── frontend.log
│
├── manage.sh                # 一键启停脚本
├── RULES.md                 # 主规则文件（本文件）
└── docs/
    └── rules/
        ├── backend.md       # 后端规则
        ├── frontend.md      # 前端规则
        ├── yunke-api.md     # 云客 API 规则
        └── deploy.md        # 部署规则
```

## 开发流程

1. **需求分析**: 理解需求，确定技术方案
2. **查阅文档**: 查找官方文档和最佳实践
3. **编写代码**: 按照规范编写代码
4. **代码格式化**: 运行格式化工具
5. **测试验证**: 确保功能正常
6. **代码审查**: 检查是否符合规范

## 本地开发

### 一键启停脚本

项目提供 `manage.sh` 脚本用于一键管理前后端服务：

```bash
# 启动服务
./manage.sh start

# 停止服务
./manage.sh stop

# 重启服务
./manage.sh restart

# 查看状态
./manage.sh status
```

### 手动启动

```bash
# 后端
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8847

# 前端
cd frontend
pnpm dev --port 3691
```

### 代码格式化

```bash
# 后端
cd backend
ruff format .
ruff check --fix .

# 前端
cd frontend
pnpm lint
pnpm format
```

## 服务器部署

### 服务器信息

| 项目 | 值 |
|------|-----|
| IP | `124.220.15.80` |
| 用户 | `ubuntu` |
| 密钥 | `claudeCode.pem` |
| 面板 | 1Panel |

### SSH 连接

```bash
ssh -i claudeCode.pem ubuntu@124.220.15.80
```

> 详细部署说明请参考 [docs/rules/deploy.md](docs/rules/deploy.md)

## 云客 API

本项目集成了云客 CRM 系统的 API，用于获取通话报表、账号管理等功能。

### 核心模块

| 模块 | 说明 |
|------|------|
| `auth.py` | 登录认证（RSA 加密、获取密钥） |
| `client.py` | API 客户端基类（自动重登录） |
| `report.py` | 报表 API |

### 关键特性

- **自适应域名**: 不同公司使用不同 API 域名（`crm.yunkecn.com` / `crm2.yunkecn.com`）
- **自动重登录**: Token 过期时自动重新登录
- **密码加密**: 使用 RSA 加密密码传输

> 详细 API 规则请参考 [docs/rules/yunke-api.md](docs/rules/yunke-api.md)

