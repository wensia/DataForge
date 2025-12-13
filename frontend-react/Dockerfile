# syntax=docker/dockerfile:1.4
# DataForge Frontend Dockerfile
# 多阶段构建：Node 构建 + Nginx 服务
# 使用 BuildKit 缓存加速构建

# 构建阶段
FROM node:20-alpine AS builder

WORKDIR /app

# 安装 pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# 复制依赖文件
COPY package.json pnpm-lock.yaml ./

# 使用 BuildKit 缓存挂载加速 pnpm 安装
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# 复制源代码
COPY . .

# 设置构建时环境变量
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

# 构建应用
RUN --mount=type=cache,target=/app/node_modules/.cache \
    pnpm build

# 生产阶段 - 使用 Nginx 服务静态文件
FROM nginx:alpine AS production

# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制 Nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 暴露端口
EXPOSE 80

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

# 启动 Nginx
CMD ["nginx", "-g", "daemon off;"]
