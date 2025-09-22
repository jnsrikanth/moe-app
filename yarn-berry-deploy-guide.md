# Yarn Berry Zero-Installs Deployment Guide

This guide explains how to run and deploy this project using Yarn Berry (v4) with zero-installs. Zero-installs means all dependencies are vendored inside the repo under `.yarn/cache`, so installs work offline without hitting public registries.

Branch: `yarn-berry` (contains `.yarn/cache`, `yarn.lock`, and `.yarnrc.yml`)

---

## 1) Prerequisites (Secure Cloud PC / Sandbox)

- Node.js 18+ (Node 20+ recommended; Node 24 works fine)
- Corepack enabled (ships with Node 16.10+)
- Build toolchain for native modules (no network needed, but a compiler is):
  - macOS: Xcode Command Line Tools (`xcode-select --install`)
  - Debian/Ubuntu:
    ```bash
    sudo apt-get update && sudo apt-get install -y build-essential python3 make g++
    ```
  - RHEL/CentOS/Rocky:
    ```bash
    sudo yum groupinstall -y 'Development Tools'
    sudo yum install -y python3
    ```
- Network access is NOT required for installs, but you do need permissions to bind to the service port (default 3000) and write logs to the working directory.

---

## 2) One-time setup per machine

```bash
# Ensure Corepack provisions Yarn from package.json "packageManager"
corepack enable
```

This project specifies `"packageManager": "yarn@4.x"` so Corepack will fetch and pin the correct Yarn version automatically (no need to commit Yarn binaries).

---

## 3) Clone and checkout the Yarn Berry branch

```bash
# Example (replace with your org/repo if different)
git clone https://github.com/jnsrikanth/moe-app.git
cd moe-app
git checkout yarn-berry
```

Verify the cache is present:
```bash
ls -1 .yarn/cache | head -n 5
```

---

## 4) Offline install (zero-installs)

```bash
# Simulate a clean environment
rm -rf node_modules

# Perform an immutable, offline install from the repo cache only
YARN_ENABLE_NETWORK=0 yarn install --immutable
```

- `YARN_ENABLE_NETWORK=0` forbids all network access. If any dependency is missing from `.yarn/cache`, the install fails (by design).
- `--immutable` enforces exact `yarn.lock` usage and prevents lockfile changes.
- With `nodeLinker: node-modules`, Yarn recreates `node_modules` from the cached packages.

---

## 5) Run the dev server (same commands as secure cloud PC)

```bash
# Optionally ensure no old processes are running and ports are free
yarn run kill-dev || true
for p in 3000 3001 3002 3003 3004 3005; do
  lsof -tiTCP:$p -sTCP:LISTEN | xargs -r kill -9 || true
done

# Start server bound to 0.0.0.0 with proxy awareness and file logs
mkdir -p logs
HOST=0.0.0.0 TRUST_PROXY=1 PORT=3000 LOG_FILE=./logs/app-dev.log \
  nohup yarn dev >/tmp/moe-app-dev-launch.out 2>&1 & echo $! > .dev-server.pid

# Health checks
sleep 3
echo "PID=$(cat .dev-server.pid)"
curl -s -o /dev/null -w "Root:   %{http_code} in %{time_total}s\n"   http://127.0.0.1:3000/
curl -s -o /dev/null -w "Health: %{http_code} in %{time_total}s\n"   http://127.0.0.1:3000/health
```

Notes
- Host binding defaults to `0.0.0.0` in development; explicitly setting `HOST=0.0.0.0` ensures external reachability behind proxies.
- `TRUST_PROXY=1` enables proxy awareness (honors `X-Forwarded-*`).
- Logs: application logs go to `./logs/app-dev.log`; launch output is in `/tmp/moe-app-dev-launch.out`.

Stop the server:
```bash
kill "$(cat .dev-server.pid)" 2>/dev/null || yarn run kill-dev
```

---

## 6) Production build and start (optional)

