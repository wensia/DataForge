#!/bin/bash
# DataForge Docker 管理脚本

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目根目录
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

# 打印带颜色的消息
print_msg() {
    local color=$1
    local msg=$2
    echo -e "${color}${msg}${NC}"
}

# 检查 Docker 和 Docker Compose
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_msg $RED "错误: Docker 未安装"
        exit 1
    fi
    if ! docker compose version &> /dev/null; then
        print_msg $RED "错误: Docker Compose 未安装"
        exit 1
    fi
}

# 检查环境变量文件
check_env() {
    if [ ! -f "docker/.env" ]; then
        print_msg $YELLOW "警告: docker/.env 文件不存在"
        print_msg $BLUE "正在从模板创建..."
        cp docker/.env.example docker/.env
        print_msg $YELLOW "请编辑 docker/.env 配置你的环境变量"
        exit 1
    fi
}

# 启动服务
start() {
    print_msg $BLUE "启动 DataForge 服务..."
    docker compose up -d "$@"
    print_msg $GREEN "服务启动成功！"
    status
}

# 停止服务
stop() {
    print_msg $BLUE "停止 DataForge 服务..."
    docker compose down "$@"
    print_msg $GREEN "服务已停止"
}

# 重启服务
restart() {
    print_msg $BLUE "重启 DataForge 服务..."
    docker compose restart "$@"
    print_msg $GREEN "服务重启完成"
}

# 查看状态
status() {
    print_msg $BLUE "服务状态:"
    docker compose ps
}

# 查看日志
logs() {
    docker compose logs "$@"
}

# 构建镜像
build() {
    print_msg $BLUE "构建 Docker 镜像..."
    docker compose build "$@"
    print_msg $GREEN "构建完成"
}

# 更新部署
update() {
    print_msg $BLUE "更新 DataForge..."
    print_msg $BLUE "1. 拉取最新代码..."
    git pull
    print_msg $BLUE "2. 重新构建镜像..."
    docker compose build --no-cache
    print_msg $BLUE "3. 重启服务..."
    docker compose up -d
    print_msg $GREEN "更新完成！"
    status
}

# 备份数据库
backup() {
    local backup_file="backup_$(date +%Y%m%d_%H%M%S).sql"
    print_msg $BLUE "备份数据库到 ${backup_file}..."
    docker compose exec -T postgres pg_dump -U postgres dataforge > "$backup_file"
    print_msg $GREEN "备份完成: ${backup_file}"
}

# 恢复数据库
restore() {
    if [ -z "$1" ]; then
        print_msg $RED "用法: $0 restore <备份文件>"
        exit 1
    fi
    if [ ! -f "$1" ]; then
        print_msg $RED "错误: 文件 $1 不存在"
        exit 1
    fi
    print_msg $YELLOW "警告: 这将覆盖现有数据库！"
    read -p "确认继续？(y/N) " confirm
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        print_msg $BLUE "恢复数据库..."
        docker compose exec -T postgres psql -U postgres -d dataforge < "$1"
        print_msg $GREEN "恢复完成"
    else
        print_msg $YELLOW "操作已取消"
    fi
}

# 清理资源
clean() {
    print_msg $YELLOW "警告: 这将删除所有容器、镜像和卷！"
    read -p "确认继续？(y/N) " confirm
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        print_msg $BLUE "停止并删除容器..."
        docker compose down -v --rmi local
        print_msg $GREEN "清理完成"
    else
        print_msg $YELLOW "操作已取消"
    fi
}

# 进入容器
shell() {
    local service=${1:-backend}
    print_msg $BLUE "进入 ${service} 容器..."
    docker compose exec "$service" sh
}

# 显示帮助
help() {
    echo "DataForge Docker 管理脚本"
    echo ""
    echo "用法: $0 <命令> [参数]"
    echo ""
    echo "命令:"
    echo "  start [服务...]   启动服务 (默认所有服务)"
    echo "  stop [服务...]    停止服务"
    echo "  restart [服务...] 重启服务"
    echo "  status            查看服务状态"
    echo "  logs [服务] [-f]  查看日志"
    echo "  build [服务...]   构建镜像"
    echo "  update            拉取代码并重新部署"
    echo "  backup            备份数据库"
    echo "  restore <文件>    恢复数据库"
    echo "  shell [服务]      进入容器 (默认 backend)"
    echo "  clean             清理所有容器和卷"
    echo "  help              显示帮助"
    echo ""
    echo "示例:"
    echo "  $0 start                    # 启动所有服务"
    echo "  $0 start backend postgres   # 只启动后端和数据库"
    echo "  $0 logs backend -f          # 实时查看后端日志"
    echo "  $0 shell postgres           # 进入 PostgreSQL 容器"
}

# 主入口
main() {
    check_docker

    case "${1:-help}" in
        start)
            check_env
            shift
            start "$@"
            ;;
        stop)
            shift
            stop "$@"
            ;;
        restart)
            shift
            restart "$@"
            ;;
        status)
            status
            ;;
        logs)
            shift
            logs "$@"
            ;;
        build)
            shift
            build "$@"
            ;;
        update)
            check_env
            update
            ;;
        backup)
            backup
            ;;
        restore)
            shift
            restore "$@"
            ;;
        shell)
            shift
            shell "$@"
            ;;
        clean)
            clean
            ;;
        help|--help|-h)
            help
            ;;
        *)
            print_msg $RED "未知命令: $1"
            help
            exit 1
            ;;
    esac
}

main "$@"
