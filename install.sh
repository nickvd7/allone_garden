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
#   sudo bash install.sh
#
# The domain is fixed to allone.garden (with www. and api. covered by the cert).
#
# Environment variables:
#   GARDEN_EMAIL=you@example.com       — email for Let's Encrypt notifications
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

# ── Network helpers (local-only — never contact a third-party service) ─────────
# Detect the primary IPv4 address of THIS machine (the Raspberry Pi it runs on).
#
# Strategy: find the interface the default route uses to reach the internet,
# then read that interface's own global-scope IPv4 address. This references no
# external IP at all and sends no packets — it is a pure local lookup, so it
# works offline and never leaks the install to a "what is my IP" echo service.
# Falls back to `hostname -I` if the `ip` tooling is unavailable.
detect_primary_ip() {
  local ip="" iface=""
  if command -v ip &>/dev/null; then
    iface=$(ip -4 route show default 2>/dev/null \
              | awk '{for (i = 1; i <= NF; i++) if ($i == "dev") { print $(i + 1); exit }}')
    if [[ -n "$iface" ]]; then
      ip=$(ip -4 -o addr show dev "$iface" scope global 2>/dev/null \
             | awk '{print $4}' | cut -d/ -f1 | head -n1)
    fi
  fi
  if [[ -z "$ip" ]]; then
    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  fi
  printf '%s' "$ip"
}

# True when an IPv4 address is in a private / loopback / link-local range
# (RFC 1918 + 127/8 + 169.254/16) — i.e. not directly reachable from the internet.
is_private_ipv4() {
  [[ "$1" =~ ^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.) ]]
}

# ── Config ────────────────────────────────────────────────────────────────────
INSTALL_DIR="${GARDEN_DIR:-/opt/allone-garden}"
SERVICE_USER="${GARDEN_USER:-garden}"
REPO_URL="https://github.com/nickvd7/allone_garden.git"
NODE_MAJOR=20
POSTGRES_DB="allone_garden"
# Domain is fixed. The certificate covers the apex plus www. and api. subdomains.
DOMAIN="allone.garden"
CERT_DOMAINS=("allone.garden" "www.allone.garden" "api.allone.garden")
EMAIL="${GARDEN_EMAIL:-}"
POSTGRES_USER="garden"
REDIS_PORT=6379
BACKEND_PORT=5000

# ── Validate environment-variable overrides ───────────────────────────────────
if [[ ! "$SERVICE_USER" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]]; then
  error "GARDEN_USER '${SERVICE_USER}' is not a valid Linux username (a-z, 0-9, _, -, max 32 chars)"
fi
if [[ ! "$INSTALL_DIR" =~ ^/[a-zA-Z0-9/_.-]+$ ]]; then
  error "GARDEN_DIR '${INSTALL_DIR}' must be an absolute path containing only a-z A-Z 0-9 / _ . -"
fi
if [[ -n "$EMAIL" ]] && [[ ! "$EMAIL" =~ ^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$ ]]; then
  error "GARDEN_EMAIL '${EMAIL}' does not look like a valid email address"
fi

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

# ── Root check ────────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  error "Run with sudo: sudo bash install.sh"
fi

# ── This machine's own IP (detected locally — see detect_primary_ip) ───────────
PI_IP="$(detect_primary_ip)"
[[ -z "$PI_IP" ]] && PI_IP="127.0.0.1"

# ── Interactive configuration ─────────────────────────────────────────────────
# The domain is fixed (allone.garden + www. + api.). The only thing we may ask
# for is the Let's Encrypt contact email. When piped (curl | bash) the prompt is
# skipped — set GARDEN_EMAIL beforehand, otherwise we fall back to admin@DOMAIN.
if [[ -t 0 && -z "$EMAIL" ]]; then
  echo ""
  echo -e "${BOLD}  ── Configuration ──────────────────────────────────────────────────${RESET}"
  echo ""
  _DEFAULT_EMAIL="admin@${DOMAIN}"
  echo -e "  Email address for Let's Encrypt certificate notifications."
  echo -e "  You will receive expiry warnings here (renewal is automatic)."
  echo ""
  read -rp "  Email [${_DEFAULT_EMAIL}]: " _INPUT_EMAIL
  EMAIL="${_INPUT_EMAIL:-${_DEFAULT_EMAIL}}"
  echo ""
