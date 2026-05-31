# Production image: no Tesseract — image OCR deferred to Python extractor (WORKER_DEFER_IMAGE_OCR=true)
FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/worker ./apps/worker
RUN pnpm install --frozen-lockfile
ENV NODE_ENV=production
ENV WORKER_DEFER_IMAGE_OCR=true
CMD ["node", "--import", "tsx", "apps/worker/src/index.ts"]
