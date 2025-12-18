# 部署规则

> 服务器部署与运维规范（Docker + GitHub Actions 自动化部署）

## 服务器信息

| 项目 | 值 |
|------|-----|
| IP 地址 | `124.220.15.80` |
| 用户名 | `root` |
| 登录方式 | SSH 密钥登录 |
| 密钥文件 | `~/.ssh/dataforge_key.pem` |
| 系统 | Ubuntu 22.04 |
| 面板 | 1Panel |

## 部署架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     GitHub Actions CI/CD                         │
├─────────────────────────────────────────────────────────────────┤
│  1. 代码推送到 main 分支                                          │
│  2. 构建 Docker 镜像 → 推送到阿里云 ACR                            │
│  3. SSH 连接服务器 → 拉取镜像 → 重启容器                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    124.220.15.80 (Docker)                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  dataforge-nginx (:80, :443)                            │    │
│  │  ├── /           → dataforge-frontend (:80)             │    │
│  │  └── /api/       → dataforge-backend (:8847)            │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  dataforge-backend (:8847)                              │    │
│  │  └── FastAPI → PostgreSQL (host.docker.internal:5432)   │    │
│  │              → Redis (host.docker.internal:6379)        │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  dataforge-frontend (内部 :80)                          │    │
│  │  └── Nginx 静态文件服务                                  │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  dataforge-celery-worker                                │    │
│  │  └── Celery Worker (任务执行器, gevent, 4并发)           │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  dataforge-celery-beat                                  │    │
│  │  └── Celery Beat (定时任务调度器)                        │    │
│  └─────────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│  PostgreSQL 16 (:5432) - 原生安装，非容器化                       │
│  Redis (:6379) - 原生安装，非容器化                               │
└─────────────────────────────────────────────────────────────────┘
```

## CI/CD 自动部署

### 触发条件

- 推送代码到 `main` 分支
- 手动触发 GitHub Actions

### 部署流程

| 步骤 | 说明 | 耗时 |
|------|------|------|
| build-frontend | 构建前端镜像，推送到阿里云 ACR | ~30-50秒 |
| build-backend | 构建后端镜像，推送到阿里云 ACR | ~30-90秒 |
| deploy | SSH 连接服务器，拉取镜像，重启容器 | ~30-60秒 |
| **总计** | | **~2-3分钟** |

### GitHub Secrets 配置

在 GitHub 仓库 `Settings → Secrets and variables → Actions` 中配置：

| Secret 名称 | 说明 |
|-------------|------|
| `SERVER_HOST` | 服务器 IP: `124.220.15.80` |
| `SERVER_USER` | SSH 用户名: `root` |
| `SERVER_SSH_KEY` | SSH 私钥内容（dataforge_key.pem 的完整内容） |
| `ACR_USERNAME` | 阿里云 ACR 用户名 |
| `ACR_PASSWORD` | 阿里云 ACR 密码 |

### 阿里云 ACR 镜像仓库

| 镜像 | 地址 |
|------|------|
| 后端 | `registry.cn-hangzhou.aliyuncs.com/pandw/dataforge-backend` |
| 前端 | `registry.cn-hangzhou.aliyuncs.com/pandw/dataforge-frontend` |

### 手动触发部署

```bash
# 使用 GitHub CLI
gh workflow run deploy.yml

