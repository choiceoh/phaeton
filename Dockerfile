FROM node:22-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN node --experimental-strip-types --no-warnings ./node_modules/payload/bin.js --disable-transpile generate:types \
    && node --experimental-strip-types --no-warnings ./node_modules/payload/bin.js --disable-transpile migrate:create \
    && sed -i "s/import { MigrateUpArgs, MigrateDownArgs, sql }/import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms\/db-postgres'\nimport { sql }/" src/migrations/*.ts \
    && npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/payload.config.ts ./
COPY --from=builder /app/payload-types.ts ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/src ./src
COPY --from=builder /app/docker-entrypoint.sh ./
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
