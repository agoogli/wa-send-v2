# Stage 1: Build the NestJS app
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

# Copy root package files for workspaces
COPY package.json package-lock.json ./
# Copy workspace packages
COPY backend/package.json ./backend/

# Install dependencies for the backend workspace
RUN npm ci --workspace=backend

# Copy the source code and configurations
COPY backend ./backend

# Generate Prisma client
RUN npm run prisma:generate -w backend

# Build the project
RUN npm run build -w backend

# Stage 2: Production image
FROM node:22-alpine

WORKDIR /usr/src/app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/

# Install only production dependencies
RUN npm ci --omit=dev --workspace=backend

# Copy built code and prisma files from the builder stage
COPY --from=builder /usr/src/app/backend/dist ./backend/dist
COPY --from=builder /usr/src/app/backend/prisma ./backend/prisma
COPY --from=builder /usr/src/app/backend/node_modules/.prisma ./backend/node_modules/.prisma
COPY --from=builder /usr/src/app/node_modules/@prisma/client ./node_modules/@prisma/client

# Expose NestJS default port
EXPOSE 3000

ENV NODE_ENV=production

# Command to sync/migrate the database on startup and run NestJS
CMD ["sh", "-c", "npx prisma db push --schema=./backend/prisma/schema.prisma && node backend/dist/main"]
