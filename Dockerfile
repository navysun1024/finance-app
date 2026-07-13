# syntax=docker/dockerfile:1
# ── 阶段 1: 前端构建层 ──
FROM node:22-alpine AS builder
WORKDIR /build

# 替换中科大alpine源，安装编译工具（sqlite3在alpine/musl上需从源码编译）
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories \
    && apk add --no-cache python3 make g++

# 配置npm国内镜像
ENV npm_config_registry=https://registry.npmmirror.com
# 构建层不需要 Chromium，跳过 puppeteer 自动下载（节省数分钟）
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# 【缓存优化】先拷贝依赖文件，代码变更不会触发npm ci重跑
COPY package.json package-lock.json ./
# 使用 BuildKit 缓存 npm 缓存目录 + prefer-offline 优先使用缓存
RUN --mount=type=cache,target=/root/.npm npm ci --prefer-offline

# 再拷贝业务源码编译
COPY . .
RUN npm run build

# 【关键优化】清理开发依赖，只保留生产依赖，大幅减少镜像体积和复制时间
RUN npm prune --production

# ── 阶段 2: 生产运行层 ──
FROM node:22-alpine
WORKDIR /app

# 生产层换中科大源 + 一次性安装所有依赖
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories \
    && apk add --no-cache \
        nginx \
        chromium nss freetype harfbuzz ca-certificates ttf-freefont

# Puppeteer 环境变量
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV npm_config_registry=https://registry.npmmirror.com

# 统一复制，减少镜像分层
# 从构建层复制依赖、编译产物
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/dist ./dist
# 本地文件复制
COPY server/ ./server/
COPY public/sql-wasm-browser.js public/sql-wasm-browser.wasm ./dist/
COPY nginx.conf /etc/nginx/http.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh

# 权限、目录创建合并单条RUN
RUN chmod +x /docker-entrypoint.sh \
    && mkdir -p data logs

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -q --spider http://localhost:80/ || exit 1

CMD ["/docker-entrypoint.sh"]