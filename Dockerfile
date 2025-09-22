# Multi-stage build using Yarn Berry zero-install and compiled runtime

# Build stage
FROM node:20-slim AS builder
WORKDIR /build

# Install dependencies (allow network in build to fetch Linux artifacts if cache misses)
COPY package.json yarn.lock .yarnrc.yml .yarn/ ./
RUN if [ -f .yarn/releases/yarn-4.10.2.cjs ]; then \
      YARN_ENABLE_NETWORK=1 node .yarn/releases/yarn-4.10.2.cjs install --immutable --inline-builds; \
    else \
      export YARN_IGNORE_PATH=1 YARN_ENABLE_NETWORK=1 && corepack enable && corepack prepare yarn@4.10.2 --activate && yarn install --immutable --inline-builds; \
    fi

# Copy source and build
COPY server/ server/
COPY client/ client/
COPY tsconfig*.json ./
COPY vite.config.ts ./
COPY tailwind.config.ts ./
COPY postcss.config.js ./
RUN YARN_IGNORE_PATH=1 yarn run build

# Runtime stage
FROM node:20-slim
WORKDIR /app

# Install production deps (allow network in build to fetch Linux artifacts if cache misses)
COPY package.json yarn.lock .yarnrc.yml .yarn/ ./
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0
RUN if [ -f .yarn/releases/yarn-4.10.2.cjs ]; then \
      YARN_ENABLE_NETWORK=1 node .yarn/releases/yarn-4.10.2.cjs install --production --immutable --inline-builds; \
    else \
      export YARN_IGNORE_PATH=1 YARN_ENABLE_NETWORK=1 && corepack enable && corepack prepare yarn@4.10.2 --activate && yarn install --production --immutable --inline-builds; \
    fi

# Copy compiled artifacts
COPY --from=builder /build/dist-server dist-server/
COPY --from=builder /build/dist dist/

EXPOSE 8080
CMD ["node", "dist-server/server/index.js"]

