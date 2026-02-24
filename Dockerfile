# 构建阶段
FROM node:20-alpine AS builder

# 安装 pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# 复制 package.json 和 lock 文件
COPY package.json pnpm-lock.yaml ./

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY . .

# 构建
RUN pnpm run build

# 运行阶段
FROM node:20-alpine

# 安装 pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# 安装必要工具（用于压缩和加密）
RUN apk add --no-cache tar openssl

WORKDIR /app

# 复制构建产物和必要文件
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/node_modules ./node_modules

# 创建必要目录
RUN mkdir -p /app/backups /app/data /app/config

# 设置环境变量
ENV NODE_ENV=production

# 默认配置文件路径
ENV CONFIG_PATH=/app/config/config.yml
ENV ENV_PATH=/app/config/.env

# 入口
ENTRYPOINT ["node", "dist/cli.mjs"]
CMD ["-c", "/app/config/config.yml", "-e", "/app/config/.env", "-o", "/app/backups"]
