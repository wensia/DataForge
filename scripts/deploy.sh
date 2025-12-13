#!/bin/bash
# DataForge 服务器部署脚本
# 从 GitHub Container Registry 拉取镜像并部署

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_msg() {
    echo -e "${1}${2}${NC}"
}

# 配置
DEPLOY_DIR="/www/wwwroot/yunke-transit"
GITHUB_OWNER="panyuhang"  # 替换为你的 GitHub 用户名
REGISTRY="ghcr.io"

# 检查是否在正确目录
cd "$DEPLOY_DIR" || {
    print_msg $RED "错误: 无法进入 $DEPLOY_DIR"
    exit 1
}

# 检查环境变量文件
if [ ! -f "docker/.env" ]; then
    print_msg $RED "错误: docker/.env 文件不存在"
    print_msg $YELLOW "请先复制并配置: cp docker/.env.example docker/.env"
    exit 1
fi

print_msg $BLUE "=========================================="
print_msg $BLUE "     DataForge 部署脚本"
print_msg $BLUE "=========================================="

# 1. 登录 GitHub Container Registry
print_msg $BLUE "\n[1/5] 登录镜像仓库..."
if [ -z "$GITHUB_TOKEN" ]; then
    print_msg $YELLOW "提示: 设置 GITHUB_TOKEN 环境变量可自动登录"
    print_msg $YELLOW "或者手动运行: docker login ghcr.io -u $GITHUB_OWNER"
else
    echo "$GITHUB_TOKEN" | docker login "$REGISTRY" -u "$GITHUB_OWNER" --password-stdin
    print_msg $GREEN "登录成功"
fi

# 2. 拉取最新镜像
print_msg $BLUE "\n[2/5] 拉取最新镜像..."
export GITHUB_OWNER
docker compose -f docker-compose.prod.yml pull

# 3. 停止旧服务
print_msg $BLUE "\n[3/5] 停止旧服务..."
docker compose -f docker-compose.prod.yml down --remove-orphans || true

# 4. 启动新服务
print_msg $BLUE "\n[4/5] 启动新服务..."
docker compose -f docker-compose.prod.yml up -d

# 5. 清理旧镜像
print_msg $BLUE "\n[5/5] 清理旧镜像..."
docker image prune -f

# 显示状态
print_msg $GREEN "\n=========================================="
print_msg $GREEN "     部署完成！"
print_msg $GREEN "=========================================="
echo ""
docker compose -f docker-compose.prod.yml ps
echo ""
print_msg $BLUE "健康检查: curl http://localhost/api/v1/health"
