# DataForge 项目规则

> 精简版规则文档 - 只包含每次会话都需要的核心信息

## 项目概述

DataForge（数据熔炉）= FastAPI 后端 + React 前端，多源数据集成与管理平台。

## 目录结构

```
backend/
  ├── app/            # FastAPI 应用 (端口 8847)
  │   ├── main.py     # 入口 + 中间件注册
  │   ├── config.py   # 配置 + 环境变量
  │   ├── api/v1/     # API 路由
  │   ├── models/     # SQLModel 数据库模型
  │   ├── scheduler/  # 任务调度器模块
  │   ├── clients/    # 外部 API 客户端 (云客、AI)
  │   └── utils/      # 工具函数
  └── scripts/        # 定时任务脚本文件夹

frontend-react/src/   # React 应用 (端口 3692)
  ├── components/     # shadcn/ui 组件
  ├── features/       # 功能模块 (按业务划分)
  ├── hooks/          # 自定义 Hooks
  ├── lib/            # 工具库 (api-client, utils)
  ├── styles/         # 全局样式
  └── routes.tsx      # 路由配置
```

## 技术栈

**后端**: Python 3.11 + FastAPI + SQLModel + PostgreSQL + httpx + APScheduler
**前端**: React 18 + Vite + shadcn/ui + TanStack Query/Table + Tailwind CSS
**工具**: ruff (后端格式化) + ESLint + Prettier (前端格式化)

## 核心规范

### 1. 统一响应格式（强制）

**所有 API 必须使用 `ResponseModel`，禁止使用 `HTTPException`！**

```python
# 成功响应
ResponseModel(data={...})
ResponseModel(message="创建成功", data={...})

# 错误响应 - 必须使用 ResponseModel.error()
ResponseModel.error(code=400, message="参数错误")
ResponseModel.error(code=404, message="资源不存在")

# 禁止使用 HTTPException！它返回 {"detail": "..."} 格式
# raise HTTPException(status_code=404, detail="不存在")  # 错误！
```

错误码: 200=成功, 400=请求错误, 401=无密钥, 403=密钥无效, 404=不存在, 500=服务器错误

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
cd frontend-react && pnpm dev --port 3692
```

## 扩展文档

详细规则和特定领域信息在以下文件,按需查阅:

- `docs/rules/backend.md` - 后端详细开发规范
- `docs/rules/frontend.md` - 前端详细开发规范 (React + shadcn/ui)
- `docs/rules/scheduler.md` - 定时任务系统规范
- `docs/rules/celery-lock.md` - Celery 分布式任务锁规范
- `docs/rules/yunke-api.md` - 云客 API 集成规范
- `docs/rules/feishu.md` - 飞书多维表格集成规范
- `docs/rules/data-sync.md` - 数据同步规范（飞书→本地数据库）
- `docs/rules/ai-integration.md` - AI 集成规范（Kimi/DeepSeek）
- `docs/rules/ai-tools.md` - AI 工具调用规范（Function Calling）
- `docs/rules/auth.md` - 用户认证规范
- `docs/rules/deploy.md` - **服务器部署和运维（涉及部署必读！）**

### 部署相关（强制）

**涉及服务器部署时，必须先阅读 `docs/rules/deploy.md`！**

- SSH 密钥路径: `~/.ssh/dataforge_key.pem`（从项目根目录 claudeCode.pem 复制）
- 服务器: `root@124.220.15.80`
- 项目目录: `/www/wwwroot/dataforge`

**SSH 连接命令（必须使用密钥）:**
```bash
ssh -i ~/.ssh/dataforge_key.pem root@124.220.15.80
```

**部署命令示例:**
```bash
ssh -i ~/.ssh/dataforge_key.pem root@124.220.15.80 "cd /www/wwwroot/dataforge && git pull && docker compose restart"
```

## 重要提醒

- 代码风格由工具保证,不需要手动检查格式
- **所有 API 必须使用 `ResponseModel`，禁止使用 `HTTPException`**
- 错误响应使用 `ResponseModel.error(code=xxx, message="...")`
- 不要把 `.env` 提交到 Git
- 生产环境必须使用 HTTPS
