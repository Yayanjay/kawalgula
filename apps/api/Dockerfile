FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/prisma/package.json ./packages/prisma/
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# Use the committed dependency graph; .npmrc above makes @prisma/client available
# at the root for Prisma's default generator output resolution.
RUN pnpm install --frozen-lockfile

# Fail if @prisma/client was not hoisted (should be with node-linker=hoisted in .npmrc)
RUN test -f node_modules/@prisma/client/package.json

COPY packages/prisma ./packages/prisma
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY apps/web ./apps/web

RUN pnpm --filter @kawalgula/shared build
RUN pnpm --filter @kawalgula/prisma generate
RUN pnpm --filter @kawalgula/api build
RUN pnpm --filter @kawalgula/web build

FROM node:20-alpine AS runtime

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10 --activate

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./node_modules/@kawalgula/shared/dist
COPY --from=builder /app/packages/shared/package.json ./node_modules/@kawalgula/shared/package.json
COPY --from=builder /app/packages/prisma ./packages/prisma
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/entrypoint.sh ./apps/api/entrypoint.sh
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY --from=builder /app/pnpm-workspace.yaml .
COPY --from=builder /app/package.json .
COPY --from=builder /app/pnpm-lock.yaml .

RUN chmod +x apps/api/entrypoint.sh && mkdir -p /app/uploads

EXPOSE 3000

ENTRYPOINT ["apps/api/entrypoint.sh"]