# 查看运行状态
gh run list --limit 5
gh run watch <run-id>
```

## Docker 配置文件

### 核心文件

| 文件 | 说明 |
|------|------|
| `backend/Dockerfile` | 后端 Docker 构建配置 |
| `frontend-react/Dockerfile` | 前端 Docker 构建配置 |
| `docker-compose.yml` | 本地开发用（本地构建） |
| `docker-compose.prod.yml` | 生产环境用（拉取 ACR 镜像） |
| `docker/.env` | Docker 环境变量配置 |
| `.github/workflows/deploy.yml` | GitHub Actions 工作流 |

### 生产环境 docker-compose.prod.yml

```yaml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      backend:
        condition: service_healthy
      frontend:
        condition: service_healthy

  backend:
    image: registry.cn-hangzhou.aliyuncs.com/pandw/dataforge-backend:latest
    env_file:
      - ./docker/.env
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - backend-logs:/app/logs
      - backend-uploads:/app/uploads
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8847/api/v1/health"]

  frontend:
    image: registry.cn-hangzhou.aliyuncs.com/pandw/dataforge-frontend:latest
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost/health || exit 1"]

  celery-worker:
    image: registry.cn-hangzhou.aliyuncs.com/pandw/dataforge-backend:latest
    command: celery -A app.celery_app worker --loglevel=info --pool=gevent --concurrency=4
    env_file:
      - ./docker/.env
    extra_hosts:
      - "host.docker.internal:host-gateway"
    depends_on:
      backend:
        condition: service_healthy

  celery-beat:
    image: registry.cn-hangzhou.aliyuncs.com/pandw/dataforge-backend:latest
    command: celery -A app.celery_app beat --loglevel=info --scheduler app.celery_scheduler:DatabaseScheduler
    env_file:
      - ./docker/.env
    extra_hosts:
      - "host.docker.internal:host-gateway"
    depends_on:
      backend:
        condition: service_healthy

volumes:
  backend-logs:
    name: dataforge-backend-logs
  backend-uploads:
    name: dataforge-backend-uploads
  celery-logs:
    name: dataforge-celery-logs
```

## SSH 连接

**SSH 密钥路径**: `~/.ssh/dataforge_key.pem`

```bash
# 连接服务器
ssh -i ~/.ssh/dataforge_key.pem root@124.220.15.80

# 确保密钥权限正确
chmod 600 ~/.ssh/dataforge_key.pem
```

### SSH 别名配置（可选）

添加到 `~/.ssh/config`：

```bash
Host dataforge
  HostName 124.220.15.80
  User root
  IdentityFile ~/.ssh/dataforge_key.pem
```

配置后可直接使用 `ssh dataforge` 连接。

## 日常运维

### Docker 容器管理

```bash
# SSH 到服务器后执行
cd /www/wwwroot/yunke-transit

# 查看容器状态
docker compose -f docker-compose.prod.yml ps

# 查看容器日志
docker compose -f docker-compose.prod.yml logs -f
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f frontend
docker compose -f docker-compose.prod.yml logs -f nginx
docker compose -f docker-compose.prod.yml logs -f celery-worker
docker compose -f docker-compose.prod.yml logs -f celery-beat

# 重启所有服务
docker compose -f docker-compose.prod.yml restart

# 重启单个服务
docker compose -f docker-compose.prod.yml restart backend

# 停止所有服务
docker compose -f docker-compose.prod.yml down

# 启动所有服务
docker compose -f docker-compose.prod.yml up -d

# 强制重新拉取镜像并重启
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# 清理旧镜像
docker image prune -f
```

### 手动部署（不使用 CI/CD）

```bash
# SSH 到服务器
ssh -i ~/.ssh/dataforge_key.pem root@124.220.15.80

cd /www/wwwroot/yunke-transit

# 拉取最新代码
git pull origin main

# 登录阿里云 ACR
docker login registry.cn-hangzhou.aliyuncs.com

# 拉取最新镜像
docker pull registry.cn-hangzhou.aliyuncs.com/pandw/dataforge-backend:latest
docker pull registry.cn-hangzhou.aliyuncs.com/pandw/dataforge-frontend:latest

# 重启服务
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

### 健康检查

```bash
# 检查后端 API
curl http://124.220.15.80/api/v1/health

# 检查前端
curl -I http://124.220.15.80/

# 检查容器健康状态
docker compose -f docker-compose.prod.yml ps

# 检查 Celery Worker
docker exec dataforge-celery-worker celery -A app.celery_app inspect ping
```

## 端口配置

### 必须开放的端口

| 端口 | 协议 | 用途 |
|------|------|------|
| 22 | TCP | SSH 远程登录 |
| 80 | TCP | HTTP 访问 |
| 443 | TCP | HTTPS 访问（如配置 SSL） |

### 内部端口（无需对外开放）

| 端口 | 说明 |
|------|------|
| 8847 | 后端服务端口（Docker 内部） |
| 5432 | PostgreSQL 端口 |
| 6379 | Redis 端口 |

