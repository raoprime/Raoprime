FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies first (leverage Docker layer caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application files
COPY . .

# Expose Raoprime default port
EXPOSE 3000

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Run Raoprime ultra-low-latency server
CMD ["node", "server.js"]
