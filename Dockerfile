# ── 阶段 1: 前端构建层（提前换Alpine国内源，解决apk安装编译工具巨慢） ──
FROM node:22-alpine AS builder
WORKDIR /build

# 【关键优化1】FROM后立刻替换阿里云alpine源，合并update+安装编译工具，只一次网络请求
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories \
    && apk add --no-cache python3 make g++

# 配置npm国内镜像，提前放上层，缓存永久生效
ENV npm_config_registry=https://registry.npmmirror.com

# 【缓存优化】先拷贝依赖文件，代码变更不会触发npm ci重跑
COPY package.json package-lock.json ./
RUN npm ci

# 再拷贝业务源码编译
COPY . .
RUN npm run build

# 多阶段构建，builder层工具不会流入生产镜像，apk del 纯浪费构建时间，直接删除此行
# RUN apk del python3 make g++

# ── 阶段 2: 生产运行层 ──
FROM node:22-alpine
WORKDIR /app

# 【关键优化2】生产层换源 + 一次性安装所有依赖，去掉多余 apk update
# apk --no-cache 安装时自动拉取索引并丢弃，无需单独执行 apk update
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories \
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