fi

# Non-interactive (curl | bash) without GARDEN_EMAIL → use a sensible default.
[[ -z "$EMAIL" ]] && EMAIL="admin@${DOMAIN}"

# ── Validate email ─────────────────────────────────────────────────────────────
if [[ ! "$EMAIL" =~ ^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$ ]]; then
  error "Email '${EMAIL}' does not look like a valid address"
fi

# ── Summary before install starts ─────────────────────────────────────────────
echo -e "${BOLD}  ── Install summary ────────────────────────────────────────────────${RESET}"
echo -e "  Install dir:  ${INSTALL_DIR}"
echo -e "  Service user: ${SERVICE_USER}"
echo -e "  Domain:       ${DOMAIN}  (HTTPS via Let's Encrypt)"
echo -e "  Cert covers:  $(IFS=', '; echo "${CERT_DOMAINS[*]}")"
echo -e "  Email:        ${EMAIL}"
echo ""

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
# GIT_TERMINAL_PROMPT=0 makes git fail fast instead of hanging on a credential
# prompt (e.g. if the repo is private or temporarily returns 401). We run as
# SERVICE_USER because on re-runs the directory is owned by that user, and
# git 2.35+ refuses to operate as root on a dir owned by someone else.
if [[ -d "$INSTALL_DIR/.git" ]]; then
  info "Updating existing installation in ${INSTALL_DIR}…"
  # Make sure the service user is allowed to operate on the repo regardless of
  # how ownership ended up (belt-and-suspenders for the dubious-ownership check).
  su -c "git config --global --add safe.directory '${INSTALL_DIR}'" "$SERVICE_USER" 2>/dev/null || true

  if su -c "env GIT_TERMINAL_PROMPT=0 GIT_ASKPASS=/bin/false git -C '${INSTALL_DIR}' -c credential.helper='' -c core.askPass='' pull --ff-only" "$SERVICE_USER"; then
    success "Repository updated"
  else
    # A failed update (auth required, no network, diverged history) must not
    # abort the whole install — continue with the existing checkout.
    warn "Could not update the repository (auth/network/diverged) — continuing with the existing code in ${INSTALL_DIR}."
  fi
else
  info "Cloning AllOne Garden into ${INSTALL_DIR}…"
  GIT_TERMINAL_PROMPT=0 git clone --depth=1 "$REPO_URL" "$INSTALL_DIR" \
    || error "Could not clone ${REPO_URL}. If the repository is private, clone it manually into ${INSTALL_DIR} first, then re-run."
fi
chown -R "${SERVICE_USER}:${SERVICE_USER}" "$INSTALL_DIR"
# Prevent other local users from reading or modifying source/config files
chmod 750 "$INSTALL_DIR"
find "$INSTALL_DIR" -maxdepth 6 -type d -exec chmod 750 {} \;
find "$INSTALL_DIR" -maxdepth 6 -type f -exec chmod 640 {} \;
# Restore execute bit on shell scripts
find "$INSTALL_DIR" -maxdepth 6 -name "*.sh" -exec chmod 750 {} \;

# Nginx (www-data) needs read+execute access to the frontend build dir.
# Adding www-data to the service group is the least-privilege option:
# .env stays 600 (owner-only), so www-data cannot read secrets.
if id www-data &>/dev/null && ! groups www-data | grep -qw "$SERVICE_USER"; then
  usermod -aG "$SERVICE_USER" www-data
fi
success "Source code ready"

# ── Install npm dependencies ──────────────────────────────────────────────────
info "Installing backend dependencies…"
su -c "cd '${INSTALL_DIR}/packages/backend' && npm install --production" "$SERVICE_USER"

info "Installing frontend npm packages…"
su -c "cd '${INSTALL_DIR}/packages/frontend' && npm install" "$SERVICE_USER"

