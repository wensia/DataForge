# 部署规则

> 服务器部署与运维规范

## 服务器信息

| 项目 | 值 |
|------|-----|
| IP 地址 | `124.220.15.80` |
| 用户名 | `ubuntu` |
| 登录方式 | SSH 密钥登录 |
| 密钥文件 | `claudeCode.pem` |
| 系统 | Ubuntu 22.04 |
| 面板 | 1Panel |

## SSH 连接

```bash
# 基本连接
ssh -i claudeCode.pem ubuntu@124.220.15.80

# 确保密钥权限正确
chmod 600 claudeCode.pem

# 如果出现 host key 变更警告，清除旧记录
ssh-keygen -R 124.220.15.80
```

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

### 内部端口（无需对外开放）

| 端口 | 说明 |
|------|------|
| 8847 | 后端服务端口，通过 Nginx 代理 |

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
│  └── FastAPI + SQLite (:8847)                          │
└─────────────────────────────────────────────────────────┘
```

### 部署目录

```
/www/wwwroot/yunke-transit/
├── backend/                    # 后端代码
│   ├── app/                    # 应用代码
│   ├── .venv/                  # Python 虚拟环境
│   ├── app.db                  # SQLite 数据库
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

### 2. 创建项目目录

```bash
sudo mkdir -p /www/wwwroot
sudo chown -R ubuntu:ubuntu /www/wwwroot
```

### 3. 上传代码（本地执行）

由于服务器访问 GitHub 较慢，推荐从本地上传：

```bash
# 在本地项目目录执行
rsync -avz \
  --exclude 'node_modules' \
  --exclude '.venv' \
  --exclude '__pycache__' \
  --exclude '*.db' \
  --exclude 'logs' \
  --exclude '.git' \
  --exclude '*.pem' \
  --exclude '.cursor' \
  -e "ssh -i claudeCode.pem" \
  ./ ubuntu@124.220.15.80:/www/wwwroot/yunke-transit/
```

### 4. 部署后端

```bash
# SSH 到服务器
ssh -i claudeCode.pem ubuntu@124.220.15.80

# 进入后端目录
cd /www/wwwroot/yunke-transit/backend

# 创建虚拟环境（指定 Python 3.11）
~/.local/bin/uv venv --python python3.11

# 安装依赖（使用国内镜像）
source .venv/bin/activate
~/.local/bin/uv pip install -e . -i https://pypi.tuna.tsinghua.edu.cn/simple
```

### 5. 配置 systemd 服务

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

### 6. 构建前端（本地执行）

由于服务器网络限制，在本地构建后上传：

```bash
# 在本地 frontend 目录
cd frontend
npx vite build

# 上传构建产物
rsync -avz \
  -e "ssh -i claudeCode.pem" \
  dist/ ubuntu@124.220.15.80:/www/wwwroot/yunke-transit/frontend/dist/
```

### 7. 配置 Nginx

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

### 8. 验证部署

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

### 快速更新脚本（本地执行）

```bash
#!/bin/bash
# update-deploy.sh

PROJECT_DIR="/Users/panyuhang/我的项目/编程/云客中转"
SERVER="ubuntu@124.220.15.80"
KEY="claudeCode.pem"

cd "$PROJECT_DIR"

# 1. 构建前端
echo "Building frontend..."
cd frontend && npx vite build && cd ..

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
  -e "ssh -i $KEY" \
  ./ $SERVER:/www/wwwroot/yunke-transit/

# 3. 重启后端
echo "Restarting backend..."
ssh -i $KEY $SERVER "sudo systemctl restart yunke-backend"

echo "Deploy completed!"
```

### 仅更新后端

```bash
# 上传后端代码
rsync -avz \
  --exclude '__pycache__' \
  --exclude '.venv' \
  --exclude '*.db' \
  -e "ssh -i claudeCode.pem" \
  backend/ ubuntu@124.220.15.80:/www/wwwroot/yunke-transit/backend/

# 重启服务
ssh -i claudeCode.pem ubuntu@124.220.15.80 "sudo systemctl restart yunke-backend"
```

### 仅更新前端

```bash
# 本地构建
cd frontend && npx vite build

# 上传
rsync -avz \
  -e "ssh -i claudeCode.pem" \
  dist/ ubuntu@124.220.15.80:/www/wwwroot/yunke-transit/frontend/dist/
```

## 备份策略

### 数据库备份

```bash
# 手动备份
ssh -i claudeCode.pem ubuntu@124.220.15.80 \
  "cp /www/wwwroot/yunke-transit/backend/app.db ~/backup/app_$(date +%Y%m%d).db"

# 下载到本地
scp -i claudeCode.pem \
  ubuntu@124.220.15.80:/www/wwwroot/yunke-transit/backend/app.db \
  ./backup/app_$(date +%Y%m%d).db
```

### 自动备份（使用 cron）

```bash
# 每日凌晨2点备份
0 2 * * * cp /www/wwwroot/yunke-transit/backend/app.db /home/ubuntu/backup/app_$(date +\%Y\%m\%d).db
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

## 安全注意事项

1. **密钥安全**: `claudeCode.pem` 密钥文件不要提交到代码仓库
2. **端口暴露**: 仅暴露必要端口（22、80、443）
3. **1Panel 安全**: 8090 端口建议仅对管理员 IP 开放
4. **定期更新**: 定期更新系统和依赖包
5. **备份**: 定期备份数据库和配置文件
