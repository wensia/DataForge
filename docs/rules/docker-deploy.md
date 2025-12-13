# DataForge Docker 部署指南

## 架构概览

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Host                          │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐   │
│  │              Nginx (:80/:443)                    │   │
│  │  ├── /        → Frontend Container              │   │
│  │  └── /api/    → Backend Container               │   │
│  └─────────────────────────────────────────────────┘   │
│                         │                               │
│          ┌──────────────┴──────────────┐               │
│          ▼                              ▼               │
│  ┌───────────────┐             ┌───────────────┐       │
│  │   Frontend    │             │   Backend     │       │
│  │  (Nginx:80)   │             │ (Uvicorn:8847)│       │
│  └───────────────┘             └───────┬───────┘       │
│                                        │               │
│                          ┌─────────────┴─────────────┐ │
│                          ▼                           ▼ │
│                  ┌───────────────┐         ┌─────────┐ │
│                  │  PostgreSQL   │         │  Redis  │ │
│                  │   (:5432)     │         │ (:6379) │ │
│                  └───────────────┘         └─────────┘ │
└─────────────────────────────────────────────────────────┘
```

## 目录结构

```
DataForge/
├── docker-compose.yml          # 服务编排
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
    ├── nginx/
    │   ├── nginx.conf          # Nginx 主配置
    │   ├── conf.d/
    │   │   └── default.conf    # 站点配置
    │   └── ssl/                # SSL 证书目录
    └── postgres/
        └── init/               # 数据库初始化脚本
```

## 快速开始

### 1. 配置环境变量

```bash
# 复制配置模板
cp docker/.env.example docker/.env

# 编辑配置
vim docker/.env
```

**必须修改的配置：**
```env
POSTGRES_PASSWORD=你的安全密码
REDIS_PASSWORD=你的安全密码
JWT_SECRET_KEY=随机生成的安全密钥
API_KEYS=df_你的API密钥
```

### 2. 启动服务

```bash
# 构建并启动所有服务
docker compose up -d --build

# 查看日志
docker compose logs -f

# 查看服务状态
docker compose ps
```

### 3. 访问服务

- 前端：http://localhost
- API：http://localhost/api/v1
- 健康检查：http://localhost/api/v1/health

## 常用命令

```bash
# 启动服务
docker compose up -d

# 停止服务
docker compose down

# 重启单个服务
docker compose restart backend

# 查看日志
docker compose logs -f backend
docker compose logs -f --tail=100 nginx

# 进入容器
docker compose exec backend bash
docker compose exec postgres psql -U postgres -d dataforge

# 重新构建镜像
docker compose build --no-cache backend
docker compose up -d backend
```

## 数据持久化

Docker 卷用于持久化数据：

| 卷名 | 用途 |
|------|------|
| `dataforge-postgres-data` | PostgreSQL 数据 |
| `dataforge-redis-data` | Redis 持久化数据 |
| `dataforge-backend-logs` | 后端日志 |

```bash
# 查看卷
docker volume ls | grep dataforge

# 备份 PostgreSQL 数据
docker compose exec postgres pg_dump -U postgres dataforge > backup.sql

# 恢复数据
docker compose exec -T postgres psql -U postgres dataforge < backup.sql
```

## 生产环境配置

### 启用 HTTPS

1. 将 SSL 证书放入 `docker/nginx/ssl/` 目录：
   - `cert.pem` - 证书文件
   - `key.pem` - 私钥文件

2. 编辑 `docker/nginx/conf.d/default.conf`，取消 HTTPS 部分的注释

3. 重启 Nginx：
   ```bash
   docker compose restart nginx
   ```

### 外部数据库访问

如需从容器外部访问数据库，编辑 `docker-compose.yml`，取消 ports 注释：

```yaml
postgres:
  ports:
    - "5432:5432"  # 取消注释
```

### 性能优化

1. **PostgreSQL 调优** - 编辑 `docker/postgres/postgresql.conf`：
   ```conf
   shared_buffers = 256MB
   effective_cache_size = 768MB
   work_mem = 16MB
   ```

2. **Redis 配置** - 修改 docker-compose.yml 中的 redis 命令：
   ```yaml
   command: redis-server --requirepass ${REDIS_PASSWORD} --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
   ```

## 监控与维护

### 健康检查

所有服务都配置了健康检查：

```bash
# 检查服务健康状态
docker compose ps

# 手动检查
curl http://localhost/nginx-health
curl http://localhost/api/v1/health
```

### 日志管理

```bash
# 查看所有日志
docker compose logs

# 实时查看特定服务
docker compose logs -f backend

# 导出日志
docker compose logs backend > backend.log 2>&1
```

### 更新部署

```bash
# 拉取最新代码
git pull

# 重新构建并部署
docker compose down
docker compose up -d --build

# 或者只更新特定服务
docker compose build backend
docker compose up -d backend
```

## 故障排除

### 服务无法启动

```bash
# 检查日志
docker compose logs backend

# 检查配置
docker compose config

# 检查网络
docker network ls
docker network inspect dataforge_dataforge-network
```

### 数据库连接失败

```bash
# 检查 PostgreSQL 状态
docker compose exec postgres pg_isready

# 检查连接
docker compose exec backend python -c "
from app.database import engine
print(engine.url)
"
```

### 端口冲突

```bash
# 检查端口占用
lsof -i :80
lsof -i :5432

# 修改 docker-compose.yml 中的端口映射
ports:
  - "8080:80"  # 改用其他端口
```

## 开发环境

开发时可以只启动基础服务，本地运行前后端：

```bash
# 只启动数据库和 Redis
docker compose up -d postgres redis

# 本地运行后端
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8847

# 本地运行前端
cd frontend-react
pnpm dev
```

修改 `backend/.env`：
```env
DATABASE_URL=postgresql://postgres:密码@localhost:5432/dataforge
REDIS_URL=redis://:密码@localhost:6379/0
```

## 从传统部署迁移

1. **导出旧数据库**：
   ```bash
   pg_dump -h 旧服务器IP -U postgres production > backup.sql
   ```

2. **启动新 Docker 环境**：
   ```bash
   docker compose up -d postgres redis
   ```

3. **导入数据**：
   ```bash
   docker compose exec -T postgres psql -U postgres -d dataforge < backup.sql
   ```

4. **启动完整服务**：
   ```bash
   docker compose up -d --build
   ```