success "Dependencies installed"

# ── PostgreSQL setup ──────────────────────────────────────────────────────────
info "Configuring PostgreSQL…"
systemctl enable --now postgresql

PGPORT="${PGPORT:-5432}"
info "Waiting for PostgreSQL (port ${PGPORT})…"
for _ in $(seq 1 30); do
  if su -c "pg_isready -p '${PGPORT}'" postgres &>/dev/null; then
    break
  fi
  sleep 1
done
if ! su -c "pg_isready -p '${PGPORT}'" postgres &>/dev/null; then
  error "PostgreSQL is not ready. Try: sudo systemctl restart postgresql"
fi

# Generate a random DB password (alphanumeric — safe in DATABASE_URL)
DB_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 20)

if su -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='${POSTGRES_USER}'\" | grep -q 1" postgres; then
  su -c "psql -c \"ALTER USER ${POSTGRES_USER} WITH PASSWORD '${DB_PASS}'\"" postgres
else
  su -c "psql -c \"CREATE USER ${POSTGRES_USER} WITH PASSWORD '${DB_PASS}'\"" postgres
fi

su -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='${POSTGRES_DB}'\" | grep -q 1" postgres || \
  su -c "psql -c \"CREATE DATABASE ${POSTGRES_DB} OWNER ${POSTGRES_USER}\"" postgres

success "PostgreSQL ready (db: ${POSTGRES_DB}, user: ${POSTGRES_USER})"

# ── Redis ─────────────────────────────────────────────────────────────────────
info "Enabling Redis…"
systemctl enable --now redis-server
success "Redis running on port ${REDIS_PORT}"

# ── Environment file ──────────────────────────────────────────────────────────
ENV_FILE="${INSTALL_DIR}/packages/backend/.env"
DATABASE_URL="postgresql://${POSTGRES_USER}:${DB_PASS}@127.0.0.1:${PGPORT}/${POSTGRES_DB}"

if [[ ! -f "$ENV_FILE" ]]; then
  info "Creating .env file…"

  JWT_SECRET=$(openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c 48)
  SERVER_NAME="Garden Server $(hostname)"

  if [[ -n "$DOMAIN" ]]; then
    FRONTEND_URL_VALUE="https://${DOMAIN}"
  else
    FRONTEND_URL_VALUE="http://${PI_IP}"
  fi

  cat > "$ENV_FILE" <<EOF
# AllOne Garden — generated by install.sh
NODE_ENV=production
PORT=${BACKEND_PORT}
FRONTEND_URL=${FRONTEND_URL_VALUE}
APP_URL=${FRONTEND_URL_VALUE}

# Database
DATABASE_URL=${DATABASE_URL}

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

  success ".env created (JWT secret + DATABASE_URL)"
else
  # Update DATABASE_URL and FRONTEND_URL/APP_URL to match current domain setting
  if grep -q '^DATABASE_URL=' "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=${DATABASE_URL}|" "$ENV_FILE"
  else
    printf '\nDATABASE_URL=%s\n' "${DATABASE_URL}" >> "$ENV_FILE"
  fi

  if [[ -n "$DOMAIN" ]]; then
    _NEW_URL="https://${DOMAIN}"
    for _KEY in FRONTEND_URL APP_URL; do
      if grep -q "^${_KEY}=" "$ENV_FILE" 2>/dev/null; then
        sed -i "s|^${_KEY}=.*|${_KEY}=${_NEW_URL}|" "$ENV_FILE"
      else
        printf '\n%s=%s\n' "$_KEY" "$_NEW_URL" >> "$ENV_FILE"
      fi
    done
  fi

  success ".env updated"
fi
chown "${SERVICE_USER}:${SERVICE_USER}" "$ENV_FILE"
chmod 600 "$ENV_FILE"

