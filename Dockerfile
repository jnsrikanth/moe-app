# Use Node 20 for compatibility with tsx and modern libs
FROM node:20-alpine AS base
WORKDIR /app

# Install OS deps if needed (curl for health checks)
RUN apk add --no-cache bash curl

# Copy package manifests and install deps
COPY package*.json ./
RUN npm install --silent

# Copy source and build frontend
COPY . .
RUN npm run build --silent

# Expose port (Cloud Run expects 8080 by default)
ENV PORT=8080
ENV NODE_ENV=production

# Start the server (tsx runs TS directly)
CMD ["npm", "run", "start"]

