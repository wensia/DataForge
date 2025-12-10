#!/bin/bash

# ============================================
# 云客中转 - 项目管理脚本
# ============================================

# 端口配置（随机生成，固定使用）
BACKEND_PORT=8847
FRONTEND_PORT=3691

# 项目路径
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend-react"

# PID 文件
BACKEND_PID_FILE="$PROJECT_DIR/.backend.pid"
FRONTEND_PID_FILE="$PROJECT_DIR/.frontend.pid"

# 日志文件
LOG_DIR="$PROJECT_DIR/logs"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 确保日志目录存在
ensure_log_dir() {
    if [ ! -d "$LOG_DIR" ]; then
        mkdir -p "$LOG_DIR"
    fi
}

# 检查端口是否被占用
check_port() {
    local port=$1
    if lsof -i :$port > /dev/null 2>&1; then
        return 0  # 端口被占用
    else
        return 1  # 端口可用
    fi
}

# 启动后端
start_backend() {
    info "正在启动后端服务..."
    
    if [ -f "$BACKEND_PID_FILE" ]; then
        local pid=$(cat "$BACKEND_PID_FILE")
        if ps -p $pid > /dev/null 2>&1; then
            warning "后端服务已在运行 (PID: $pid)"
            return 0
        fi
    fi
    
    if check_port $BACKEND_PORT; then
        error "端口 $BACKEND_PORT 已被占用"
        return 1
    fi
    
    cd "$BACKEND_DIR"
    
    # 检查虚拟环境
    if [ ! -d ".venv" ]; then
        info "创建虚拟环境..."
        uv venv
    fi
    
    # 激活虚拟环境并安装依赖
    source .venv/bin/activate
    
    # 检查依赖是否安装
    if ! python -c "import fastapi" 2>/dev/null; then
        info "安装后端依赖..."
        uv pip install -e .
    fi
    
    # 启动服务
    ensure_log_dir
    nohup uvicorn app.main:app --host 0.0.0.0 --port $BACKEND_PORT --reload > "$BACKEND_LOG" 2>&1 &
    local pid=$!
    echo $pid > "$BACKEND_PID_FILE"
    
    sleep 2
    if ps -p $pid > /dev/null 2>&1; then
        success "后端服务启动成功 (PID: $pid, 端口: $BACKEND_PORT)"
    else
        error "后端服务启动失败，请查看日志: $BACKEND_LOG"
        return 1
    fi
}

# 启动前端
start_frontend() {
    info "正在启动前端服务..."
    
    if [ -f "$FRONTEND_PID_FILE" ]; then
        local pid=$(cat "$FRONTEND_PID_FILE")
        if ps -p $pid > /dev/null 2>&1; then
            warning "前端服务已在运行 (PID: $pid)"
            return 0
        fi
    fi
    
    if check_port $FRONTEND_PORT; then
        error "端口 $FRONTEND_PORT 已被占用"
        return 1
    fi
    
    cd "$FRONTEND_DIR"
    
    # 检查依赖是否安装
    if [ ! -d "node_modules" ]; then
        info "安装前端依赖..."
        pnpm install
    fi
    
    # 启动服务
    ensure_log_dir
    nohup pnpm dev --port $FRONTEND_PORT --host > "$FRONTEND_LOG" 2>&1 &
    local pid=$!
    echo $pid > "$FRONTEND_PID_FILE"
    
    sleep 3
    if ps -p $pid > /dev/null 2>&1; then
        success "前端服务启动成功 (PID: $pid, 端口: $FRONTEND_PORT)"
    else
        error "前端服务启动失败，请查看日志: $FRONTEND_LOG"
        return 1
    fi
}

# 停止后端
stop_backend() {
    info "正在停止后端服务..."
    
    if [ -f "$BACKEND_PID_FILE" ]; then
        local pid=$(cat "$BACKEND_PID_FILE")
        if ps -p $pid > /dev/null 2>&1; then
            kill $pid 2>/dev/null
            sleep 1
            if ps -p $pid > /dev/null 2>&1; then
                kill -9 $pid 2>/dev/null
            fi
            success "后端服务已停止 (PID: $pid)"
        else
            warning "后端服务未运行"
        fi
        rm -f "$BACKEND_PID_FILE"
    else
        warning "后端服务未运行"
    fi
    
    # 清理可能残留的进程
    pkill -f "uvicorn app.main:app.*$BACKEND_PORT" 2>/dev/null
}

