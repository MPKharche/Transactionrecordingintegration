FROM node:22-alpine
RUN apk add --no-cache wget
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile
WORKDIR /app/apps/api
ENV NODE_ENV=production
EXPOSE 4000
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
