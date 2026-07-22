# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:22.23.1-alpine AS builder
WORKDIR /app

ARG REACT_APP_API_URL=http://localhost:5000
ARG REACT_APP_SERVER_NAME=AllOne Garden
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV REACT_APP_SERVER_NAME=$REACT_APP_SERVER_NAME
ENV CI=false
ENV GENERATE_SOURCEMAP=false
ENV NODE_OPTIONS=--max-old-space-size=4096
# Lint runs in the dedicated CI lint job; isolated Docker installs can pull
# typescript@7 which breaks eslint-plugin-jest / react-app/jest during build.
ENV DISABLE_ESLINT_PLUGIN=true

# Built from its own context (no workspace root lockfile here), so npm install
# is used rather than npm ci, which requires a package-lock.json.
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# ── Runtime stage (nginx) ───────────────────────────────────────────────────────
FROM nginx:1.27-alpine
COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