# 停止前端
stop_frontend() {
    info "正在停止前端服务..."
    
    if [ -f "$FRONTEND_PID_FILE" ]; then
        local pid=$(cat "$FRONTEND_PID_FILE")
        if ps -p $pid > /dev/null 2>&1; then
            kill $pid 2>/dev/null
            sleep 1
            if ps -p $pid > /dev/null 2>&1; then
                kill -9 $pid 2>/dev/null
            fi
            success "前端服务已停止 (PID: $pid)"
        else
            warning "前端服务未运行"
        fi
        rm -f "$FRONTEND_PID_FILE"
    else
        warning "前端服务未运行"
    fi
    
    # 清理可能残留的进程
    pkill -f "vite.*$FRONTEND_PORT" 2>/dev/null
}

# 启动所有服务
start_all() {
    echo ""
    echo "=========================================="
    echo "       云客中转 - 启动服务"
    echo "=========================================="
    echo ""
    start_backend
    start_frontend
    echo ""
    echo "=========================================="
    echo "  后端地址: http://localhost:$BACKEND_PORT"
    echo "  前端地址: http://localhost:$FRONTEND_PORT"
    echo "  API文档:  http://localhost:$BACKEND_PORT/docs"
    echo "=========================================="
    echo ""
}

# 停止所有服务
stop_all() {
    echo ""
    echo "=========================================="
    echo "       云客中转 - 停止服务"
    echo "=========================================="
    echo ""
    stop_backend
    stop_frontend
    echo ""
}

# 重启所有服务
restart_all() {
    stop_all
    sleep 2
    start_all
}

# 查看服务状态
status() {
    echo ""
    echo "=========================================="
    echo "       云客中转 - 服务状态"
    echo "=========================================="
    echo ""
    
    # 后端状态
    if [ -f "$BACKEND_PID_FILE" ]; then
        local backend_pid=$(cat "$BACKEND_PID_FILE")
        if ps -p $backend_pid > /dev/null 2>&1; then
            success "后端服务: 运行中 (PID: $backend_pid, 端口: $BACKEND_PORT)"
        else
            warning "后端服务: 已停止 (PID文件存在但进程不存在)"
        fi
    else
        warning "后端服务: 未运行"
    fi
    
    # 前端状态
    if [ -f "$FRONTEND_PID_FILE" ]; then
        local frontend_pid=$(cat "$FRONTEND_PID_FILE")
        if ps -p $frontend_pid > /dev/null 2>&1; then
            success "前端服务: 运行中 (PID: $frontend_pid, 端口: $FRONTEND_PORT)"
        else
            warning "前端服务: 已停止 (PID文件存在但进程不存在)"
        fi
    else
        warning "前端服务: 未运行"
    fi
    
    echo ""
    echo "=========================================="
    echo "  后端地址: http://localhost:$BACKEND_PORT"
    echo "  前端地址: http://localhost:$FRONTEND_PORT"
    echo "  API文档:  http://localhost:$BACKEND_PORT/docs"
    echo "=========================================="
    echo ""
}

# 查看日志
logs() {
    local service=$1
    case $service in
        backend)
            if [ -f "$BACKEND_LOG" ]; then
                tail -f "$BACKEND_LOG"
            else
                error "后端日志文件不存在"
            fi
            ;;
        frontend)
            if [ -f "$FRONTEND_LOG" ]; then
                tail -f "$FRONTEND_LOG"
            else
                error "前端日志文件不存在"
            fi
            ;;
        *)
            error "请指定服务: backend 或 frontend"
            echo "用法: $0 logs <backend|frontend>"
            ;;
    esac
}

# 显示帮助信息
show_help() {
    echo ""
    echo "云客中转 - 项目管理脚本"
    echo ""
    echo "用法: $0 <命令> [参数]"
    echo ""
    echo "命令:"
    echo "  start           启动所有服务"
    echo "  stop            停止所有服务"
    echo "  restart         重启所有服务"
    echo "  status          查看服务状态"
    echo "  start-backend   仅启动后端"
    echo "  stop-backend    仅停止后端"
    echo "  start-frontend  仅启动前端"
    echo "  stop-frontend   仅停止前端"
    echo "  logs <service>  查看日志 (backend|frontend)"
    echo "  help            显示帮助信息"
    echo ""
    echo "端口配置:"
    echo "  后端端口: $BACKEND_PORT"
    echo "  前端端口: $FRONTEND_PORT"
    echo ""
}

# 主入口
case "$1" in
    start)
        start_all
        ;;
    stop)
        stop_all
        ;;
    restart)
        restart_all
        ;;
    status)
        status
        ;;
    start-backend)
        start_backend
        ;;
    stop-backend)
        stop_backend
        ;;
    start-frontend)
        start_frontend
        ;;
    stop-frontend)
        stop_frontend
        ;;
    logs)
        logs $2
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        show_help
        exit 1
        ;;
esac






