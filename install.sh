#!/usr/bin/env bash
# =============================================================================
# AllOne Garden — Universal installer
#
# Supported platforms:
#   🫐  Raspberry Pi OS / Debian / Ubuntu  →  full production setup
#   🍎  macOS (Homebrew)                   →  delegates to install-mac.sh
#   🤖  Android / Termux                   →  delegates to install-termux.sh
#   🪟  Windows                            →  use Docker or start.ps1 instead
#
# Usage:
#   curl -fsSL https://get.allonegarden.org/install.sh | bash
#   -- or locally --
#   bash install.sh
#
# Environment variables:
#   GARDEN_DOMAIN=your.domain   — enable HTTPS via Let's Encrypt
#   GARDEN_DIR=/opt/allone-garden
#   GARDEN_USER=garden
# =============================================================================
set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET} $*"; }
success() { echo -e "${GREEN}[OK]${RESET}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET} $*"; }
error()   { echo -e "${RED}[ERR]${RESET}  $*" >&2; exit 1; }

# ── Config ────────────────────────────────────────────────────────────────────
INSTALL_DIR="${GARDEN_DIR:-/opt/allone-garden}"
SERVICE_USER="${GARDEN_USER:-garden}"
REPO_URL="https://github.com/allone-garden/allone-garden.git"
NODE_MAJOR=20
POSTGRES_DB="allone_garden"
DOMAIN="${GARDEN_DOMAIN:-}"
POSTGRES_USER="garden"
REDIS_PORT=6379
BACKEND_PORT=5000

echo -e "${BOLD}"
echo "  ╔═══════════════════════════════════════╗"
echo "  ║   🌱  AllOne Garden Installer          ║"
echo "  ║   Open-source · Community-hosted       ║"
echo "  ╚═══════════════════════════════════════╝"
echo -e "${RESET}"

# ── Platform detection — delegate to specialised scripts ──────────────────────
OS=$(uname -s)
ARCH=$(uname -m)
info "Platform: ${OS} / ${ARCH}"

