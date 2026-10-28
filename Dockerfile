# ============================================
# AICTE FlowGuard — Production Dockerfile
# Multi-stage lightweight Node.js 22+ image
# ============================================

FROM node:22-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=5500

# Copy package and server source files
COPY package.json ./
COPY server.js ./
COPY server/ ./server/
COPY css/ ./css/
COPY js/ ./js/
COPY index.html ./
COPY README.md ./

# Create data and uploads directories with permissions
RUN mkdir -p /app/data /app/uploads && chown -R node:node /app

# Switch to non-root user for security
USER node

# Health check against built-in API health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5500/api/health || exit 1

EXPOSE 5500

CMD ["node", "server.js"]
