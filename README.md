# 云客中转

云客中转系统 - 用于管理云客账号和数据同步的中转服务。

## 项目结构

```
├── backend/          # 后端服务 (FastAPI + SQLModel)
├── frontend/         # 前端应用 (Vue3 + NaiveUI)
├── docs/             # 项目文档
├── logs/             # 日志文件
└── manage.sh         # 管理脚本
```

## 技术栈

### 后端
- Python 3.11+
- FastAPI
- SQLModel + SQLite
- uv (包管理)

### 前端
- Vue 3
- Vite
- NaiveUI
- pnpm (包管理)

## 快速开始

### 使用管理脚本

```bash
# 启动所有服务
./manage.sh start

# 停止所有服务
./manage.sh stop

# 查看服务状态
./manage.sh status
```

### 手动启动

**后端:**
```bash
cd backend
uv venv
uv pip install -e .
uv run uvicorn app.main:app --reload --port 8000
```

**前端:**
```bash
cd frontend
pnpm install
pnpm dev
```

## GitHub Actions

项目已配置 GitHub Actions 自动构建：

- **触发条件**: 
  - 推送到 `main`/`master` 分支
  - 创建以 `v` 开头的标签（如 `v1.0.0`）
  - Pull Request

- **构建产物**:
  - 前端静态文件
  - 后端应用包

- **发布**: 创建版本标签时自动生成 Release

### 创建发布版本

```bash
# 打标签并推送
git tag v1.0.0
git push origin v1.0.0
```

## 许可证

MIT License

