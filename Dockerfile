# ── 阶段 1: 构建前端 ──
FROM node:22-alpine AS builder
WORKDIR /build

RUN npm config set registry https://registry.npmmirror.com

# 安装原生模块编译工具（sqlite3 需要）
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# 清理编译工具（减少 builder 镜像体积，不影响下层）
RUN apk del python3 make g++

# ── 阶段 2: 生产运行环境 ──
FROM node:22-alpine

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories \
    && apk update \
    && apk add --no-cache \
        nginx \
        chromium nss freetype harfbuzz ca-certificates ttf-freefont

# Puppeteer 环境变量
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

ENV npm_config_registry=https://registry.npmmirror.com

WORKDIR /app

# 直接从 builder 复制编译好的 node_modules，无需重新安装
COPY --from=builder /build/node_modules ./node_modules

# 复制应用代码
COPY server/ ./server/
COPY --from=builder /build/dist ./dist/
COPY public/sql-wasm-browser.js public/sql-wasm-browser.wasm ./dist/
COPY nginx.conf /etc/nginx/http.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh

RUN chmod +x /docker-entrypoint.sh && mkdir -p data logs

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q --spider http://localhost:80/ || exit 1

CMD ["/docker-entrypoint.sh"]