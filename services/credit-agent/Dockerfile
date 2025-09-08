FROM node:20-alpine
WORKDIR /app

# Copy service manifests and install deps
COPY services/credit-agent/package.json services/credit-agent/package-lock.json* ./
RUN npm install --silent

# Copy source
COPY services/credit-agent/tsconfig.json ./
COPY services/credit-agent/src ./src

ENV NODE_ENV=production
ENV PORT=8080

CMD ["npm","run","start"]