# macOS
if [[ "$OS" == "Darwin" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [[ -f "${SCRIPT_DIR}/install-mac.sh" ]]; then
    info "macOS detected — running install-mac.sh"
    exec bash "${SCRIPT_DIR}/install-mac.sh" "$@"
  else
    error "macOS detected but install-mac.sh not found. Clone the full repo first."
  fi
fi

# Android / Termux (PREFIX is set by Termux)
if [[ -n "${PREFIX:-}" && "$PREFIX" == *"com.termux"* ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [[ -f "${SCRIPT_DIR}/install-termux.sh" ]]; then
    info "Termux detected — running install-termux.sh"
    exec bash "${SCRIPT_DIR}/install-termux.sh" "$@"
  else
    error "Termux detected but install-termux.sh not found. Clone the full repo first."
  fi
fi

# Windows (Git Bash / WSL)
if [[ "$OS" == "MINGW"* || "$OS" == "MSYS"* ]]; then
  error "Windows Git Bash detected. Use Docker (docker compose up) or start.ps1 in PowerShell."
fi

# Pi model detection (informational only)
if [[ -f /proc/device-tree/model ]]; then
  PI_MODEL=$(tr -d '\0' < /proc/device-tree/model)
  info "Hardware: ${PI_MODEL}"
fi

# ── Root check (Linux only) ───────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  error "Run with sudo: sudo bash install.sh"
fi

# ── System update ─────────────────────────────────────────────────────────────
info "Updating package lists…"
apt-get update -qq

# ── Dependencies ──────────────────────────────────────────────────────────────
info "Installing system dependencies…"
apt-get install -y -qq \
  curl git build-essential \
  postgresql postgresql-contrib \
  redis-server \
  nginx \
  certbot python3-certbot-nginx \
  ufw \
  jq

success "System dependencies installed"

# ── Node.js ───────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node -e 'process.stdout.write(process.version.split(".")[0].slice(1))')" -lt "$NODE_MAJOR" ]]; then
  info "Installing Node.js ${NODE_MAJOR}…"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs
  success "Node.js $(node --version) installed"
else
  success "Node.js $(node --version) already installed"
fi

# ── Service user ──────────────────────────────────────────────────────────────
if ! id "$SERVICE_USER" &>/dev/null; then
  info "Creating system user '${SERVICE_USER}'…"
  useradd --system --create-home --shell /bin/bash "$SERVICE_USER"
fi

# ── Clone / update repo ───────────────────────────────────────────────────────
if [[ -d "$INSTALL_DIR/.git" ]]; then
  info "Updating existing installation in ${INSTALL_DIR}…"
  git -C "$INSTALL_DIR" pull --ff-only
else
  info "Cloning AllOne Garden into ${INSTALL_DIR}…"
  git clone --depth=1 "$REPO_URL" "$INSTALL_DIR"
fi
chown -R "${SERVICE_USER}:${SERVICE_USER}" "$INSTALL_DIR"
success "Source code ready"

# ── Install npm dependencies ──────────────────────────────────────────────────
info "Installing backend dependencies…"
su -c "cd '${INSTALL_DIR}/packages/backend' && npm install --production" "$SERVICE_USER"

info "Building frontend…"
su -c "cd '${INSTALL_DIR}/packages/frontend' && npm install && npm run build" "$SERVICE_USER"

success "Dependencies installed and frontend built"

# ── PostgreSQL setup ──────────────────────────────────────────────────────────
info "Configuring PostgreSQL…"
systemctl enable --now postgresql

# Generate a random DB password
DB_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 20)

# Create database user and database (idempotent)
su -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='${POSTGRES_USER}'\" | grep -q 1 || \
       psql -c \"CREATE USER ${POSTGRES_USER} WITH PASSWORD '${DB_PASS}'\"" postgres

su -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='${POSTGRES_DB}'\" | grep -q 1 || \
       psql -c \"CREATE DATABASE ${POSTGRES_DB} OWNER ${POSTGRES_USER}\"" postgres

success "PostgreSQL ready (db: ${POSTGRES_DB}, user: ${POSTGRES_USER})"

# ── Redis ─────────────────────────────────────────────────────────────────────
info "Enabling Redis…"
systemctl enable --now redis-server
success "Redis running on port ${REDIS_PORT}"

# ── Environment file ──────────────────────────────────────────────────────────
ENV_FILE="${INSTALL_DIR}/packages/backend/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  info "Creating .env file…"

  JWT_SECRET=$(openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c 48)
  SERVER_NAME="Garden Server $(hostname)"

  # Use HTTPS URL if a domain was provided
  if [[ -n "$DOMAIN" ]]; then
    FRONTEND_URL_VALUE="https://${DOMAIN}"
  else
    FRONTEND_URL_VALUE="http://$(hostname -I | awk '{print $1}')"
  fi

  cat > "$ENV_FILE" <<EOF
# AllOne Garden — generated by install.sh
NODE_ENV=production
PORT=${BACKEND_PORT}
FRONTEND_URL=${FRONTEND_URL_VALUE}

# Database
DATABASE_URL=postgresql://${POSTGRES_USER}:${DB_PASS}@localhost:5432/${POSTGRES_DB}

# Redis
REDIS_URL=redis://localhost:${REDIS_PORT}

# Authentication
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=7d

# Server identity
SERVER_NAME=${SERVER_NAME}

# P2P Federation (set to 'true' to join the global network)
P2P_ENABLED=false
P2P_PORT=10001

# Limits
MAX_PLAYERS_PER_SERVER=100
ENABLE_TRADING=true
ENABLE_CHAT=true
EOF

  chown "${SERVICE_USER}:${SERVICE_USER}" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  success ".env created (JWT secret generated)"
else
  warn ".env already exists — skipping (delete it to regenerate)"
fi

# ── Run DB migrations ─────────────────────────────────────────────────────────
info "Running database setup…"
su -c "cd '${INSTALL_DIR}' && node packages/backend/scripts/setup-db.js" "$SERVICE_USER"
success "Database schema ready"

# ── Systemd service ───────────────────────────────────────────────────────────
info "Creating systemd service…"

cat > /etc/systemd/system/allone-garden.service <<EOF
[Unit]
Description=AllOne Garden Server
After=network.target postgresql.service redis-server.service
Wants=postgresql.service redis-server.service

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}/packages/backend
ExecStart=$(which node) src/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=${ENV_FILE}
StandardOutput=journal
StandardError=journal
SyslogIdentifier=allone-garden

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable allone-garden
systemctl restart allone-garden
success "allone-garden.service started"

# ── Nginx reverse proxy ───────────────────────────────────────────────────────
info "Configuring Nginx…"
LOCAL_IP=$(hostname -I | awk '{print $1}')

cat > /etc/nginx/sites-available/allone-garden <<EOF
# AllOne Garden — Nginx reverse proxy
server {
    listen 80;
    server_name _;

    # Serve built React frontend
    root ${INSTALL_DIR}/packages/frontend/build;
    index index.html;

    # API requests → backend
    location /api/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    # Socket.IO → backend
    location /socket.io/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_read_timeout 86400;
    }

    # React SPA — serve index.html for all other routes
    location / {
        try_files \$uri /index.html;
    }
}
EOF

ln -sf /etc/nginx/sites-available/allone-garden /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
success "Nginx configured (HTTP)"

# ── HTTPS via Let's Encrypt (optional, requires a domain) ─────────────────────
if [[ -n "$DOMAIN" ]]; then
  info "Requesting Let's Encrypt certificate for ${DOMAIN}…"

  EMAIL="${GARDEN_EMAIL:-admin@${DOMAIN}}"

  # certbot --nginx rewrites the nginx config to add HTTPS automatically
  certbot --nginx \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    --domains "$DOMAIN" \
    --redirect \
    2>&1 | tail -5

  # Enable automatic renewal (certbot installs a systemd timer by default)
  systemctl enable --now certbot.timer 2>/dev/null || true

  success "HTTPS certificate issued for ${DOMAIN} (auto-renews via certbot.timer)"
else
  warn "No DOMAIN set — skipping HTTPS setup."
  warn "To enable HTTPS later: GARDEN_DOMAIN=your.domain sudo bash install.sh"
fi

# ── Firewall ──────────────────────────────────────────────────────────────────
info "Configuring firewall…"
ufw --force enable
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
if grep -q "P2P_ENABLED=true" "$ENV_FILE" 2>/dev/null; then
  ufw allow 10001/tcp comment 'AllOne Garden P2P'
fi
success "Firewall configured"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}╔═══════════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}${BOLD}║   🌱  AllOne Garden is running!                  ║${RESET}"
echo -e "${GREEN}${BOLD}╚═══════════════════════════════════════════════════╝${RESET}"
echo ""
if [[ -n "$DOMAIN" ]]; then
  echo -e "  Game URL:     ${BOLD}https://${DOMAIN}/${RESET}"
  echo -e "  API health:   ${BOLD}https://${DOMAIN}/api/health${RESET}"
else
  echo -e "  Game URL:     ${BOLD}http://${LOCAL_IP}/${RESET}"
  echo -e "  API health:   ${BOLD}http://${LOCAL_IP}/api/health${RESET}"
  echo -e "  Add HTTPS:    ${BOLD}GARDEN_DOMAIN=your.domain sudo bash install.sh${RESET}"
fi
echo ""
echo -e "  Service:      ${BOLD}sudo systemctl status allone-garden${RESET}"
echo -e "  Logs:         ${BOLD}sudo journalctl -u allone-garden -f${RESET}"
echo -e "  Config:       ${BOLD}${ENV_FILE}${RESET}"
echo ""
echo -e "  Enable P2P federation: edit ${ENV_FILE}"
echo -e "  set P2P_ENABLED=true and restart: ${BOLD}sudo systemctl restart allone-garden${RESET}"
echo ""
echo -e "  Thank you for hosting AllOne Garden! 🌍"
echo ""
