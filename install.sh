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
#   FRESH_INSTALL=1                  — nieuwe .env (backup van oude); gebruik install-fresh.sh
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
# If this TransIP credentials file exists, SSL is issued via DNS-01 (no open
# ports needed) instead of the HTTP-01 / port-80 route. Override with GARDEN_TRANSIP_INI.
TRANSIP_INI="${GARDEN_TRANSIP_INI:-/etc/letsencrypt/transip.ini}"

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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

# ── Source tree (git / deploy / fetch) ────────────────────────────────────────
# Pi-productie: code komt via rsync uit ~/coding (reinstall-pi.sh) — geen .git op /opt.
# Geen git clone naar een bestaande map (voorkomt GitHub-login + "already exists").
_has_install_tree() {
  [[ -f "${INSTALL_DIR}/install.sh" && -f "${INSTALL_DIR}/packages/backend/src/index.js" ]]
}

if [[ -d "$INSTALL_DIR/.git" ]]; then
  info "Updating existing git installation in ${INSTALL_DIR}…"
  chown -R "${SERVICE_USER}:${SERVICE_USER}" "$INSTALL_DIR" 2>/dev/null || true
  if [[ -x "${SCRIPT_DIR}/scripts/git-pull.sh" ]] && bash "${SCRIPT_DIR}/scripts/git-pull.sh" "${INSTALL_DIR}" "${SERVICE_USER}"; then
    success "Repository updated"
  else
    warn "Could not update the repository — continuing with existing code in ${INSTALL_DIR}."
  fi
elif _has_install_tree; then
  info "Source tree already in ${INSTALL_DIR} (deploy/rsync) — skipping git clone"
  chown -R "${SERVICE_USER}:${SERVICE_USER}" "$INSTALL_DIR" 2>/dev/null || true
