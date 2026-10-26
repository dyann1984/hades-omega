FROM node:22-alpine AS base
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

# Copy manifests
COPY package.json pnpm-workspace.yaml ./
COPY packages/api/package.json ./packages/api/

# Install deps (production only for api)
RUN pnpm --filter @hades/api install --frozen-lockfile

# Copy source
COPY packages/api ./packages/api/

# Create data directory for SQLite
RUN mkdir -p /data

# Runtime environment
ENV NODE_ENV=production
ENV API_PORT=3001
ENV DB_PATH=/data/hades.db
ENV NEAR_EXECUTION_MODE=simulation
ENV NEAR_NETWORK=testnet
ENV NEAR_ACCOUNT_ID=hades-omega.testnet
ENV NEAR_CONTRACT_ID=audit.hades-omega.testnet

EXPOSE 3001

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "--import", "tsx/esm", "packages/api/src/server.ts"]
