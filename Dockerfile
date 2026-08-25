# syntax=docker/dockerfile:1.4
# ── 可配置镜像源（默认国内镜像） ──
ARG ALPINE_MIRROR=mirrors.ustc.edu.cn
ARG NPM_REGISTRY=https://registry.npmmirror.com

# ── 阶段 1: 前端构建层 ──
FROM node:22-alpine AS builder
ARG ALPINE_MIRROR
ARG NPM_REGISTRY
WORKDIR /build

# 替换 Alpine 镜像源，安装编译工具（sqlite3 在 musl 上需从源码编译）
RUN sed -i "s/dl-cdn.alpinelinux.org/${ALPINE_MIRROR}/g" /etc/apk/repositories \
    && apk add --no-cache python3 make g++

# 配置 npm 镜像 + 构建环境变量
ENV npm_config_registry=${NPM_REGISTRY} \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    NODE_OPTIONS="--max-old-space-size=2048"

# 【缓存优化】先拷贝依赖锁文件，利用 BuildKit --link 加速缓存命中
COPY --link package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefer-offline

# 拷贝业务源码（--link 使源码变更不影响上层缓存层）
COPY --link . .

# 分步构建：低内存机器合并执行 vue-tsc && vite build 容易 SIGSEGV
RUN node --max-old-space-size=1536 ./node_modules/vue-tsc/bin/vue-tsc.js --noEmit
RUN node --max-old-space-size=2560 ./node_modules/vite/bin/vite.js build

# 清理开发依赖，大幅减少镜像体积
RUN npm prune --production

# ── 阶段 2: 生产运行层 ──
FROM node:22-alpine
ARG ALPINE_MIRROR
ARG NPM_REGISTRY
WORKDIR /app

# 镜像标签
LABEL org.opencontainers.image.title="personal-finance-app" \
      org.opencontainers.image.description="个人理财收益率统计Web应用" \
      org.opencontainers.image.version="1.4.8" \
      org.opencontainers.image.source="https://github.com/haijun/finance-app"

# 生产层换源 + 一次性安装运行时依赖
RUN sed -i "s/dl-cdn.alpinelinux.org/${ALPINE_MIRROR}/g" /etc/apk/repositories \
    && apk add --no-cache \
        nginx \
        curl \
        chromium \
        nss \
        freetype \
        harfbuzz \
        ca-certificates \
        ttf-freefont

# Puppeteer + Node 环境变量
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    npm_config_registry=${NPM_REGISTRY} \
    NODE_OPTIONS="--max-old-space-size=1024"

# 使用 --link 复制，构建层 cache miss 不影响这些层
COPY --link --from=builder /build/node_modules ./node_modules
COPY --link --from=builder /build/dist ./dist
COPY --link server/ ./server/
COPY --link public/sql-wasm-browser.js public/sql-wasm-browser.wasm ./dist/
COPY --link nginx.conf /etc/nginx/http.d/default.conf
COPY --link docker-entrypoint.sh /docker-entrypoint.sh

# 权限、目录创建合并为单条 RUN
RUN chmod +x /docker-entrypoint.sh \
    && mkdir -p data logs

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost:80/ || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]