#!/bin/bash

# 一键启动个人理财统计系统所有服务
# 用法: ./start.sh          启动所有服务
#       ./start.sh stop     停止所有服务
#       ./start.sh status   查看服务状态

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

DB_PORT=3002
SCRAPER_PORT=3001
FRONTEND_PORT=5173

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

check_port() {
    lsof -i :$1 -sTCP:LISTEN -t 2>/dev/null
}

wait_for_port() {
    local port=$1 name=$2 max_wait=10 count=0
    while [ $count -lt $max_wait ]; do
        if [ "$(check_port $port)" ]; then
            log_info "$name 已就绪 (端口 $port)"
            return 0
        fi
        sleep 1
        count=$((count + 1))
    done
    log_error "$name 启动超时 (端口 $port)"
    return 1
}

start_services() {
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}  个人理财统计系统 - 一键启动${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""

    # 检查端口占用
    for port_info in "$DB_PORT:数据库服务" "$SCRAPER_PORT:爬虫服务" "$FRONTEND_PORT:前端服务"; do
        port=${port_info%%:*}
        name=${port_info##*:}
        if [ "$(check_port $port)" ]; then
            log_warn "$name 端口 $port 已被占用，跳过启动"
        fi
    done

    # 1. 数据库服务
    if [ ! "$(check_port $DB_PORT)" ]; then
        log_info "启动数据库服务 (端口 $DB_PORT)..."
        nohup node server/db-server.js > /dev/null 2>&1 &
        echo $! >> "$PROJECT_DIR/.pids"
    fi

    # 2. 爬虫服务
    if [ ! "$(check_port $SCRAPER_PORT)" ]; then
        log_info "启动爬虫服务 (端口 $SCRAPER_PORT)..."
        nohup node server/scraper.mjs > /dev/null 2>&1 &
        echo $! >> "$PROJECT_DIR/.pids"
    fi

    # 3. 前端服务
    if [ ! "$(check_port $FRONTEND_PORT)" ]; then
        log_info "启动前端开发服务 (端口 $FRONTEND_PORT)..."
        nohup npx vite --port $FRONTEND_PORT > /dev/null 2>&1 &
        echo $! >> "$PROJECT_DIR/.pids"
    fi

    # 等待服务就绪
    echo ""
    log_info "等待服务就绪..."
    echo ""

    wait_for_port $DB_PORT "数据库服务"
    wait_for_port $SCRAPER_PORT "爬虫服务"
    wait_for_port $FRONTEND_PORT "前端服务"

    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${GREEN}  所有服务已启动！${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""
    echo -e "  前端应用:    ${CYAN}http://localhost:$FRONTEND_PORT${NC}"
    echo -e "  数据库 API:  ${CYAN}http://localhost:$DB_PORT${NC}"
    echo -e "  爬虫服务:    ${CYAN}http://localhost:$SCRAPER_PORT${NC}"
    echo ""
    echo -e "  停止服务:    ${YELLOW}./start.sh stop${NC}"
    echo -e "  查看状态:    ${YELLOW}./start.sh status${NC}"
    echo ""
}

stop_services() {
    echo ""
    log_info "正在停止所有服务..."

    if [ -f "$PROJECT_DIR/.pids" ]; then
        while read pid; do
            if kill -0 "$pid" 2>/dev/null; then
                kill "$pid" 2>/dev/null
                log_info "已停止进程 $pid"
            fi
        done < "$PROJECT_DIR/.pids"
        rm -f "$PROJECT_DIR/.pids"
    fi

    # 兜底：按端口杀进程
    for port in $DB_PORT $SCRAPER_PORT $FRONTEND_PORT; do
        pid=$(check_port $port)
        if [ "$pid" ]; then
            kill $pid 2>/dev/null
            log_info "已停止端口 $port 上的进程 $pid"
        fi
    done

    echo ""
    log_info "所有服务已停止"
    echo ""
}

show_status() {
    echo ""
    echo -e "${CYAN}服务运行状态:${NC}"
    echo ""
    for port_info in "$DB_PORT:数据库服务" "$SCRAPER_PORT:爬虫服务" "$FRONTEND_PORT:前端服务"; do
        port=${port_info%%:*}
        name=${port_info##*:}
        pid=$(check_port $port)
        if [ "$pid" ]; then
            echo -e "  ${GREEN}●${NC} $name  端口 $port  (PID: $pid)"
        else
            echo -e "  ${RED}○${NC} $name  端口 $port  (未运行)"
        fi
    done
    echo ""
}

case "$1" in
    stop)
        stop_services
        ;;
    status)
        show_status
        ;;
    *)
        start_services
        ;;
esac
