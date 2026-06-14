# ── 阶段 1: 构建前端 ──
FROM node:22-alpine AS builder
WORKDIR /build

RUN npm config set registry https://registry.npmmirror.com

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# ── 阶段 2: 生产环境（Node + Nginx + Puppeteer） ──
FROM node:22-alpine

# 1. 优先替换alpine国内源 + 一次性安装所有系统依赖，单层执行可缓存
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories \
    && apk update \
    && apk add --no-cache \
        nginx \
        chromium nss freetype harfbuzz ca-certificates ttf-freefont \
        python3 make g++ \
    # 编译完原生模块后立刻卸载编译工具，同层不新增镜像层
    && apk del python3 make g++

# Puppeteer 环境变量
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_ARGS='--no-sandbox --disable-setuid-sandbox'

# npm 全局镜像 + sqlite3 二进制镜像，提前声明
ENV npm_config_registry=https://registry.npmmirror.com
ENV npm_config_sqlite3_binary_host_mirror=https://npmmirror.com/mirrors/sqlite3

WORKDIR /app

# 只复制依赖文件，安装生产依赖；代码改动不会触发重装npm包
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 后续复制代码、静态资源、配置，代码变更不会重新跑apk安装
COPY server/ ./server/
COPY --from=builder /build/dist ./dist/
COPY public/sql-wasm-browser.js public/sql-wasm-browser.wasm ./dist/

COPY nginx.conf /etc/nginx/http.d/default.conf

RUN mkdir -p data logs

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q --spider http://localhost:80/ || exit 1

CMD ["/docker-entrypoint.sh"]