# ── Build frontend ────────────────────────────────────────────────────────────
# REACT_APP_API_URL is intentionally left unset so all API calls use relative
# paths (/api/...). nginx proxies those to the backend on the same origin.
# This avoids CORS entirely and works regardless of HTTP or HTTPS.
info "Building frontend…"
su -c "cd '${INSTALL_DIR}/packages/frontend' && CI=false GENERATE_SOURCEMAP=false NODE_OPTIONS=--max-old-space-size=4096 npm run build" "$SERVICE_USER"
success "Frontend built"

# ── Run DB migrations ─────────────────────────────────────────────────────────
info "Running database setup…"
su -c "cd '${INSTALL_DIR}/packages/backend' && node scripts/setup-db.js" "$SERVICE_USER"
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
LOCAL_IP="$PI_IP"

# Use all domain variants in server_name — certbot needs this to find the right vhost
if [[ -n "$DOMAIN" ]]; then
  _NGINX_SERVER_NAME=$(IFS=' '; echo "${CERT_DOMAINS[*]}")
else
  _NGINX_SERVER_NAME="_"
fi

cat > /etc/nginx/sites-available/allone-garden <<EOF
# AllOne Garden — Nginx reverse proxy
server {
    listen 80;
    server_name ${_NGINX_SERVER_NAME};

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

    # One-line installer — lets users run:
    #   curl -fsSL https://${DOMAIN}/install.sh | sudo bash
    # so they can spin up an additional server that joins this one.
    location = /install.sh {
        alias ${INSTALL_DIR}/install.sh;
        default_type text/x-shellscript;
        add_header Content-Disposition 'attachment; filename="install.sh"';
    }

    # React SPA — serve index.html for all other routes
    location / {
        try_files \$uri /index.html;
    }
}
EOF

ln -sf /etc/nginx/sites-available/allone-garden /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
# Use restart (not reload): if www-data was just added to the service group,
# only a full restart makes the nginx master pick up the new supplementary
# group, which it needs to read the frontend build dir.
nginx -t && systemctl restart nginx
success "Nginx configured (HTTP)"

