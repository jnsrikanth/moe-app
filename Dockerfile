# Multi-stage build using Yarn Berry zero-install and compiled runtime

# Build stage
FROM node:20-slim AS builder
WORKDIR /build

# Install dependencies offline from vendored Yarn cache
COPY package.json yarn.lock .yarnrc.yml .yarn/ ./
ENV YARN_ENABLE_NETWORK=0
RUN if [ -f .yarn/releases/yarn-4.10.2.cjs ]; then \
      node .yarn/releases/yarn-4.10.2.cjs install --immutable --inline-builds; \
    else \
      export YARN_IGNORE_PATH=1 && corepack enable && corepack prepare yarn@4.10.2 --activate && yarn install --immutable --inline-builds; \
    fi

# Copy source and build
COPY server/ server/
COPY client/ client/
COPY tsconfig*.json ./
RUN node .yarn/releases/yarn-4.10.2.cjs run build

# Runtime stage
FROM node:20-slim
WORKDIR /app

# Install production deps offline
COPY package.json yarn.lock .yarnrc.yml .yarn/ ./
ENV YARN_ENABLE_NETWORK=0 NODE_ENV=production PORT=8080 HOST=0.0.0.0
RUN if [ -f .yarn/releases/yarn-4.10.2.cjs ]; then \
      node .yarn/releases/yarn-4.10.2.cjs install --production --immutable --inline-builds; \
    else \
      export YARN_IGNORE_PATH=1 && corepack enable && corepack prepare yarn@4.10.2 --activate && yarn install --production --immutable --inline-builds; \
    fi

# Copy compiled artifacts
COPY --from=builder /build/dist-server dist-server/
COPY --from=builder /build/dist dist/

EXPOSE 8080
CMD ["node", "dist-server/server/index.js"]

