# DataForge Docker 部署指南

## 架构概览

只容器化应用服务，数据库保持原生安装：

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Host                          │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐   │
│  │         Docker Containers                        │   │
│  │  ┌─────────────────────────────────────────┐    │   │
│  │  │           Nginx (:80/:443)               │    │   │
│  │  │  ├── /        → Frontend Container       │    │   │
│  │  │  └── /api/    → Backend Container        │    │   │
│  │  └─────────────────────────────────────────┘    │   │
│  │                      │                           │   │
│  │       ┌──────────────┴──────────────┐           │   │
│  │       ▼                              ▼           │   │
│  │  ┌──────────┐                 ┌──────────┐      │   │
│  │  │ Frontend │                 │ Backend  │      │   │
│  │  │ (Nginx)  │                 │ (Uvicorn)│      │   │
│  │  └──────────┘                 └────┬─────┘      │   │
│  └─────────────────────────────────────│────────────┘   │
│                                        │                │
│  ┌─────────────────────────────────────│────────────┐   │
│  │         Host Services (原生安装)      │            │   │
│  │                    ┌─────────────────┴──────┐    │   │
│  │                    ▼                        ▼    │   │
│  │            ┌─────────────┐          ┌─────────┐ │   │
│  │            │ PostgreSQL  │          │  Redis  │ │   │
│  │            │   (:5432)   │          │ (:6379) │ │   │
│  │            └─────────────┘          └─────────┘ │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## 目录结构

```
DataForge/
├── docker-compose.yml          # 服务编排（仅应用服务）
├── docker-manage.sh            # 管理脚本
├── backend/
│   ├── Dockerfile              # 后端镜像
│   └── .dockerignore
├── frontend-react/
│   ├── Dockerfile              # 前端镜像
│   ├── nginx.conf              # 前端 Nginx 配置
│   └── .dockerignore
└── docker/
    ├── .env.example            # 环境变量模板
    ├── .env                    # 实际配置（不提交 Git）
    └── nginx/
        ├── nginx.conf          # Nginx 主配置
        ├── conf.d/default.conf # 站点配置
        └── ssl/                # SSL 证书目录
```

## 服务组成

| 服务 | 类型 | 端口 | 说明 |
|------|------|------|------|
| nginx | Docker | 80, 443 | 反向代理 |
| backend | Docker | 8847 (内部) | FastAPI 后端 |
| frontend | Docker | 80 (内部) | React 前端 |
| PostgreSQL | **宿主机原生** | 5432 | 数据库 |
| Redis | **宿主机原生** | 6379 | 缓存 |

## 部署步骤

### 1. 前置条件

确保宿主机已安装：
- Docker 和 Docker Compose
- PostgreSQL 16（已有数据）
- Redis

确保数据库和 Redis 允许本地连接：

```bash
# PostgreSQL - 检查 pg_hba.conf 允许本地连接
# 通常默认配置即可

# Redis - 确保监听 127.0.0.1
# redis.conf: bind 127.0.0.1
```

### 2. 配置环境变量

```bash
# 复制配置模板
cp docker/.env.example docker/.env

# 编辑配置
vim docker/.env
```

**必须修改的配置：**

```env
# 连接宿主机数据库（host.docker.internal 自动解析到宿主机）
DATABASE_URL=postgresql://postgres:j7P8djrJwXdOWt5N@host.docker.internal:5432/production

# 连接宿主机 Redis
REDIS_URL=redis://:你的Redis密码@host.docker.internal:6379/0

# 安全密钥
JWT_SECRET_KEY=你的JWT密钥
API_KEYS=你的API密钥
```

### 3. 停止旧服务

```bash
# 停止 systemd 管理的后端服务
sudo systemctl stop yunke-backend
sudo systemctl disable yunke-backend

# 停止旧的 Nginx（如果用系统 Nginx）
sudo systemctl stop nginx
```

### 4. 启动 Docker 服务

```bash
# 构建并启动
docker compose up -d --build

# 查看状态
docker compose ps

# 查看日志
docker compose logs -f
```

### 5. 验证

```bash
# 健康检查
curl http://localhost/api/v1/health

# 查看服务状态
./docker-manage.sh status
```

## 常用命令

```bash
# 使用管理脚本
./docker-manage.sh start      # 启动服务
./docker-manage.sh stop       # 停止服务
./docker-manage.sh restart    # 重启服务
./docker-manage.sh status     # 查看状态
./docker-manage.sh logs -f    # 实时日志
./docker-manage.sh update     # 拉取代码并重新部署

# 或者直接使用 docker compose
docker compose up -d          # 启动
docker compose down           # 停止
docker compose logs -f backend # 查看后端日志
docker compose exec backend sh # 进入后端容器
```

## 数据库操作

