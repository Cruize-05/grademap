# GradeMap web SPA — built from the repo root as Docker context:
#   docker build -f apps/web/Dockerfile .
# On Railway: set "Dockerfile Path" = apps/web/Dockerfile.
#
# VITE_* variables are baked in at BUILD time. On Railway, service variables
# are exposed to Dockerfile builds as build args automatically when declared
# with ARG below — set them on the service before the first build.

FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/
# --ignore-scripts skips the husky "prepare" hook; esbuild/rollup ship
# platform binaries as optional deps, so no postinstall scripts are needed.
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
ARG VITE_API_BASE_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN pnpm --filter @grademap/web build

FROM nginx:alpine AS runner
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
# The nginx image's entrypoint runs envsubst on templates/*.template,
# writing /etc/nginx/conf.d/default.conf with ${PORT} substituted.
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
ENV PORT=80
EXPOSE 80
