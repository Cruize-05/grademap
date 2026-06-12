# GradeMap API gateway — built from the repo root as Docker context:
#   docker build -f apps/api/Dockerfile .
# On Railway: set "Dockerfile Path" = apps/api/Dockerfile (root directory = repo root).

# Node 22: @supabase/supabase-js >= 2.10x requires a native WebSocket global
# at client construction; Node 20 lacks it and crashes on startup.
FROM node:22-alpine AS builder
WORKDIR /app
# Pin pnpm 9 — matches lockfileVersion 9.0 and runs dependency scripts without
# the approve-builds gate introduced in pnpm 10.
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
# --ignore-scripts: skips the husky "prepare" hook (no git inside the image)
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN pnpm --filter @grademap/api build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
# Recreate the pnpm workspace layout with production deps only, so module
# resolution works exactly as pnpm intends (a bare COPY of node_modules breaks
# the workspace symlink structure).
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --prod --frozen-lockfile --ignore-scripts
COPY --from=builder /app/apps/api/dist ./apps/api/dist
# Migrations are run from the deployed image (release step / one-off shell)
COPY db ./db

WORKDIR /app/apps/api
EXPOSE 4000
# Railway injects PORT; src/index.ts reads it (defaults to 4000)
CMD ["node", "dist/index.js"]
