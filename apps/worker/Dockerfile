# Production image: no Tesseract — image OCR deferred to Python extractor (WORKER_DEFER_IMAGE_OCR=true)
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/db/package.json ./packages/db/
COPY packages/zoho-schema/package.json ./packages/zoho-schema/
COPY packages/config/package.json ./packages/config/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV WORKER_DEFER_IMAGE_OCR=true
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules || true
COPY . .
CMD ["node", "--loader", "tsx/esm", "apps/worker/src/index.ts"]
