# Use official Node 20 image
FROM node:24-slim

# Set working directory
WORKDIR /app

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Install dependencies first (for caching)
COPY package*.json ./
RUN npm ci --production

# Copy the rest of the source code
COPY . .

ENTRYPOINT ["/app/entrypoint.sh"]