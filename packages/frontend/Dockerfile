# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

ARG REACT_APP_API_URL=http://localhost:5000
ARG REACT_APP_SERVER_NAME=AllOne Garden
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV REACT_APP_SERVER_NAME=$REACT_APP_SERVER_NAME
ENV CI=false
ENV GENERATE_SOURCEMAP=false
ENV NODE_OPTIONS=--max-old-space-size=4096

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
