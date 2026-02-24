# Stage 1: Base (Node.js + pnpm)
FROM caomeiyouren/alpine-nodejs:latest AS nodejs

# Stage 2: Builder
FROM nodejs AS builder

WORKDIR /app

# 复制依赖配置并安装全部依赖（便于分析）
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# 执行构建
RUN pnpm run build

# Stage 3: Minifier (精简依赖)
FROM builder AS minifier

WORKDIR /app

# 运行精简脚本，生成 app-minimal 目录
RUN export PROJECT_ROOT=/app/ && \
    node scripts/minify-docker.mjs

# Stage 4: Production Runtime (正式运行环境)
FROM caomeiyouren/alpine-nodejs-minimize:latest AS runtime

# 安装必要工具 (用于打包备份文件以及设置时区)
RUN apk update && apk add --no-cache tar openssl tzdata

WORKDIR /app
ENV NODE_ENV production
ENV TZ Asia/Shanghai

# 从 minifier 复制精简后的 node_modules，从 builder 复制构建结果
COPY --from=minifier /app/app-minimal/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# 确保必要的挂载点存在
RUN mkdir -p /app/backups /app/data /app/config

# 默认设置配置路径
ENV CONFIG_PATH=/app/config/config.yml
ENV ENV_PATH=/app/config/.env

# 指定启动程序入口
ENTRYPOINT ["node", "dist/cli.mjs"]
CMD ["-c", "/app/config/config.yml", "-e", "/app/config/.env", "-o", "/app/backups"]
