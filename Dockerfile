# Stage 1: Build Client
FROM node:20-alpine AS client-builder

WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

# Stage 2: Build Server
FROM node:20-alpine AS server-builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src

RUN npm ci
RUN npm run build

# Stage 3: Production
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm pkg delete scripts.postinstall
RUN npm ci --only=production

# Copy server build
COPY --from=server-builder /app/dist ./dist

# Copy client build to public
COPY --from=client-builder /app/client/dist ./public

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

ENV PORT=3000
EXPOSE $PORT

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "const port=process.env.PORT||3000;require('http').get(\`http://localhost:\${port}/health\`,(r)=>{process.exit(r.statusCode===200?0:1);})"

CMD ["node", "dist/index.js"]