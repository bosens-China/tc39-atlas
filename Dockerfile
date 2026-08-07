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
COPY packages/core/package.json packages/core/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM dependencies AS build
COPY tsconfig.base.json ./
COPY apps/mcp apps/mcp
COPY packages/core packages/core
RUN pnpm build && pnpm --filter @tc39-atlas/mcp deploy --prod --legacy /prod/mcp

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
CMD ["sh", "-c", "node node_modules/@tc39-atlas/core/dist/migrate-cli.js && node dist/index.js"]