数据库在宿主机上，直接用系统命令操作：

```bash
# 备份数据库
pg_dump -U postgres production > backup_$(date +%Y%m%d).sql

# 连接数据库
psql -U postgres -d production

# Redis 操作
redis-cli
```

## 更新部署

```bash
# 方式一：使用管理脚本
./docker-manage.sh update

# 方式二：手动操作
git pull
docker compose build --no-cache
docker compose up -d
```

## 启用 HTTPS

1. 将 SSL 证书放入 `docker/nginx/ssl/`：
   - `cert.pem` - 证书文件
   - `key.pem` - 私钥文件

2. 编辑 `docker/nginx/conf.d/default.conf`，取消 HTTPS 部分注释

3. 重启 Nginx：
   ```bash
   docker compose restart nginx
   ```

## 故障排除

### 容器无法连接数据库

```bash
# 1. 检查 host.docker.internal 是否解析正确
docker compose exec backend ping host.docker.internal

# 2. 检查数据库是否监听正确地址
# PostgreSQL 需要监听 0.0.0.0 或 127.0.0.1
# 检查 postgresql.conf: listen_addresses = '*'

# 3. 检查防火墙
sudo ufw status
```

### 查看容器日志

```bash
# 查看所有日志
docker compose logs

# 实时查看特定服务
docker compose logs -f backend

# 查看最近 100 行
docker compose logs --tail=100 backend
```

### 重新构建镜像

```bash
# 强制重新构建（不使用缓存）
docker compose build --no-cache

# 重新部署
docker compose up -d
```

## 回滚到传统部署

如需回滚到非 Docker 部署：

```bash
# 1. 停止 Docker 服务
docker compose down

# 2. 重新启用 systemd 服务
sudo systemctl enable yunke-backend
sudo systemctl start yunke-backend

# 3. 启动系统 Nginx
sudo systemctl start nginx
```

## 监控建议

- 使用 `docker stats` 监控容器资源使用
- 配置日志轮转避免磁盘占满
- 定期备份数据库（使用宿主机 cron）

---

## CI/CD 自动部署（GitHub Actions）

### 工作流程

```
代码推送到 main → GitHub Actions 构建镜像 → 推送到 GHCR → SSH 部署到服务器
```

### 配置步骤

#### 1. 配置 GitHub Secrets

在 GitHub 仓库 → Settings → Secrets and variables → Actions 添加：

| Secret 名称 | 说明 | 示例值 |
|------------|------|--------|
| `SERVER_HOST` | 服务器 IP | `124.220.15.80` |
| `SERVER_USER` | SSH 用户名 | `ubuntu` |
| `SERVER_SSH_KEY` | SSH 私钥内容 | `-----BEGIN OPENSSH...` |

#### 2. 设置仓库包权限

GitHub 仓库 → Settings → Actions → General：
- Workflow permissions: 选择 **Read and write permissions**

#### 3. 首次服务器配置

```bash
# SSH 到服务器
ssh ubuntu@124.220.15.80

# 进入部署目录
cd /www/wwwroot/yunke-transit

# 拉取最新代码（获取 docker-compose.prod.yml）
git pull

# 配置环境变量
cp docker/.env.example docker/.env
vim docker/.env

# 设置 GitHub Token（用于拉取私有镜像）
# 在 GitHub → Settings → Developer settings → Personal access tokens 创建
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx
echo "export GITHUB_TOKEN=ghp_xxxxxxxxxxxx" >> ~/.bashrc
```

### 部署文件说明

| 文件 | 用途 |
|------|------|
| `docker-compose.yml` | 本地开发（本地构建镜像） |
| `docker-compose.prod.yml` | 生产环境（拉取预构建镜像） |
| `.github/workflows/deploy.yml` | CI/CD 工作流 |
| `scripts/deploy.sh` | 手动部署脚本 |

### 自动部署

推送代码到 `main` 分支即可触发自动部署：

```bash
git add .
git commit -m "feat: 新功能"
git push origin main
# GitHub Actions 自动构建并部署
```

### 手动部署

```bash
# 在服务器上执行
cd /www/wwwroot/yunke-transit
./scripts/deploy.sh
```

### 查看部署状态

1. GitHub 仓库 → Actions 查看构建日志
2. 服务器上执行 `docker compose -f docker-compose.prod.yml ps`

### 回滚到指定版本

```bash
# 拉取指定 commit 的镜像
docker pull ghcr.io/你的用户名/dataforge-backend:abc1234
docker pull ghcr.io/你的用户名/dataforge-frontend:abc1234

# 修改 docker-compose.prod.yml 中的镜像 tag
# 或设置环境变量
export IMAGE_TAG=abc1234
docker compose -f docker-compose.prod.yml up -d
```
