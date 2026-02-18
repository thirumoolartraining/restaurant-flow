# Multi-stage Dockerfile for Restaurant WhatsApp Bot Backend
# Production-ready with security hardening

# Stage 1: Dependencies
FROM node:20-alpine AS dependencies
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Stage 2: Production
FROM node:20-alpine AS production

# Install dumb-init for proper PID 1 signal handling
RUN apk add --no-cache dumb-init

# Set NODE_ENV
ENV NODE_ENV=production

# Create app directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy dependencies from dependencies stage
COPY --from=dependencies --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy only application code (not test files, docs, etc.)
COPY --chown=nodejs:nodejs package*.json ./
COPY --chown=nodejs:nodejs server.js ./
COPY --chown=nodejs:nodejs swagger.js ./
COPY --chown=nodejs:nodejs config/ ./config/
COPY --chown=nodejs:nodejs middleware/ ./middleware/
COPY --chown=nodejs:nodejs models/ ./models/
COPY --chown=nodejs:nodejs routes/ ./routes/
COPY --chown=nodejs:nodejs services/ ./services/
COPY --chown=nodejs:nodejs migrations/ ./migrations/
COPY --chown=nodejs:nodejs scripts/ ./scripts/

# Create logs and uploads directories
RUN mkdir -p logs uploads && chown nodejs:nodejs logs uploads

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init as PID 1
ENTRYPOINT ["dumb-init", "--"]

# Start server
CMD ["node", "server.js"]
