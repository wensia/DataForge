# 云客中转项目规则

> 精简版规则文档 - 只包含每次会话都需要的核心信息

## 项目概述

云客中转 = FastAPI 后端 + Vue3 前端,用于管理云客 CRM 账号和数据同步。

## 目录结构

```
backend/app/          # FastAPI 应用 (端口 8847)
  ├── main.py         # 入口 + 中间件注册
  ├── config.py       # 配置 + 环境变量
  ├── api/v1/         # API 路由
  ├── models/         # SQLModel 数据库模型
  ├── middleware/     # 中间件 (API 密钥验证等)
  └── utils/          # 工具函数

frontend/src/         # Vue3 应用 (端口 3691)
  ├── api/            # API 请求封装
  ├── views/          # 页面组件
  └── stores/         # Pinia 状态管理
```

## 技术栈

**后端**: Python 3.11 + FastAPI + SQLModel + SQLite + httpx
**前端**: Vue 3 (Composition API) + Vite + Naive UI + Pinia
**工具**: ruff (后端格式化) + Biome (前端格式化)

## 核心规范

### 1. 统一响应格式

所有 API 返回:
```python
ResponseModel(code=200, message="success", data={...})
```

错误码: 200=成功, 401=无密钥, 403=密钥无效, 404=不存在, 500=服务器错误

### 2. API 密钥验证

- **所有 API 需要**: `?api_key=YOUR_KEY`
- **豁免路径**: `/` 和 `/api/v1/health`
- **配置文件**: `backend/.env` 的 `API_KEYS`
- **测试端点**: `GET /api/v1/auth/test?api_key=xxx`

### 3. 命名规范

| 语言 | 文件 | 类/组件 | 函数/变量 |
|------|------|---------|-----------|
| Python | snake_case | PascalCase | snake_case |
| TypeScript | camelCase | PascalCase | camelCase |

### 4. 开发流程

1. 查阅官方文档 → 2. 编写代码 → 3. 格式化 (`ruff`/`pnpm lint`) → 4. 测试验证

### 5. 启动服务

```bash
# 一键启动
./manage.sh start

# 手动启动
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8847
cd frontend && pnpm dev --port 3691
```

## 扩展文档

详细规则和特定领域信息在以下文件,按需查阅:

- `docs/rules/backend.md` - 后端详细开发规范
- `docs/rules/frontend.md` - 前端详细开发规范
- `docs/rules/yunke-api.md` - 云客 API 集成规范
- `docs/rules/deploy.md` - 服务器部署和运维
- `docs/API密钥使用指南.md` - API 密钥详细说明
- `docs/RULES.md` - 完整的项目规则文档

## 重要提醒

- 代码风格由工具保证,不需要手动检查格式
- 所有 API 必须使用 `ResponseModel`
- 不要把 `.env` 提交到 Git
- 生产环境必须使用 HTTPS
