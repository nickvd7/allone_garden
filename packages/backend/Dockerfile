# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:22.23.1-alpine AS builder
WORKDIR /app
# bcrypt / optional native addons may need a toolchain on musl
RUN apk add --no-cache python3 make g++
# This package is built from its own context (no workspace root lockfile here),
# so npm install is used rather than npm ci, which requires a package-lock.json.
COPY package*.json ./
RUN npm install --omit=dev

# ── Runtime stage ───────────────────────────────────────────────────────────────
FROM node:22.23.1-alpine
WORKDIR /app

# Run as non-root for security
RUN addgroup -S garden && adduser -S garden -G garden

COPY --from=builder /app/node_modules ./node_modules
COPY . .

# plugins directory is mounted at runtime via docker-compose volume
RUN mkdir -p /app/plugins && chown -R garden:garden /app \
  && chmod +x /app/scripts/docker-entrypoint.sh

USER garden

EXPOSE 5000
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
CMD ["node", "src/index.js"]
