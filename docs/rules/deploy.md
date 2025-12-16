# 部署规则

> 服务器部署与运维规范（Docker + GitHub Actions 自动化部署）

## 服务器信息

| 项目 | 值 |
|------|-----|
| IP 地址 | `124.220.15.80` |
| 用户名 | `ubuntu` |
| 登录方式 | SSH 密钥登录 |
| 密钥文件 | 项目根目录 `./claudeCode.pem` |
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
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  dataforge-frontend (内部 :80)                          │    │
│  │  └── Nginx 静态文件服务                                  │    │
│  └─────────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│  PostgreSQL 16 (:5432) - 原生安装，非容器化                       │
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
| `SERVER_USER` | SSH 用户名: `ubuntu` |
| `SERVER_SSH_KEY` | SSH 私钥内容（claudeCode.pem 的完整内容） |
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
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8847/api/v1/health"]

  frontend:
    image: registry.cn-hangzhou.aliyuncs.com/pandw/dataforge-frontend:latest
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost/health || exit 1"]
```

## SSH 连接

**SSH 密钥绝对路径**: `/Users/panyuhang/我的项目/编程/网站/DataForge/claudeCode.pem`

```bash
# 使用绝对路径连接（推荐）
ssh -i /Users/panyuhang/我的项目/编程/网站/DataForge/claudeCode.pem ubuntu@124.220.15.80

# 或在项目根目录执行
ssh -i ./claudeCode.pem ubuntu@124.220.15.80

# 确保密钥权限正确
chmod 600 /Users/panyuhang/我的项目/编程/网站/DataForge/claudeCode.pem
```

### SSH 别名配置（可选）

添加到 `~/.ssh/config`：

```bash
Host dataforge
  HostName 124.220.15.80
  User ubuntu
  IdentityFile /Users/panyuhang/我的项目/编程/网站/DataForge/claudeCode.pem
```

配置后可直接使用 `ssh dataforge` 连接。

## 日常运维

### Docker 容器管理

```bash
# SSH 到服务器后执行
cd /www/wwwroot/yunke-transit

# 查看容器状态
sudo docker compose -f docker-compose.prod.yml ps

# 查看容器日志
sudo docker compose -f docker-compose.prod.yml logs -f
sudo docker compose -f docker-compose.prod.yml logs -f backend
sudo docker compose -f docker-compose.prod.yml logs -f frontend
sudo docker compose -f docker-compose.prod.yml logs -f nginx

# 重启所有服务
sudo docker compose -f docker-compose.prod.yml restart

# 重启单个服务
sudo docker compose -f docker-compose.prod.yml restart backend

# 停止所有服务
sudo docker compose -f docker-compose.prod.yml down

# 启动所有服务
sudo docker compose -f docker-compose.prod.yml up -d

# 强制重新拉取镜像并重启
sudo docker compose -f docker-compose.prod.yml pull
sudo docker compose -f docker-compose.prod.yml up -d

# 清理旧镜像
sudo docker image prune -f
```

### 手动部署（不使用 CI/CD）

```bash
# SSH 到服务器
ssh -i ./claudeCode.pem ubuntu@124.220.15.80

cd /www/wwwroot/yunke-transit

# 拉取最新代码
git pull origin main

# 登录阿里云 ACR
sudo docker login registry.cn-hangzhou.aliyuncs.com

# 拉取最新镜像
sudo docker pull registry.cn-hangzhou.aliyuncs.com/pandw/dataforge-backend:latest
sudo docker pull registry.cn-hangzhou.aliyuncs.com/pandw/dataforge-frontend:latest

# 重启服务
sudo docker compose -f docker-compose.prod.yml down
sudo docker compose -f docker-compose.prod.yml up -d
```

### 健康检查

```bash
# 检查后端 API
curl http://124.220.15.80/api/v1/health

# 检查前端
curl -I http://124.220.15.80/

# 检查容器健康状态
sudo docker compose -f docker-compose.prod.yml ps
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

## 首次部署

