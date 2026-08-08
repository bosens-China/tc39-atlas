# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV CI=true
RUN corepack enable
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/mcp/package.json apps/mcp/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM dependencies AS build
COPY tsconfig.base.json ./
COPY apps/mcp apps/mcp
COPY packages/core packages/core
RUN pnpm --filter @tc39-atlas/mcp deploy --prod --legacy /prod/mcp

FROM dependencies AS web-build
COPY tsconfig.base.json ./
COPY apps/mcp apps/mcp
COPY apps/web apps/web
COPY packages/core packages/core
RUN pnpm --filter web build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=43127
ENV ALLOWED_HOSTS=localhost,127.0.0.1
WORKDIR /app
COPY --from=build --chown=node:node /prod/mcp ./
USER node
EXPOSE 43127
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:43127/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["sh", "-c", "./node_modules/.bin/tsx node_modules/@tc39-atlas/core/src/migrate-cli.ts && ./node_modules/.bin/tsx src/index.ts"]

FROM nginx:1.29-alpine AS web-runtime
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
