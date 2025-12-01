# 部署规则

> 服务器部署与运维规范

## 服务器信息

| 项目 | 值 |
|------|-----|
| IP 地址 | `124.220.15.80` |
| 用户名 | `ubuntu` |
| 登录方式 | SSH 密钥登录 |
| 密钥文件 | `claudeCode.pem` |
| 系统 | Ubuntu |
| 面板 | 1Panel |

## SSH 连接

```bash
# 基本连接
ssh -i claudeCode.pem ubuntu@124.220.15.80

# 指定端口（如果非默认22端口）
ssh -i claudeCode.pem -p <port> ubuntu@124.220.15.80

# 确保密钥权限正确
chmod 600 claudeCode.pem
```

## 1Panel 面板

1Panel 是一个现代化的 Linux 服务器运维管理面板。

### 常用功能

| 功能 | 说明 |
|------|------|
| 网站管理 | 创建站点、配置 Nginx 反向代理 |
| 数据库管理 | MySQL/MariaDB/PostgreSQL |
| 容器管理 | Docker 容器管理 |
| 文件管理 | 在线文件管理器 |
| 终端 | Web 终端 |
| 计划任务 | Cron 任务管理 |

### 访问 1Panel

```
http://124.220.15.80:<1panel_port>
```

> 注意：1Panel 默认端口可能是随机的，首次安装时会显示

## 项目部署

### 部署目录

```
/www/wwwroot/yunke-transit/     # 推荐部署目录
├── backend/                    # 后端代码
├── frontend/                   # 前端代码
├── logs/                       # 日志目录
└── manage.sh                   # 管理脚本
```

### 后端部署

#### 1. 安装 Python 和 uv

```bash
# 安装 Python 3.11+
sudo apt update
sudo apt install python3.11 python3.11-venv python3-pip -y

# 安装 uv（推荐）
curl -LsSf https://astral.sh/uv/install.sh | sh
```

#### 2. 部署后端

```bash
cd /www/wwwroot/yunke-transit/backend

# 创建虚拟环境
uv venv

# 激活虚拟环境
source .venv/bin/activate

# 安装依赖
uv pip install -e .

# 运行服务（开发模式）
uvicorn app.main:app --host 0.0.0.0 --port 8847 --reload

# 运行服务（生产模式，使用 nohup）
nohup uvicorn app.main:app --host 0.0.0.0 --port 8847 > ../logs/backend.log 2>&1 &
```

#### 3. 使用 systemd 管理服务（推荐）

创建服务文件：

```bash
sudo nano /etc/systemd/system/yunke-backend.service
```

```ini
[Unit]
Description=Yunke Transit Backend
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/www/wwwroot/yunke-transit/backend
Environment="PATH=/www/wwwroot/yunke-transit/backend/.venv/bin"
ExecStart=/www/wwwroot/yunke-transit/backend/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8847
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# 重载配置
sudo systemctl daemon-reload

# 启动服务
sudo systemctl start yunke-backend

# 开机自启
sudo systemctl enable yunke-backend

# 查看状态
sudo systemctl status yunke-backend

# 查看日志
sudo journalctl -u yunke-backend -f
```

### 前端部署

#### 1. 安装 Node.js 和 pnpm

```bash
# 使用 1Panel 应用商店安装 Node.js
# 或手动安装
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install nodejs -y

# 安装 pnpm
npm install -g pnpm
```

#### 2. 构建前端

```bash
cd /www/wwwroot/yunke-transit/frontend

# 安装依赖
pnpm install

# 构建生产版本
pnpm build

# 构建产物在 dist/ 目录
```

#### 3. 配置 Nginx（通过 1Panel）

在 1Panel 中创建网站，配置如下：

```nginx
server {
    listen 80;
    server_name your-domain.com;  # 或使用 IP

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
```

## 端口规划

| 服务 | 端口 | 说明 |
|------|------|------|
| 前端（Nginx） | 80/443 | 对外访问 |
| 后端（FastAPI） | 8847 | 内部服务 |
| 1Panel | 自定义 | 面板管理 |

## 防火墙配置

```bash
# 使用 1Panel 管理防火墙
# 或使用 ufw

# 开放端口
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp

# 查看状态
sudo ufw status
```

## 日志管理

### 后端日志

```bash
# 查看后端日志
tail -f /www/wwwroot/yunke-transit/logs/backend.log

# 使用 systemd 时
sudo journalctl -u yunke-backend -f
```

### Nginx 日志

```bash
# 访问日志
tail -f /var/log/nginx/access.log

# 错误日志
tail -f /var/log/nginx/error.log
```

## 常用运维命令

```bash
# 查看端口占用
sudo lsof -i :8847
sudo netstat -tlnp | grep 8847

# 查看进程
ps aux | grep uvicorn
ps aux | grep node

# 杀死进程
kill -9 <pid>

# 查看磁盘空间
df -h

# 查看内存使用
free -h

# 查看系统负载
htop
```

## 备份策略

### 数据库备份

```bash
# SQLite 数据库备份
cp /www/wwwroot/yunke-transit/backend/app.db /backup/app_$(date +%Y%m%d).db
```

### 自动备份（使用 1Panel 计划任务）

```bash
# 每日凌晨2点备份
0 2 * * * cp /www/wwwroot/yunke-transit/backend/app.db /backup/app_$(date +\%Y\%m\%d).db
```

## 更新部署

### 后端更新

```bash
cd /www/wwwroot/yunke-transit/backend

# 拉取最新代码
git pull

# 更新依赖
source .venv/bin/activate
uv pip install -e .

# 重启服务
sudo systemctl restart yunke-backend
```

### 前端更新

```bash
cd /www/wwwroot/yunke-transit/frontend

# 拉取最新代码
git pull

# 安装依赖并构建
pnpm install
pnpm build

# Nginx 自动加载新的静态文件，无需重启
```

## 安全注意事项

1. **密钥安全**: `claudeCode.pem` 密钥文件不要提交到代码仓库
2. **端口暴露**: 仅暴露必要端口（80、443、SSH）
3. **定期更新**: 定期更新系统和依赖包
4. **备份**: 定期备份数据库和配置文件
5. **监控**: 使用 1Panel 监控服务器状态

## 故障排查

### 后端服务无法启动

```bash
# 检查端口占用
sudo lsof -i :8847

# 检查日志
sudo journalctl -u yunke-backend -n 50

# 检查 Python 环境
which python
python --version
```

### 前端无法访问

```bash
# 检查 Nginx 配置
sudo nginx -t

# 重载 Nginx
sudo systemctl reload nginx

# 检查前端构建产物
ls -la /www/wwwroot/yunke-transit/frontend/dist/
```

### API 请求失败

```bash
# 测试后端服务
curl http://127.0.0.1:8847/api/v1/health

# 检查 Nginx 代理配置
# 确保 /api/ 路径代理到后端服务
```