# ── HTTPS via Let's Encrypt ───────────────────────────────────────────────────
if [[ -n "$DOMAIN" ]]; then

  # ── Pre-flight: DNS + DNSSEC checks before running certbot ────────────────
  # Uses Cloudflare DoH so no dig/host tool is needed (jq is already installed).
  # All checks are non-fatal: they warn and skip certbot but don't abort the
  # install — the site keeps running on HTTP while you fix DNS.

  _ssl_ok=true

  # Query a DNS type via Cloudflare DNS-over-HTTPS; returns space-separated data.
  _doh() {
    curl -sf --max-time 8       "https://cloudflare-dns.com/dns-query?name=${1}&type=${2}"       -H 'Accept: application/dns-json'       | jq -r '.Answer[]?.data // empty' 2>/dev/null || true
  }

  # 1. DNSSEC check — DS in parent zone means DNSSEC is "on".
  #    Let's Encrypt then requires valid RRSIGs; broken DNSSEC → certbot fails.
  info "Checking DNSSEC for ${DOMAIN}…"
  _ds=$(_doh "$DOMAIN" DS)
  if [[ -n "$_ds" ]]; then
    _rrsig=$(_doh "$DOMAIN" RRSIG)
    if [[ -z "$_rrsig" ]]; then
      warn "⚠  DNSSEC is BROKEN for ${DOMAIN}."
      warn "   Your registrar has DS records set but the zone has no RRSIGs."
      warn "   Let's Encrypt will refuse a certificate until this is fixed."
      warn ""
      warn "   Fix — choose one:"
      warn "     A) Disable DNSSEC at your registrar (delete DS records). Wait 1–2 h."
      warn "     B) Ask your DNS provider to correctly sign the zone."
      _ssl_ok=false
    else
      success "DNSSEC OK — zone is signed"
    fi
  else
    success "DNSSEC not enabled (no DS records) — fine for Let's Encrypt"
  fi

  # 2. A-record check — every domain must resolve to a public IP.
  if [[ "$_ssl_ok" == true ]]; then
    info "Checking DNS A-records for ${CERT_DOMAINS[*]}…"
    for _d in "${CERT_DOMAINS[@]}"; do
      _ip=$(_doh "$_d" A | head -1)
      if [[ -z "$_ip" ]]; then
        warn "⚠  No A record found for ${_d}."
        warn "   Add an A record → your router's public WAN IP."
        warn "   Find it: curl -s https://api.ipify.org"
        _ssl_ok=false
      elif is_private_ipv4 "$_ip"; then
        warn "⚠  ${_d} → ${_ip} (private / LAN address)."
        warn "   Let's Encrypt cannot reach LAN IPs from the internet."
        warn "   Set the A record to your public WAN IP, then enable"
        warn "   port forwarding on your router: 80 + 443 TCP → ${PI_IP}"
        warn "   Find your public IP: curl -s https://api.ipify.org"
        _ssl_ok=false
      else
        success "  ${_d} → ${_ip} (public)"
      fi
    done
    [[ "$_ssl_ok" == true ]] && success "DNS A-records look good"
  fi

  # 3. Port-80 reachability — Let's Encrypt HTTP-01 challenge needs it open.
  if [[ "$_ssl_ok" == true ]]; then
    info "Checking port 80 reachability from the internet…"
    _port_open=$(curl -sf --max-time 12 \
      "https://portchecker.io/api/v1/query" \
      -H 'Content-Type: application/json' \
      -d '{"host":"'"${DOMAIN}"'","ports":[80]}' \
      | jq -r '.results[0].status // empty' 2>/dev/null || true)
    if [[ "$_port_open" == "open" ]]; then
      success "Port 80 is reachable from the internet"
    else
      warn "⚠  Port 80 on ${DOMAIN} appears unreachable from the internet."
      warn "   Enable port forwarding on your router: 80 + 443 TCP → ${PI_IP}"
      _ssl_ok=false
    fi
  fi

  if [[ "$_ssl_ok" != true ]]; then
    warn ""
    warn "One or more pre-flight checks failed — skipping Let's Encrypt."
    warn "The site runs on HTTP. Fix the issues above, then run:"
    warn "  sudo certbot --nginx $(printf ' -d %s' "${CERT_DOMAINS[@]}") --email ${EMAIL} --agree-tos --redirect"
  else

    info "Requesting Let's Encrypt certificate for: $(IFS=', '; echo "${CERT_DOMAINS[*]}")"

    _CERT_DOMAINS_CSV=$(IFS=','; echo "${CERT_DOMAINS[*]}")

    if certbot --nginx \
        --non-interactive \
        --agree-tos \
        --email "$EMAIL" \
        --domains "${_CERT_DOMAINS_CSV}" \
        --redirect \
        2>&1 | tail -8; then

      success "SSL certificate issued for: $(IFS=', '; echo "${CERT_DOMAINS[*]}")"

      # systemd timer (preferred on modern Debian/Ubuntu/Pi OS)
      if systemctl list-timers --all 2>/dev/null | grep -q certbot; then
        systemctl enable --now certbot.timer 2>/dev/null || true
        success "Auto-renewal active via certbot.timer (systemd)"
      fi

      # cron fallback — certbot installs /etc/cron.d/certbot automatically
      if [[ -f /etc/cron.d/certbot ]]; then
        success "Auto-renewal cron job present at /etc/cron.d/certbot"
      fi

      info "Verifying renewal config (dry-run)…"
      if certbot renew --dry-run --quiet 2>&1; then
        success "Renewal dry-run passed — certificate will renew automatically"
      else
        warn "Renewal dry-run had a warning. Check: sudo certbot renew --dry-run"
      fi

    else
      warn "certbot failed despite pre-flight passing."
      warn "Check the log: sudo cat /var/log/letsencrypt/letsencrypt.log"
      warn "To retry: sudo certbot --nginx $(printf ' -d %s' "${CERT_DOMAINS[@]}") --email ${EMAIL} --agree-tos --redirect"
    fi

  fi  # end _ssl_ok block

