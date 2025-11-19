# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/client

COPY client/package*.json ./

# Install dependencies with proper optional dependencies handling
RUN npm install --no-optional && \
    npm install --save-optional @rollup/rollup-linux-x64-musl

COPY client/ ./

# Override build output to dist directory for Docker build
RUN npx vite build --outDir dist

# Stage 2: Build Backend
FROM node:20-alpine AS backend-builder

WORKDIR /app

# Copy package files and source
COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src

# Install dependencies (postinstall will build)
RUN npm ci

# Stage 3: Production (Backend + Frontend)
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Remove postinstall script
RUN npm pkg delete scripts.postinstall

# Install production dependencies only
RUN npm ci --only=production

# Copy backend build
COPY --from=backend-builder /app/dist ./dist

# Copy frontend build to public directory
COPY --from=frontend-builder /app/client/dist ./public

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

ENV NODE_ENV=production

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "const port=process.env.PORT||8080;require('http').get(\`http://localhost:\${port}/health\`,(r)=>{process.exit(r.statusCode===200?0:1);})"

CMD ["node", "dist/index.js"]