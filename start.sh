#!/bin/bash

# 一键启动个人理财统计系统所有服务
# 用法: ./start.sh          启动所有服务
#       ./start.sh stop     停止所有服务
#       ./start.sh restart  重启所有服务
#       ./start.sh status   查看服务状态

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

DB_PORT=3002
SCRAPER_PORT=3001
FRONTEND_PORT=5173


DB_PID_FILE="$PROJECT_DIR/.db-server.pid"
SCRAPER_PID_FILE="$PROJECT_DIR/.scraper.pid"
VITE_PID_FILE="$PROJECT_DIR/.vite.pid"

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

check_process_alive() {
    local pid=$1
    kill -0 "$pid" 2>/dev/null
}

check_process_listening() {
    local pid=$1 port=$2
    lsof -i :$port -sTCP:LISTEN -t 2>/dev/null | grep -q "^$pid$"
}

clean_stale_pid() {
    local pid_file=$1 port=$2
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if ! check_process_alive "$pid" || ! check_process_listening "$pid" "$port"; then
            log_warn "发现僵死进程记录 PID: $pid，清理..."
            rm -f "$pid_file"
        fi
    fi
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

stop_process_by_pattern() {
    local pattern=$1 name=$2
    local pids=$(pgrep -f "$pattern" 2>/dev/null)
    if [ -n "$pids" ]; then
        for pid in $pids; do
            if kill -0 "$pid" 2>/dev/null; then
                kill "$pid" 2>/dev/null
                log_info "已停止 $name 进程 $pid"
                sleep 0.5
                if kill -0 "$pid" 2>/dev/null; then
                    kill -9 "$pid" 2>/dev/null
                    log_warn "强制终止 $name 进程 $pid"
                fi
            fi
        done
    fi
}

stop_services() {
    echo ""
    log_info "正在停止所有服务..."

    stop_process_by_pattern "node server/db-server.js" "数据库服务"
    stop_process_by_pattern "node server/scraper.mjs" "爬虫服务"
    stop_process_by_pattern "npx vite" "前端服务"

    rm -f "$DB_PID_FILE" "$SCRAPER_PID_FILE" "$VITE_PID_FILE"

    echo ""
    log_info "所有服务已停止"
    echo ""
}

start_services() {
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}  个人理财统计系统 - 一键启动${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""

    # 1. 数据库服务
    clean_stale_pid "$DB_PID_FILE" "$DB_PORT"
    if [ -f "$DB_PID_FILE" ]; then
        local pid=$(cat "$DB_PID_FILE")
        log_info "数据库服务已在运行 (端口 $DB_PORT, PID: $pid)"
    elif [ "$(check_port $DB_PORT)" ]; then
        local pid=$(check_port $DB_PORT)
        echo "$pid" > "$DB_PID_FILE"
        log_info "数据库服务已在运行 (端口 $DB_PORT, PID: $pid)"
    else
        log_info "启动数据库服务 (端口 $DB_PORT)..."
        nohup node server/db-server.js > /dev/null 2>&1 &
        echo $! > "$DB_PID_FILE"
    fi

    # 2. 爬虫服务
    clean_stale_pid "$SCRAPER_PID_FILE" "$SCRAPER_PORT"
    if [ -f "$SCRAPER_PID_FILE" ]; then
        local pid=$(cat "$SCRAPER_PID_FILE")
        log_info "爬虫服务已在运行 (端口 $SCRAPER_PORT, PID: $pid)"
    elif [ "$(check_port $SCRAPER_PORT)" ]; then
        local pid=$(check_port $SCRAPER_PORT)
        echo "$pid" > "$SCRAPER_PID_FILE"
        log_info "爬虫服务已在运行 (端口 $SCRAPER_PORT, PID: $pid)"
    else
        log_info "启动爬虫服务 (端口 $SCRAPER_PORT)..."
        nohup node server/scraper.mjs > /dev/null 2>&1 &
        echo $! > "$SCRAPER_PID_FILE"
    fi

    # 3. 前端服务
    clean_stale_pid "$VITE_PID_FILE" "$FRONTEND_PORT"
    if [ -f "$VITE_PID_FILE" ]; then
        local pid=$(cat "$VITE_PID_FILE")
        log_info "前端服务已在运行 (端口 $FRONTEND_PORT, PID: $pid)"
    elif [ "$(check_port $FRONTEND_PORT)" ]; then
        local pid=$(check_port $FRONTEND_PORT)
        echo "$pid" > "$VITE_PID_FILE"
        log_info "前端服务已在运行 (端口 $FRONTEND_PORT, PID: $pid)"
    else
        log_info "启动前端开发服务 (端口 $FRONTEND_PORT)..."
        nohup npx vite --port $FRONTEND_PORT > /dev/null 2>&1 &
        echo $! > "$VITE_PID_FILE"
    fi

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
    echo -e "  重启服务:    ${YELLOW}./start.sh restart${NC}"
    echo -e "  查看状态:    ${YELLOW}./start.sh status${NC}"
    echo ""
}

show_status() {
    echo ""
    echo -e "${CYAN}服务运行状态:${NC}"
    echo ""

    local db_pid=$(check_port $DB_PORT)
    local scraper_pid=$(check_port $SCRAPER_PORT)
    local vite_pid=$(check_port $FRONTEND_PORT)

    if [ "$db_pid" ]; then
        echo -e "  ${GREEN}●${NC} 数据库服务  端口 $DB_PORT  (PID: $db_pid)"
    else
        echo -e "  ${RED}○${NC} 数据库服务  端口 $DB_PORT  (未运行)"
    fi

    if [ "$scraper_pid" ]; then
        echo -e "  ${GREEN}●${NC} 爬虫服务    端口 $SCRAPER_PORT  (PID: $scraper_pid)"
    else
        echo -e "  ${RED}○${NC} 爬虫服务    端口 $SCRAPER_PORT  (未运行)"
    fi

    if [ "$vite_pid" ]; then
        echo -e "  ${GREEN}●${NC} 前端服务    端口 $FRONTEND_PORT  (PID: $vite_pid)"
    else
        echo -e "  ${RED}○${NC} 前端服务    端口 $FRONTEND_PORT  (未运行)"
    fi

    echo ""
}

restart_services() {
    stop_services
    sleep 1
    start_services
}

case "$1" in
    stop)
        stop_services
        ;;
    restart)
        restart_services
        ;;
    status)
        show_status
        ;;
    *)
        start_services
        ;;
esac