## 首次部署

### 1. 安装 Docker

```bash
# 安装 Docker
curl -fsSL https://get.docker.com | sh

# 验证 Docker
docker --version
docker compose version
```

### 2. 安装 PostgreSQL 16

```bash
# 添加 PostgreSQL 官方源
sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
apt update

# 安装 PostgreSQL 16
apt install postgresql-16 -y

# 启动服务
systemctl start postgresql
systemctl enable postgresql

# 配置数据库
sudo -u postgres psql
ALTER USER postgres PASSWORD 'YOUR_SECURE_PASSWORD';
CREATE DATABASE production;
\q
```

### 3. 安装 Redis

```bash
apt install redis-server -y
systemctl start redis-server
systemctl enable redis-server

# 验证
redis-cli ping
```

### 4. 克隆代码

```bash
cd /www/wwwroot
git clone https://github.com/wensia/DataForge.git yunke-transit
cd yunke-transit
```

### 5. 配置环境变量

```bash
cp docker/.env.example docker/.env
vim docker/.env

# 配置数据库连接
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@host.docker.internal:5432/production
REDIS_URL=redis://host.docker.internal:6379/0
```

### 6. 配置 Nginx

```bash
# 创建 SSL 目录（即使不用 HTTPS 也需要）
mkdir -p docker/nginx/ssl

# 检查 Nginx 配置文件
ls docker/nginx/
```

### 7. 停止系统 Nginx（如果有）

```bash
systemctl stop nginx
systemctl disable nginx
```

### 8. 首次启动

```bash
# 登录阿里云 ACR
docker login registry.cn-hangzhou.aliyuncs.com

# 拉取镜像并启动
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# 检查状态
docker compose -f docker-compose.prod.yml ps
```

## 故障排查

### 容器无法启动

```bash
# 查看详细日志
docker compose -f docker-compose.prod.yml logs --tail=100

# 检查容器状态
docker ps -a

# 进入容器调试
docker exec -it dataforge-backend /bin/bash
```

### 端口被占用

```bash
# 查看端口占用
lsof -i :80
netstat -tlnp | grep :80

# 强制释放端口
fuser -k 80/tcp
```

### 健康检查失败

```bash
# 检查容器内部服务
docker exec dataforge-backend curl -f http://localhost:8847/api/v1/health
docker exec dataforge-frontend curl -f http://localhost/health
```

### 数据库连接问题

```bash
# 检查 PostgreSQL 服务
systemctl status postgresql

# 测试数据库连接
sudo -u postgres psql -c "SELECT 1"

# 检查后端日志
docker compose -f docker-compose.prod.yml logs backend | grep -i error
```

### Celery 任务问题

```bash
# 检查 Celery Worker 状态
docker logs dataforge-celery-worker --tail=50

# 检查 Celery Beat 状态
docker logs dataforge-celery-beat --tail=50

# 检查 Redis 连接
redis-cli ping

# 重启 Celery 服务
docker compose -f docker-compose.prod.yml restart celery-worker celery-beat
```

## 备份策略

### PostgreSQL 数据库备份

```bash
# 手动备份
sudo -u postgres pg_dump production > ~/backup/production_$(date +%Y%m%d).sql

# 下载到本地
scp -i ~/.ssh/dataforge_key.pem root@124.220.15.80:~/backup/production_*.sql ./backup/
```

### 自动备份（cron）

```bash
crontab -e

# 每日凌晨2点备份
0 2 * * * sudo -u postgres pg_dump production > /root/backup/production_$(date +\%Y\%m\%d).sql

# 清理 7 天前的备份
0 3 * * * find /root/backup -name "production_*.sql" -mtime +7 -delete
```

## 安全注意事项

1. **密钥安全**: `dataforge_key.pem` 不要提交到代码仓库
2. **Secrets 安全**: GitHub Secrets 中的密码定期更换
3. **端口暴露**: 仅暴露必要端口（22、80、443）
4. **ACR 安全**: 阿里云 ACR 使用独立的 RAM 子账号
5. **定期更新**: 定期更新 Docker 镜像和系统包
6. **备份**: 定期备份 PostgreSQL 数据库