elif [[ -d "$INSTALL_DIR" ]] && [[ -n "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]]; then
  error "${INSTALL_DIR} exists but is not a complete install. Use: sudo bash reinstall-pi.sh from ~/coding/allone_garden"
else
  info "Fetching AllOne Garden into ${INSTALL_DIR}…"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  if [[ -x "${SCRIPT_DIR}/scripts/fetch-github-tree.sh" ]]; then
    bash "${SCRIPT_DIR}/scripts/fetch-github-tree.sh" "$INSTALL_DIR"
  else
    env -u GIT_ASKPASS -u SSH_ASKPASS GIT_TERMINAL_PROMPT=0 \
      git -c credential.helper= -c core.askPass= \
      clone --depth=1 "$REPO_URL" "$INSTALL_DIR" \
      || error "Could not fetch source. Run reinstall-pi.sh from your ~/coding clone instead."
  fi
  chown -R "${SERVICE_USER}:${SERVICE_USER}" "$INSTALL_DIR"
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
su -c "cd '${INSTALL_DIR}/packages/backend' && npm install --omit=dev" "$SERVICE_USER"

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

if [[ "${FRESH_INSTALL:-}" == 1 && -f "$ENV_FILE" ]]; then
  _ENV_BAK="${ENV_FILE}.bak.$(date +%Y%m%d%H%M%S)"
  info "Fresh install: oude .env → ${_ENV_BAK}"
  cp "$ENV_FILE" "$_ENV_BAK"
  rm -f "$ENV_FILE"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  info "Creating .env file…"

  JWT_SECRET=$(openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c 48)
  SERVER_NAME="Garden Server $(hostname)"

  if [[ -n "$DOMAIN" ]]; then
    # Comma-separated: HTTPS domain + LAN IP (players often open http://<pi-ip>)
    FRONTEND_URL_VALUE="https://${DOMAIN},http://${PI_IP}"
    APP_URL_VALUE="https://${DOMAIN}"
  else
    FRONTEND_URL_VALUE="http://${PI_IP}"
    APP_URL_VALUE="http://${PI_IP}"
  fi

  # Game usernames with admin access (comma-separated). Override: GARDEN_ADMIN_USERS=a,b
  ADMIN_USERS_VALUE="${GARDEN_ADMIN_USERS:-admin}"

  cat > "$ENV_FILE" <<EOF
# AllOne Garden — generated by install.sh
NODE_ENV=production
PORT=${BACKEND_PORT}
FRONTEND_URL=${FRONTEND_URL_VALUE}
APP_URL=${APP_URL_VALUE}

# Database
DATABASE_URL=${DATABASE_URL}

# Redis
REDIS_URL=redis://localhost:${REDIS_PORT}

# Authentication
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=7d

# Admin panel (game usernames, not Linux users — change after you register)
ADMIN_USERS=${ADMIN_USERS_VALUE}

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
# Nginx (www-data) must read the build; repo dirs may be 750/640 for the service user.
chmod -R a+rX "${INSTALL_DIR}/packages/frontend/build"
success "Frontend built"

# ── Run DB migrations ─────────────────────────────────────────────────────────
info "Running database migrations (schema + incremental)…"
if ! su -c "cd '${INSTALL_DIR}/packages/backend' && node scripts/check-db-connection.js" "$SERVICE_USER" 2>/dev/null; then
  if [[ -x "${INSTALL_DIR}/scripts/sync-postgres-env.sh" ]]; then
    warn "DATABASE_URL test mislukt — sync PostgreSQL-wachtwoord…"
    bash "${INSTALL_DIR}/scripts/sync-postgres-env.sh" "$INSTALL_DIR" "$SERVICE_USER"
  fi
fi
su -c "cd '${INSTALL_DIR}/packages/backend' && npm run db:migrate" "$SERVICE_USER"
success "Database schema ready"

# ── Systemd service ───────────────────────────────────────────────────────────
info "Creating systemd service…"

bash "${INSTALL_DIR}/scripts/write-systemd-unit.sh" "${INSTALL_DIR}" "${SERVICE_USER}"
systemctl restart allone-garden
success "allone-garden.service started"

# ── Nginx reverse proxy ───────────────────────────────────────────────────────
info "Configuring Nginx…"
LOCAL_IP="$PI_IP"

# Domains + catch-all (_ default_server) + LAN IP so http://<pi-ip> hits this vhost
if [[ -n "$DOMAIN" ]]; then
  _NGINX_SERVER_NAME="$(IFS=' '; echo "${CERT_DOMAINS[*]}") _ ${PI_IP}"
else
  _NGINX_SERVER_NAME="_ ${PI_IP}"
fi

cat > /etc/nginx/sites-available/allone-garden <<EOF
# AllOne Garden — Nginx reverse proxy
server {
    listen 80 default_server;
    listen [::]:80 default_server;
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
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
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
if [[ -n "$DOMAIN" && -f "$TRANSIP_INI" ]]; then
  # ── DNS-01 via TransIP API (no inbound ports needed) ──────────────────────
  # Chosen automatically when a TransIP credentials file is present. This works
  # behind CGNAT, blocked port 80, or any firewall, and auto-renews.
  info "TransIP credentials found at ${TRANSIP_INI} — using DNS-01 (no open ports needed)."
  chmod 600 "$TRANSIP_INI" 2>/dev/null || true

  # Ensure the certbot DNS-TransIP plugin is installed
  if ! certbot plugins 2>/dev/null | grep -q 'dns-transip'; then
    info "Installing certbot-dns-transip plugin…"
    apt-get install -y -qq python3-pip >/dev/null 2>&1 || true
    pip3 install --break-system-packages certbot-dns-transip >/dev/null 2>&1 \
      || pip3 install certbot-dns-transip >/dev/null 2>&1 \
      || warn "Could not install certbot-dns-transip automatically — install it manually: sudo pip3 install certbot-dns-transip --break-system-packages"
  fi

  if certbot plugins 2>/dev/null | grep -q 'dns-transip'; then
    info "Requesting Let's Encrypt certificate via TransIP DNS-01 for: $(IFS=', '; echo "${CERT_DOMAINS[*]}")"
    _CERT_D_ARGS=()
    for _d in "${CERT_DOMAINS[@]}"; do _CERT_D_ARGS+=( -d "$_d" ); done

    if certbot certonly -n \
        -a dns-transip \
        --dns-transip-credentials "$TRANSIP_INI" \
        --dns-transip-propagation-seconds 300 \
        "${_CERT_D_ARGS[@]}" \
        -m "$EMAIL" --agree-tos 2>&1 | tail -10; then

      success "SSL certificate issued via TransIP DNS-01"

      # Wire the cert into nginx (adds the 443 vhost + HTTP→HTTPS redirect)
      certbot install --nginx --cert-name "$DOMAIN" --redirect 2>&1 | tail -5 \
        || warn "certbot install --nginx reported an issue — check: sudo nginx -t"

      # Reload nginx automatically after each future auto-renewal
      mkdir -p /etc/letsencrypt/renewal-hooks/deploy
      printf '#!/bin/sh\nsystemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
      chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

      # certbot.timer drives auto-renewal; the renewal conf already stores the
      # dns-transip authenticator + credentials path, so renew is hands-off.
      if systemctl list-timers --all 2>/dev/null | grep -q certbot; then
        systemctl enable --now certbot.timer 2>/dev/null || true
        success "Auto-renewal active via certbot.timer (DNS-01, hands-off)"
      fi

      info "Verifying renewal config (dry-run)…"
      if certbot renew --dry-run --quiet 2>&1; then
        success "Renewal dry-run passed — certificate will renew automatically"
      else
        warn "Renewal dry-run had a warning. Check: sudo certbot renew --dry-run"
      fi
    else
      warn "certbot (TransIP DNS-01) failed. Common causes:"
      warn "  • Wrong dns_transip_username or key file in ${TRANSIP_INI}"
      warn "  • API not enabled, or key has IP-whitelisting on (disable it)"
      warn "  • DNSSEC broken on the zone"
      warn "Check the log: sudo cat /var/log/letsencrypt/letsencrypt.log"
    fi
  fi

elif [[ -n "$DOMAIN" ]]; then

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

# ── Post-install: nginx vhost + health check ─────────────────────────────────
# fix-nginx-vhost regenereert de HTTP-vhost én herstelt daarna SSL (setup-ssl.sh),
# zodat het 443-blok niet verloren gaat. Geef domein/e-mail door voor TransIP DNS-01.
if [[ -x "${INSTALL_DIR}/scripts/fix-nginx-vhost.sh" ]]; then
  info "Nginx vhost + SSL afstemmen op ${INSTALL_DIR}…"
  GARDEN_DOMAIN="$DOMAIN" GARDEN_EMAIL="$EMAIL" \
    GARDEN_CERT_DOMAINS="$(IFS=' '; echo "${CERT_DOMAINS[*]}")" \
    GARDEN_TRANSIP_INI="$TRANSIP_INI" \
    bash "${INSTALL_DIR}/scripts/fix-nginx-vhost.sh" "$INSTALL_DIR" || warn "fix-nginx-vhost mislukt — run handmatig"
fi
if curl -fsS "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null 2>&1; then
  success "Backend health OK (poort ${BACKEND_PORT})"
else
  warn "Backend health check mislukt — zie: sudo journalctl -u allone-garden -n 40"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}╔═══════════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}${BOLD}║   🌱  AllOne Garden is running!                  ║${RESET}"
echo -e "${GREEN}${BOLD}╚═══════════════════════════════════════════════════╝${RESET}"
echo ""

if [[ -n "$DOMAIN" ]]; then
  echo -e "  Game URL:     ${BOLD}https://${DOMAIN}/${RESET}"
  echo -e "  LAN URL:      ${BOLD}http://${PI_IP}/${RESET}"
  echo -e "  API health:   ${BOLD}https://${DOMAIN}/api/health${RESET}"
  echo -e "  API (LAN):    ${BOLD}http://${PI_IP}/api/health${RESET}"
else
  echo -e "  Game URL:     ${BOLD}http://${LOCAL_IP}/${RESET}"
  echo -e "  API health:   ${BOLD}http://${LOCAL_IP}/api/health${RESET}"
fi
echo ""
echo -e "  Service:      ${BOLD}sudo systemctl status allone-garden${RESET}"
echo -e "  Logs:         ${BOLD}sudo journalctl -u allone-garden -f${RESET}"
echo -e "  Config:       ${BOLD}${ENV_FILE}${RESET}"
echo -e "  Later update: ${BOLD}sudo bash ${INSTALL_DIR}/update.sh${RESET}"
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
    echo -e "     • ${CYAN}If port 80/443 is blocked (CGNAT/ISP): use DNS-01.${RESET}"
    echo -e "       Place TransIP credentials at ${BOLD}${TRANSIP_INI}${RESET} and re-run the installer —"
    echo -e "       SSL is then issued and auto-renewed without any open ports."
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
