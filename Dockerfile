# Multi-stage Dockerfile: build server + client, produce lean runtime image

# Builder: install deps and build server and client
FROM node:20-alpine AS builder
WORKDIR /app

# Install root deps (including dev deps needed to build)
COPY package.json package-lock.json* ./
RUN npm ci --silent

# Copy the rest of the server source
COPY . .

# Build server (TypeScript)
RUN npm run build

# Build client: install client deps and build static assets
WORKDIR /app/client
RUN npm ci --silent
RUN npm run build

# Runtime image: production dependencies + compiled output
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Install only production deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --silent || npm install --production --silent

# Copy compiled server output and public assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Copy built client into server's public folder
COPY --from=builder /app/client/dist ./public/client

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "dist/index.js"]
## Multi-stage Dockerfile for meme-coin-aggregator
# Builder stage: install deps and compile TypeScript
FROM node:20-alpine AS builder
WORKDIR /app

# Install build deps
COPY package.json package-lock.json* ./
RUN npm install --silent

# Copy source and build
COPY . .
RUN npm run build

# Runtime stage: only production dependencies + compiled output
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Install only production deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --silent || npm install --production --silent

# Copy compiled files and static assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "dist/index.js"]
# Use Node.js LTS
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --production

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "dist/index.js"]
