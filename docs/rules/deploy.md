# 部署规则

> 服务器部署与运维规范

## 服务器信息

| 项目 | 值 |
|------|-----|
| IP 地址 | `124.220.15.80` |
| 用户名 | `ubuntu` |
| 登录方式 | SSH 密钥登录 |
| 密钥文件 | 项目根目录 `./claudeCode.pem` |
| 系统 | Ubuntu 22.04 |
| 面板 | 1Panel |

## SSH 连接

**重要**: 所有 SSH 命令需在项目根目录执行，密钥文件位于 `./claudeCode.pem`

```bash
# 基本连接（在项目根目录执行）
ssh -i ./claudeCode.pem ubuntu@124.220.15.80

# 确保密钥权限正确
chmod 600 ./claudeCode.pem

# 如果出现 host key 变更警告，清除旧记录
ssh-keygen -R 124.220.15.80
```

### 推荐：配置 SSH 别名（可选）

添加到 `~/.ssh/config` 简化连接：

```bash
Host dataforge
  HostName 124.220.15.80
  User ubuntu
  IdentityFile /Users/panyuhang/我的项目/编程/网站/DataForge/claudeCode.pem
```

配置后可直接使用 `ssh dataforge` 连接

## 1Panel 面板

### 访问地址

```
http://124.220.15.80:8090/tencentcloud
```

### 常用功能

| 功能 | 说明 |
|------|------|
| 网站管理 | 创建站点、配置 Nginx 反向代理 |
| 文件管理 | 在线文件管理器 |
| 终端 | Web 终端 |
| 计划任务 | Cron 任务管理 |

## 端口配置

### 必须开放的端口

| 端口 | 协议 | 用途 | 说明 |
|------|------|------|------|
| 22 | TCP | SSH | 远程登录管理 |
| 80 | TCP | HTTP | 前端访问 + API |

### 可选端口

| 端口 | 协议 | 用途 | 说明 |
|------|------|------|------|
| 443 | TCP | HTTPS | 如果配置 SSL 证书 |
| 8090 | TCP | 1Panel | 面板管理（建议限制 IP） |
| 5432 | TCP | PostgreSQL | 仅开发环境需要（限制 IP） |

### 内部端口（无需对外开放）

| 端口 | 说明 |
|------|------|
| 8847 | 后端服务端口，通过 Nginx 代理 |
| 5432 | PostgreSQL 端口（服务器上通过 127.0.0.1 访问） |

### 腾讯云安全组配置

```
协议    端口      来源            说明
TCP     22       你的IP          SSH登录
TCP     80       0.0.0.0/0       HTTP访问
TCP     443      0.0.0.0/0       HTTPS（可选）
TCP     8090     你的IP          1Panel管理（限制IP）
```

## 项目部署

### 部署架构

```
┌─────────────────────────────────────────────────────────┐
│                    124.220.15.80                        │
├─────────────────────────────────────────────────────────┤
│  Nginx (:80)                                            │
│  ├── /           → 前端静态文件 (dist/)                 │
│  └── /api/       → 后端服务 (127.0.0.1:8847)           │
├─────────────────────────────────────────────────────────┤
│  后端服务 (systemd: yunke-backend)                      │
│  └── FastAPI (:8847) → PostgreSQL (:5432)              │
├─────────────────────────────────────────────────────────┤
│  PostgreSQL 16 (:5432)                                  │
│  └── 数据库: production                                 │
└─────────────────────────────────────────────────────────┘
```

### 部署目录

```
/www/wwwroot/yunke-transit/
├── backend/                    # 后端代码
│   ├── app/                    # 应用代码
│   ├── .venv/                  # Python 虚拟环境
│   ├── .env                    # 环境变量配置
│   └── pyproject.toml          # 依赖配置
├── frontend/                   # 前端代码
│   ├── dist/                   # 构建产物
│   └── src/                    # 源代码
├── docs/                       # 文档
└── manage.sh                   # 管理脚本
```

## 首次部署（完整流程）

### 1. 安装系统依赖

```bash
# 添加 Python 3.11 源
sudo add-apt-repository ppa:deadsnakes/ppa -y
sudo apt update

# 安装 Python 3.11
sudo apt install python3.11 python3.11-venv python3.11-dev -y

# 安装 uv（使用国内镜像）
python3.11 -m pip install uv -i https://pypi.tuna.tsinghua.edu.cn/simple

# 安装 Nginx
sudo apt install nginx -y
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
```

### 3. 配置 PostgreSQL

```bash
# 切换到 postgres 用户
sudo -u postgres psql

# 在 psql 中执行：
ALTER USER postgres PASSWORD 'YOUR_SECURE_PASSWORD';
CREATE DATABASE production;
\q
```

### 4. 配置远程访问（可选，用于本地开发连接）

