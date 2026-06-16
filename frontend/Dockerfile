# Stage 1: Build the React application
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

# Copy root package files
COPY package.json package-lock.json ./
# Copy workspace packages
COPY frontend/package.json ./frontend/

# Install dependencies for the frontend workspace
RUN npm ci --workspace=frontend

# Copy frontend source files
COPY frontend ./frontend

# Build the project
RUN npm run build -w frontend

# Stage 2: Serve using Nginx
FROM nginx:alpine

# Copy built static files to Nginx serve directory
COPY --from=builder /usr/src/app/frontend/dist /usr/share/nginx/html

# Copy custom Nginx configuration to proxy /api and handle routing
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Expose HTTP port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
