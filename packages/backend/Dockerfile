# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ── Runtime stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Run as non-root for security
RUN addgroup -S garden && adduser -S garden -G garden

COPY --from=builder /app/node_modules ./node_modules
COPY . .

# plugins directory is mounted at runtime via docker-compose volume
RUN mkdir -p /app/plugins && chown -R garden:garden /app

USER garden

EXPOSE 5000
CMD ["node", "src/index.js"]