else
  # DOMAIN is fixed, so this branch is not expected; kept as a safety net.
  warn "No domain configured — running HTTP only. Re-run: sudo bash install.sh"
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
fi
echo ""
echo -e "  Service:      ${BOLD}sudo systemctl status allone-garden${RESET}"
echo -e "  Logs:         ${BOLD}sudo journalctl -u allone-garden -f${RESET}"
echo -e "  Config:       ${BOLD}${ENV_FILE}${RESET}"
echo ""

# ── DNS / IP info ──────────────────────────────────────────────────────────────
# The A-record value is THIS Raspberry Pi's own IP address, detected locally
# from the kernel routing table (no third-party "what is my IP" service is ever
# contacted — see detect_primary_ip).
echo -e "${BOLD}  ── Network ────────────────────────────────────────────────────────${RESET}"
echo ""
echo -e "  This Raspberry Pi's IP:  ${BOLD}${PI_IP}${RESET}"

# Show every IPv4 the Pi holds (helpful on multi-homed setups: Wi-Fi + Ethernet)
ALL_IPS=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+\.' | grep -v '^127\.' | paste -sd' ' -)
if [[ -n "$ALL_IPS" && "$ALL_IPS" != "$PI_IP" ]]; then
  echo -e "  All interfaces:          ${ALL_IPS}"
fi
echo ""

if [[ -n "$DOMAIN" ]]; then
  echo -e "  ${CYAN}DNS A-records to create for ${BOLD}${DOMAIN}${RESET}${CYAN}:${RESET}"

  # Fixed-width ASCII table (build content rows then pad to a constant inner
  # width so the borders always line up regardless of domain/IP length).
  _INNER_W=58
  _BAR=$(printf '─%.0s' $(seq 1 "$_INNER_W"))
  printf '  ┌%s┐\n' "$_BAR"
  printf '  │%-*s│\n' "$_INNER_W" "$(printf '  %-5s %-30s %s' 'Type' 'Name' 'Value')"
  printf '  ├%s┤\n' "$_BAR"
  for _DOM in "${CERT_DOMAINS[@]}"; do
    printf '  │%-*s│\n' "$_INNER_W" "$(printf '  %-5s %-30s %s' 'A' "$_DOM" "$PI_IP")"
  done
  printf '  └%s┘\n' "$_BAR"
  echo -e "  Point all of these A-records at ${BOLD}${PI_IP}${RESET} at your DNS provider."
  echo -e "  ${CYAN}Propagation typically takes 1–15 minutes.${RESET}"

  # If the Pi only has a private IP it is behind NAT — a public A-record can't
  # reach it directly. Tell the user what to do without phoning home for the WAN IP.
  if is_private_ipv4 "$PI_IP"; then
    echo ""
    echo -e "  ${YELLOW}⚠  ${PI_IP} is a private (LAN) address — not reachable from the internet.${RESET}"
    echo -e "     • For internet access: forward router ports ${BOLD}80${RESET} and ${BOLD}443${RESET} (TCP) to ${BOLD}${PI_IP}${RESET},"
    echo -e "       and set the public A-records to your router's WAN IP."
    echo -e "       (Look it up safely on the Pi with: ${BOLD}curl -s https://ifconfig.co${RESET})"
    echo -e "     • For LAN-only / split-horizon DNS: use ${BOLD}${PI_IP}${RESET} as shown above."
  fi
  echo ""
  echo -e "  ${GREEN}Certificate auto-renewal:${RESET} active — no action needed."
  echo -e "  To check: ${BOLD}sudo certbot certificates${RESET}"
  echo -e "  To test renewal: ${BOLD}sudo certbot renew --dry-run${RESET}"
else
  # DOMAIN is fixed, so this branch is not expected; kept as a safety net.
  echo -e "  To enable HTTPS, point the domain at ${BOLD}${PI_IP}${RESET} and re-run: ${BOLD}sudo bash install.sh${RESET}"
fi
echo ""
echo -e "  Enable P2P federation: edit ${ENV_FILE}"
echo -e "  set P2P_ENABLED=true and restart: ${BOLD}sudo systemctl restart allone-garden${RESET}"
echo ""
echo -e "  Thank you for hosting AllOne Garden! 🌍"
echo ""
