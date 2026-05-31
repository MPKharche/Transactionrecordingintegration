# One-shot schema sync for production deploy (drizzle-kit push).
FROM node:22-alpine
WORKDIR /app
COPY package.json drizzle.config.ts ./
COPY src ./src
RUN npm install --no-audit --no-fund drizzle-kit@0.30.1 drizzle-orm@0.38.3 postgres dotenv
CMD ["npx", "drizzle-kit", "push"]