```bash
# 修改监听地址
sudo sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" /etc/postgresql/16/main/postgresql.conf

# 添加远程访问规则
echo "host    all    all    0.0.0.0/0    md5" | sudo tee -a /etc/postgresql/16/main/pg_hba.conf

# 重启 PostgreSQL
sudo systemctl restart postgresql
```

**注意**: 远程访问需要开放 5432 端口，仅在需要本地开发连接时配置

### 5. 创建项目目录

```bash
sudo mkdir -p /www/wwwroot
sudo chown -R ubuntu:ubuntu /www/wwwroot
```

### 6. 上传代码（本地执行）

由于服务器访问 GitHub 较慢，推荐从本地上传：

```bash
# 在项目根目录执行
rsync -avz \
  --exclude 'node_modules' \
  --exclude '.venv' \
  --exclude '__pycache__' \
  --exclude '*.db' \
  --exclude 'logs' \
  --exclude '.git' \
  --exclude '*.pem' \
  --exclude '.cursor' \
  --exclude '.claude' \
  -e "ssh -i ./claudeCode.pem" \
  ./ ubuntu@124.220.15.80:/www/wwwroot/yunke-transit/
```

### 7. 配置后端环境变量

```bash
# 创建 .env 文件
cat > /www/wwwroot/yunke-transit/backend/.env << 'EOF'
# 数据库连接（服务器部署使用本地回环）
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@127.0.0.1:5432/production

# 调试模式（生产环境设为 false）
DEBUG=false

# API 密钥
API_KEYS=your-api-key-here
EOF
```

### 8. 部署后端

```bash
# SSH 到服务器（在项目根目录执行）
ssh -i ./claudeCode.pem ubuntu@124.220.15.80

# 进入后端目录
cd /www/wwwroot/yunke-transit/backend

# 创建虚拟环境（指定 Python 3.11）
~/.local/bin/uv venv --python python3.11

# 安装依赖（使用国内镜像，包含 PostgreSQL 驱动）
source .venv/bin/activate
~/.local/bin/uv pip install -e . psycopg2-binary -i https://pypi.tuna.tsinghua.edu.cn/simple
```

### 9. 配置 systemd 服务

创建服务文件：

```bash
sudo tee /etc/systemd/system/yunke-backend.service > /dev/null << 'EOF'
[Unit]
Description=Yunke Transit Backend
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/www/wwwroot/yunke-transit/backend
Environment="PATH=/www/wwwroot/yunke-transit/backend/.venv/bin:/home/ubuntu/.local/bin:/usr/local/bin:/usr/bin:/bin"
ExecStart=/www/wwwroot/yunke-transit/backend/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8847
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
```

启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable yunke-backend
sudo systemctl start yunke-backend

# 检查状态
sudo systemctl status yunke-backend
```

### 10. 构建前端（本地执行）

由于服务器网络限制，在本地构建后上传：

```bash
# 在项目根目录执行
cd frontend-react && pnpm build && cd ..

# 上传构建产物
rsync -avz \
  -e "ssh -i ./claudeCode.pem" \
  frontend-react/dist/ ubuntu@124.220.15.80:/www/wwwroot/yunke-transit/frontend/dist/
