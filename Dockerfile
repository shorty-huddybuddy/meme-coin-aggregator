# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy everything needed for build
COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src

# Install all dependencies (including dev dependencies)
RUN npm ci

# Build TypeScript
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Remove postinstall script temporarily to avoid build in production stage
RUN npm pkg delete scripts.postinstall

# Install production dependencies only (no build needed)
RUN npm ci --only=production

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Copy public files
COPY public ./public

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); })"

CMD ["node", "dist/index.js"]