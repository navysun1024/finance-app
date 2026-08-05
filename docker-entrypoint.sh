#!/bin/sh
set -e -o pipefail

echo "[INFO] 启动个人理财统计系统..."

# 启动数据库服务（端口 3002）
echo "[INFO] 启动数据库服务..."
node /app/server/db-server.js > /app/logs/db-server.stdout.log 2> /app/logs/db-server.stderr.log &
DB_PID=$!

# 启动爬虫服务（端口 3001）
echo "[INFO] 启动爬虫服务..."
node /app/server/scraper.mjs > /app/logs/scraper.stdout.log 2> /app/logs/scraper.stderr.log &
SCRAPER_PID=$!

# 等待后端服务就绪（最多 30 秒）
echo "[INFO] 等待数据库服务就绪..."
for i in $(seq 1 30); do
    if wget -q -O - http://127.0.0.1:3002/health > /dev/null 2>&1; then
        echo "[INFO] 数据库服务已就绪 (${i}s)"
        break
    fi
    if ! kill -0 $DB_PID 2>/dev/null; then
        echo "[ERROR] 数据库服务启动失败！"
        echo "------ stderr ------"
        cat /app/logs/db-server.stderr.log
        echo "------ stdout ------"
        cat /app/logs/db-server.stdout.log
        exit 1
    fi
    sleep 1
done

# 启动 Nginx（端口 80，对外统一入口）
echo "[INFO] 启动 Nginx..."
nginx -g 'daemon off;' &
NGINX_PID=$!

echo "[INFO] 所有服务已启动"
echo "[INFO]   Nginx      PID: $NGINX_PID  (端口 80)"
echo "[INFO]   DB-Server  PID: $DB_PID    (端口 3002)"
echo "[INFO]   Scraper    PID: $SCRAPER_PID (端口 3001)"

# 信号处理：优雅关闭所有子进程
cleanup() {
    echo "[INFO] 收到关闭信号，正在停止所有服务..."
    kill $DB_PID $SCRAPER_PID $NGINX_PID 2>/dev/null
    wait $DB_PID $SCRAPER_PID $NGINX_PID 2>/dev/null
    echo "[INFO] 所有服务已停止"
    exit 0
}
trap cleanup SIGTERM SIGINT SIGQUIT

# 保持前台运行，等待任一子进程退出
wait