### 1. 安装 Docker

```bash
# 安装 Docker
curl -fsSL https://get.docker.com | sh

# 添加用户到 docker 组
sudo usermod -aG docker ubuntu

# 重新登录使权限生效
exit
ssh -i ./claudeCode.pem ubuntu@124.220.15.80

# 验证 Docker
docker --version
docker compose version
```

### 2. 安装 PostgreSQL 16

```bash
# 添加 PostgreSQL 官方源
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo apt update

# 安装 PostgreSQL 16
sudo apt install postgresql-16 -y

# 启动服务
sudo systemctl start postgresql
sudo systemctl enable postgresql

# 配置数据库
sudo -u postgres psql
ALTER USER postgres PASSWORD 'YOUR_SECURE_PASSWORD';
CREATE DATABASE production;
\q
```

### 3. 克隆代码

```bash
cd /www/wwwroot
git clone https://github.com/wensia/DataForge.git yunke-transit
cd yunke-transit
```

### 4. 配置环境变量

```bash
cp docker/.env.example docker/.env
vim docker/.env

# 配置数据库连接
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@host.docker.internal:5432/production
```

### 5. 配置 Nginx

```bash
# 创建 SSL 目录（即使不用 HTTPS 也需要）
mkdir -p docker/nginx/ssl

# 检查 Nginx 配置文件
ls docker/nginx/
```

### 6. 停止系统 Nginx（如果有）

```bash
sudo systemctl stop nginx
sudo systemctl disable nginx
```

### 7. 首次启动

```bash
# 登录阿里云 ACR
sudo docker login registry.cn-hangzhou.aliyuncs.com

# 拉取镜像并启动
sudo docker compose -f docker-compose.prod.yml pull
sudo docker compose -f docker-compose.prod.yml up -d

# 检查状态
sudo docker compose -f docker-compose.prod.yml ps
```

## 故障排查

### 容器无法启动

```bash
# 查看详细日志
sudo docker compose -f docker-compose.prod.yml logs --tail=100

# 检查容器状态
sudo docker ps -a

# 进入容器调试
sudo docker exec -it dataforge-backend /bin/bash
```

### 端口被占用

```bash
# 查看端口占用
sudo lsof -i :80
sudo netstat -tlnp | grep :80

# 强制释放端口
sudo fuser -k 80/tcp
```

### 健康检查失败

```bash
# 检查容器内部服务
sudo docker exec dataforge-backend curl -f http://localhost:8847/api/v1/health
sudo docker exec dataforge-frontend curl -f http://localhost/health
```

### 数据库连接问题

```bash
# 检查 PostgreSQL 服务
sudo systemctl status postgresql

# 测试数据库连接
sudo -u postgres psql -c "SELECT 1"

# 检查后端日志
sudo docker compose -f docker-compose.prod.yml logs backend | grep -i error
```

## 备份策略

### PostgreSQL 数据库备份

```bash
# 手动备份
sudo -u postgres pg_dump production > ~/backup/production_$(date +%Y%m%d).sql

# 下载到本地
scp -i ./claudeCode.pem ubuntu@124.220.15.80:~/backup/production_*.sql ./backup/
```

### 自动备份（cron）

```bash
crontab -e

# 每日凌晨2点备份
0 2 * * * sudo -u postgres pg_dump production > /home/ubuntu/backup/production_$(date +\%Y\%m\%d).sql

# 清理 7 天前的备份
0 3 * * * find /home/ubuntu/backup -name "production_*.sql" -mtime +7 -delete
```

## 安全注意事项

1. **密钥安全**: `claudeCode.pem` 不要提交到代码仓库
2. **Secrets 安全**: GitHub Secrets 中的密码定期更换
3. **端口暴露**: 仅暴露必要端口（22、80、443）
4. **ACR 安全**: 阿里云 ACR 使用独立的 RAM 子账号
5. **定期更新**: 定期更新 Docker 镜像和系统包
6. **备份**: 定期备份 PostgreSQL 数据库
