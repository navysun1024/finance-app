#!/bin/sh
set -e

echo "[INFO] 启动个人理财统计系统..."

# 1. 启动数据库服务 (端口 3002)
echo "[INFO] 启动数据库服务..."
node /app/server/db-server.js &
DB_PID=$!

# 2. 启动爬虫服务 (端口 3001)
echo "[INFO] 启动爬虫服务..."
node /app/server/scraper.mjs &
SCRAPER_PID=$!

# 等待后端服务就绪
echo "[INFO] 等待服务就绪..."
sleep 3

# 3. 启动 Nginx (端口 80，对外统一入口)
echo "[INFO] 启动 Nginx..."
nginx -g 'daemon off;' &
NGINX_PID=$!

echo "[INFO] 所有服务已启动"
echo "[INFO]   Nginx     PID: $NGINX_PID (端口 80)"
echo "[INFO]   DB-Server PID: $DB_PID (端口 3002)"
echo "[INFO]   Scraper   PID: $SCRAPER_PID (端口 3001)"

# 信号处理：优雅关闭
trap "echo '[INFO] 正在关闭...'; kill $DB_PID $SCRAPER_PID $NGINX_PID 2>/dev/null; exit 0" SIGTERM SIGINT

# 保持前台运行，等待任一子进程退出
wait
