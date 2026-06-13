# ── 阶段 1: 构建前端 ──
FROM node:22-alpine AS builder
WORKDIR /build

# 使用国内 npm 镜像加速
RUN npm config set registry https://registry.npmmirror.com

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# ── 阶段 2: 生产环境（Node + Nginx） ──
FROM node:22-alpine

# 安装 Nginx、Chromium（Puppeteer 爬虫需要）、sqlite3 编译工具
RUN apk add --no-cache \
    nginx \
    chromium nss freetype harfbuzz ca-certificates ttf-freefont \
    python3 make g++ \
    && rm -rf /var/cache/apk/*

# Puppeteer 使用系统 Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
# Puppeteer 在容器中需要 --no-sandbox
ENV PUPPETEER_ARGS='--no-sandbox --disable-setuid-sandbox'

WORKDIR /app

# 使用国内 npm 镜像 + sqlite3 预编译二进制镜像
RUN npm config set registry https://registry.npmmirror.com
ENV npm_config_sqlite3_binary_host_mirror=https://npmmirror.com/mirrors/sqlite3

# 安装生产依赖（需要编译 sqlite3 原生模块）
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 复制服务端代码
COPY server/ ./server/

# 复制构建产物
COPY --from=builder /build/dist ./dist/

# 复制 public 中的 wasm 文件（前端需要）
COPY public/sql-wasm-browser.js public/sql-wasm-browser.wasm ./dist/

# 复制 Nginx 配置
COPY nginx.conf /etc/nginx/http.d/default.conf

# 创建数据和日志目录
RUN mkdir -p data logs

# 复制启动脚本
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# 清理编译工具（减小镜像体积）
RUN apk del python3 make g++

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q --spider http://localhost:80/ || exit 1

CMD ["/docker-entrypoint.sh"]