If you need a local production run without Docker:
```bash
# Install (offline)
YARN_ENABLE_NETWORK=0 yarn install --immutable

# Build assets
yarn build

# Start in production
NODE_ENV=production HOST=0.0.0.0 TRUST_PROXY=1 PORT=3000 LOG_FILE=./logs/app-prod.log \
  nohup yarn start >/tmp/moe-app-prod-launch.out 2>&1 & echo $! > .prod-server.pid
```

---

## 7) Docker (optional, for CI/CD or GCP)

When containerizing with zero-installs, COPY the Yarn cache and lockfile into the image and install with `--immutable`:

```Dockerfile
# syntax=docker/dockerfile:1
FROM node:20-slim

# Build toolchain for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential python3 make g++ ca-certificates curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only files needed for install first (better layer caching)
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/cache ./.yarn/cache

# Corepack ensures Yarn v4 is provisioned from packageManager field
RUN corepack enable && \
    YARN_ENABLE_NETWORK=0 yarn install --immutable

# Now copy the rest of the project
COPY . .

# Build and run
RUN yarn build
ENV NODE_ENV=production HOST=0.0.0.0 TRUST_PROXY=1 PORT=3000 \
    LOG_FILE=/var/log/app-prod.log
EXPOSE 3000
CMD ["yarn", "start"]
```

If your image build environment has no network, ensure your repo includes the complete `.yarn/cache` and that native build tools are present inside the image.

---

## 8) Updating dependencies (when needed)

Because installs are offline, you must update dependencies on a machine that has network access, then commit the results:

```bash
# Example: add a dep
yarn add some-package@^1

# Or refresh all (respecting semver ranges) on a networked machine
yarn install --mode=update

# Commit the lockfile and updated cache
git add yarn.lock .yarn/cache
git commit -m "chore(deps): update dependencies"
git push
```

Your secure environment can then pull the branch and continue to install offline with:
```bash
YARN_ENABLE_NETWORK=0 yarn install --immutable
```

---

## 9) Troubleshooting

- Install fails offline: a package may be missing from `.yarn/cache` or `yarn.lock` is out-of-sync. Do a connected `yarn install` on a networked machine, commit `yarn.lock` and the refreshed `.yarn/cache`, then retry offline.
- Native builds fail: ensure toolchain is installed (see Prerequisites). For Python path issues, try `PYTHON=python3 yarn install`.
- Port in use: free it before starting.
  ```bash
  for p in 3000 3001 3002 3003 3004 3005; do
    lsof -tiTCP:$p -sTCP:LISTEN | xargs -r kill -9 || true
  done
  ```
- Logs: check `./logs/app-dev.log` (and `/tmp/moe-app-dev-launch.out`).

---

## 10) Quick reference (copy/paste)

```bash
# One-time per machine
corepack enable

# Clean + offline install
rm -rf node_modules
YARN_ENABLE_NETWORK=0 yarn install --immutable

# Start dev (background)
mkdir -p logs
HOST=0.0.0.0 TRUST_PROXY=1 PORT=3000 LOG_FILE=./logs/app-dev.log \
  nohup yarn dev >/tmp/moe-app-dev-launch.out 2>&1 & echo $! > .dev-server.pid

# Health checks
sleep 3
curl -s -o /dev/null -w "Root:   %{http_code} in %{time_total}s\n"   http://127.0.0.1:3000/
curl -s -o /dev/null -w "Health: %{http_code} in %{time_total}s\n" http://127.0.0.1:3000/health

# Stop
kill "$(cat .dev-server.pid)" 2>/dev/null || yarn run kill-dev
```

---

Tips
- Keep `.yarn/cache` and `yarn.lock` committed for deterministic, offline installs.
- Avoid committing `node_modules`.
- Use `HOST=0.0.0.0` and `TRUST_PROXY=1` when behind proxies.
- For GCP or other Dockerized deployments, ensure the image contains build tools required by native modules if you see compile-time errors.
