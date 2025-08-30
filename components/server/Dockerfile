# Use Node 22.18+ for native TypeScript support
FROM node:22.18-alpine

# Enable corepack to use pnpm
RUN corepack enable

# Set working directory
WORKDIR /app

# Install dependencies for native compilation if needed
RUN apk add --no-cache python3 make g++

# Copy workspace and package files
COPY ../../package.json ../../pnpm-lock.yaml ./
COPY package.json ./

# Install dependencies using pnpm
RUN pnpm install --frozen-lockfile --prod

# Copy source code (using native TypeScript execution)
COPY src/ ./src/
COPY tsconfig.json ./

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcp -u 1001 -G nodejs

# Change ownership of the app directory
RUN chown -R mcp:nodejs /app
USER mcp

# Expose port
EXPOSE 3000

# Start the server using native TypeScript support
CMD ["node", "src/http-server.ts"]