```

### 11. 配置 Nginx

```bash
# SSH 到服务器后执行
sudo tee /etc/nginx/sites-available/yunke-transit > /dev/null << 'EOF'
server {
    listen 80;
    server_name _;

    # 前端静态文件
    location / {
        root /www/wwwroot/yunke-transit/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # API 代理
    location /api/ {
        proxy_pass http://127.0.0.1:8847;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# 启用站点
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/yunke-transit /etc/nginx/sites-enabled/

# 测试并重载
sudo nginx -t
sudo systemctl reload nginx
```

### 12. 验证部署

```bash
# 测试后端 API
curl http://127.0.0.1:8847/api/v1/health

# 测试前端（从外部访问）
curl http://124.220.15.80/
```

## 日常运维

### 服务管理

```bash
# 后端服务
sudo systemctl start yunke-backend     # 启动
sudo systemctl stop yunke-backend      # 停止
sudo systemctl restart yunke-backend   # 重启
sudo systemctl status yunke-backend    # 状态

# Nginx
sudo systemctl reload nginx            # 重载配置
sudo systemctl restart nginx           # 重启
```

### 日志查看

```bash
# 后端日志
sudo journalctl -u yunke-backend -f

# Nginx 日志
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

### 常用运维命令

```bash
# 查看端口占用
sudo lsof -i :8847
sudo netstat -tlnp | grep 8847

# 查看进程
ps aux | grep uvicorn

# 查看磁盘空间
df -h

# 查看内存使用
free -h
```

## 更新部署

### 快速更新脚本（在项目根目录执行）

```bash
#!/bin/bash
# deploy.sh - 一键部署脚本

SERVER="ubuntu@124.220.15.80"
KEY="./claudeCode.pem"
REMOTE_DIR="/www/wwwroot/yunke-transit"

# 1. 构建前端
echo "Building frontend..."
cd frontend-react && pnpm build && cd ..

# 2. 上传代码
echo "Uploading code..."
rsync -avz \
  --exclude 'node_modules' \
  --exclude '.venv' \
  --exclude '__pycache__' \
  --exclude '*.db' \
  --exclude 'logs' \
  --exclude '.git' \
  --exclude '*.pem' \
  --exclude '.cursor' \
  --exclude '.claude' \
  -e "ssh -i $KEY" \
  ./ $SERVER:$REMOTE_DIR/

# 3. 重启后端
echo "Restarting backend..."
ssh -i $KEY $SERVER "sudo systemctl restart yunke-backend"

echo "Deploy completed!"
```

### 仅更新后端（在项目根目录执行）

```bash
# 上传后端代码
rsync -avz \
  --exclude '__pycache__' \
  --exclude '.venv' \
  --exclude '*.db' \
  -e "ssh -i ./claudeCode.pem" \
  backend/ ubuntu@124.220.15.80:/www/wwwroot/yunke-transit/backend/

# 重启服务
ssh -i ./claudeCode.pem ubuntu@124.220.15.80 "sudo systemctl restart yunke-backend"
```

### 仅更新前端（在项目根目录执行）

```bash
# 构建
cd frontend-react && pnpm build && cd ..

# 上传
rsync -avz \
  -e "ssh -i ./claudeCode.pem" \
  frontend-react/dist/ ubuntu@124.220.15.80:/www/wwwroot/yunke-transit/frontend/dist/
```

## 备份策略

### PostgreSQL 数据库备份

```bash
# 手动备份（在服务器上执行）
sudo -u postgres pg_dump production > ~/backup/production_$(date +%Y%m%d).sql

# 下载到本地（在项目根目录执行）
scp -i ./claudeCode.pem \
  ubuntu@124.220.15.80:~/backup/production_$(date +%Y%m%d).sql \
  ./backup/

# 远程执行备份并下载（在项目根目录执行）
ssh -i ./claudeCode.pem ubuntu@124.220.15.80 \
  "sudo -u postgres pg_dump production" > ./backup/production_$(date +%Y%m%d).sql
```

### 数据库恢复

```bash
# 恢复数据库
sudo -u postgres psql production < ~/backup/production_20241208.sql
```

### 自动备份（使用 cron）

```bash
# 编辑 crontab
crontab -e

# 添加每日凌晨2点备份任务
0 2 * * * sudo -u postgres pg_dump production > /home/ubuntu/backup/production_$(date +\%Y\%m\%d).sql

# 清理 7 天前的备份
0 3 * * * find /home/ubuntu/backup -name "production_*.sql" -mtime +7 -delete
```

## 故障排查

### 后端服务无法启动

```bash
# 检查端口占用
sudo lsof -i :8847

# 检查详细日志
sudo journalctl -u yunke-backend -n 100 --no-pager

# 检查 Python 环境
/www/wwwroot/yunke-transit/backend/.venv/bin/python --version
```

### 前端无法访问

```bash
# 检查 Nginx 配置
sudo nginx -t

# 检查前端文件是否存在
ls -la /www/wwwroot/yunke-transit/frontend/dist/

# 检查 Nginx 状态
sudo systemctl status nginx
```

### API 请求失败

```bash
# 测试后端是否运行
curl http://127.0.0.1:8847/api/v1/health

# 检查 Nginx 代理日志
tail -f /var/log/nginx/error.log
```

### PostgreSQL 连接问题

```bash
# 检查 PostgreSQL 服务状态
sudo systemctl status postgresql

# 检查 PostgreSQL 日志
sudo tail -f /var/log/postgresql/postgresql-16-main.log

# 测试数据库连接
sudo -u postgres psql -c "SELECT 1"

# 检查数据库是否存在
sudo -u postgres psql -l

# 检查监听端口
sudo ss -tlnp | grep 5432

# 重启 PostgreSQL
sudo systemctl restart postgresql
```

## 安全注意事项

1. **密钥安全**: `claudeCode.pem` 密钥文件不要提交到代码仓库
2. **端口暴露**: 仅暴露必要端口（22、80、443）
3. **1Panel 安全**: 8090 端口建议仅对管理员 IP 开放
4. **PostgreSQL 安全**:
   - 生产环境使用 127.0.0.1 连接，不对外暴露 5432 端口
   - 开发环境如需远程访问，务必限制 IP 白名单
   - 使用强密码
5. **定期更新**: 定期更新系统和依赖包
6. **备份**: 定期备份 PostgreSQL 数据库
