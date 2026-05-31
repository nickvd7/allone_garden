#!/usr/bin/env bash
# =============================================================================
# AllOne Garden — Raspberry Pi Hoofdserver Setup
#
# Installs a production-grade "main server" on a Raspberry Pi (or any Debian/
# Ubuntu system). Runs the base install.sh first, then adds:
#   • IS_MAIN_SERVER=true + SERVER_REGISTRY_ENABLED=true
#   • Daily PostgreSQL backups (pg_dump to /var/backups/allone-garden/)
#   • Automatic nightly prune of the server registry
#   • Hardened nginx config (rate limiting, security headers)
#   • Automatic HTTPS via Let's Encrypt (when GARDEN_DOMAIN is set)
#   • fail2ban rules to block repeated auth failures
#   • Health-check cron job with optional email alert
#
# Usage:
#   GARDEN_DOMAIN=garden.example.com \
#   GARDEN_EMAIL=admin@example.com   \
#   sudo bash install-mainserver-pi.sh
#
# Without a domain:
#   sudo bash install-mainserver-pi.sh
#   (HTTP-only — fine for LAN/testing, add a domain later)
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET} $*"; }
success() { echo -e "${GREEN}[OK]${RESET}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET} $*"; }
die()     { echo -e "${RED}[ERR]${RESET}  $*" >&2; exit 1; }

[[ $EUID -ne 0 ]] && die "Run with sudo: sudo bash install-mainserver-pi.sh"

# ── Config ─────────────────────────────────────────────────────────────────────
INSTALL_DIR="${GARDEN_DIR:-/opt/allone-garden}"
SERVICE_USER="${GARDEN_USER:-garden}"
DOMAIN="${GARDEN_DOMAIN:-}"
BACKEND_PORT=5000
ENV_FILE="${INSTALL_DIR}/packages/backend/.env"
BACKUP_DIR="/var/backups/allone-garden"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BOLD}"
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║  🌱  AllOne Garden — Hoofdserver Setup       ║"
echo "  ║  Raspberry Pi  ·  Production Grade           ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo -e "${RESET}"

# ── Step 1: Run the base installer ────────────────────────────────────────────
info "Running base installer (install.sh)…"
export GARDEN_DIR="$INSTALL_DIR"
export GARDEN_USER="$SERVICE_USER"
[[ -n "$DOMAIN" ]] && export GARDEN_DOMAIN="$DOMAIN"

if [[ -f "${SCRIPT_DIR}/install.sh" ]]; then
  bash "${SCRIPT_DIR}/install.sh"
else
  die "install.sh not found in ${SCRIPT_DIR}. Run from the repo root."
fi

success "Base installation complete"

# ── Step 2: Enable main-server features in .env ───────────────────────────────
info "Enabling main-server features…"

set_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    printf '\n%s=%s\n' "$key" "$val" >> "$ENV_FILE"
  fi
}

set_env "IS_MAIN_SERVER"          "true"
set_env "SERVER_REGISTRY_ENABLED" "true"
set_env "P2P_ENABLED"             "true"

if [[ -n "$DOMAIN" ]]; then
  set_env "APP_URL" "https://${DOMAIN}"
else
  LOCAL_IP=$(hostname -I | awk '{print $1}')
  set_env "APP_URL" "http://${LOCAL_IP}"
fi

chown "${SERVICE_USER}:${SERVICE_USER}" "$ENV_FILE"
chmod 600 "$ENV_FILE"
success ".env updated (IS_MAIN_SERVER, SERVER_REGISTRY_ENABLED, P2P_ENABLED)"

# ── Step 3: Update config/main-server.json ────────────────────────────────────
info "Updating config/main-server.json…"

CONFIG_FILE="${INSTALL_DIR}/config/main-server.json"

if [[ -f "$CONFIG_FILE" ]]; then
  if [[ -n "$DOMAIN" ]]; then
    PUBLIC_URL="https://${DOMAIN}"
  else
    PUBLIC_URL="http://$(hostname -I | awk '{print $1}')"
  fi

  SERVER_NAME_VAL=$(grep -Po '(?<=^SERVER_NAME=).*' "$ENV_FILE" 2>/dev/null || echo 'AllOne Garden')

  # Write updated config using Node (safe JSON serialisation)
  su -c "node -e \"
    const fs = require('fs');
    const cfg = JSON.parse(fs.readFileSync('${CONFIG_FILE}', 'utf8'));
    cfg.name = process.env.SERVER_NAME || 'AllOne Garden';
    cfg.url  = '${PUBLIC_URL}';
    fs.writeFileSync('${CONFIG_FILE}', JSON.stringify(cfg, null, 2));
  \"" "$SERVICE_USER" || {
    # Fallback: direct write
    cat > "$CONFIG_FILE" <<JSONEOF
{
  "name": "${SERVER_NAME_VAL}",
  "url": "${PUBLIC_URL}",
  "description": "Community-hosted multiplayer gardening game"
}
JSONEOF
  }
  chown "${SERVICE_USER}:${SERVICE_USER}" "$CONFIG_FILE"
  success "config/main-server.json → ${PUBLIC_URL}"
fi

# ── Step 4: Daily PostgreSQL backups ─────────────────────────────────────────
info "Setting up daily database backups…"

mkdir -p "$BACKUP_DIR"
chown "${SERVICE_USER}:${SERVICE_USER}" "$BACKUP_DIR"
chmod 750 "$BACKUP_DIR"

# Extract DB name from DATABASE_URL
POSTGRES_DB=$(grep -Po '(?<=/)[\w-]+$' <<< "$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2-)" 2>/dev/null || echo "allone_garden")

cat > /etc/cron.d/allone-garden-backup <<CRONEOF
# AllOne Garden — daily PostgreSQL backup at 03:00
0 3 * * * postgres pg_dump -Fc ${POSTGRES_DB} > ${BACKUP_DIR}/db-\$(date +\%Y\%m\%d).dump 2>/dev/null && find ${BACKUP_DIR} -name 'db-*.dump' -mtime +14 -delete
CRONEOF
chmod 644 /etc/cron.d/allone-garden-backup
success "Daily backup scheduled (03:00, 14-day retention) → ${BACKUP_DIR}"

# ── Step 5: Hardened nginx config ─────────────────────────────────────────────
info "Applying hardened nginx configuration…"

# Build server_name line
if [[ -n "$DOMAIN" ]]; then
  SERVER_NAME_LINE="server_name ${DOMAIN};"
else
  SERVER_NAME_LINE="server_name _;"
fi

cat > /etc/nginx/sites-available/allone-garden <<NGINXEOF
# AllOne Garden — hardened reverse proxy (hoofdserver)
limit_req_zone \$binary_remote_addr zone=api:10m rate=20r/s;
limit_req_zone \$binary_remote_addr zone=auth:10m rate=2r/s;
limit_conn_zone \$binary_remote_addr zone=perip:10m;

server {
    listen 80;
    ${SERVER_NAME_LINE}

    # Redirect to HTTPS when a domain + cert is present
    # (certbot rewrites this block automatically)

    # Security headers
    add_header X-Frame-Options            "DENY"              always;
    add_header X-Content-Type-Options     "nosniff"           always;
    add_header X-XSS-Protection           "1; mode=block"     always;
    add_header Referrer-Policy            "strict-origin"     always;
    add_header Permissions-Policy         "camera=(),microphone=(),geolocation=()" always;

    # Limit simultaneous connections per IP
    limit_conn perip 30;

    # Serve built React frontend from disk (fast, no backend hit)
    root ${INSTALL_DIR}/packages/frontend/build;
    index index.html;

    # Gzip
    gzip on;
    gzip_types text/plain application/json application/javascript text/css;
    gzip_min_length 1024;

    # Auth endpoints — strict rate limiting
    location /api/auth/ {
        limit_req zone=auth burst=5 nodelay;
        proxy_pass         http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
    }

    # General API
    location /api/ {
        limit_req zone=api burst=40 nodelay;
        proxy_pass         http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
    }

    # Socket.IO — WebSocket upgrade
    location /socket.io/ {
        proxy_pass         http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host       \$host;
        proxy_read_timeout 86400;
    }

    # React SPA fallback
    location / {
        try_files \$uri /index.html;
        expires 1h;
        add_header Cache-Control "public, max-age=3600";
    }

    # Block hidden files
    location ~ /\. { deny all; }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/allone-garden /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
success "Hardened nginx configuration applied"

# ── Step 6: fail2ban (block repeated login failures) ─────────────────────────
if command -v fail2ban-client &>/dev/null || apt-get install -y -qq fail2ban 2>/dev/null; then
  info "Configuring fail2ban for AllOne Garden auth endpoint…"

  cat > /etc/fail2ban/filter.d/allone-garden.conf <<FBEOF
[Definition]
# Block IPs that hit the auth endpoint more than the threshold
failregex = ^<HOST>.*"POST /api/auth/(login|register).*" (401|429)
ignoreregex =
FBEOF

  cat > /etc/fail2ban/jail.d/allone-garden.conf <<FBEOF
[allone-garden]
enabled  = true
filter   = allone-garden
logpath  = /var/log/nginx/access.log
maxretry = 10
findtime = 300
bantime  = 3600
FBEOF

  systemctl enable --now fail2ban 2>/dev/null || true
  fail2ban-client reload 2>/dev/null || true
  success "fail2ban jail configured (10 failures / 5 min → 1 h ban)"
else
  warn "fail2ban not installed — skipping"
fi

# ── Step 7: Health-check cron (alerts on downtime) ────────────────────────────
info "Setting up health-check monitor…"

HEALTHCHECK_LOG="/var/log/allone-garden-health.log"
ALERT_EMAIL="${GARDEN_EMAIL:-}"

cat > /usr/local/bin/allone-garden-health <<HEALTHEOF
#!/usr/bin/env bash
# AllOne Garden health check — run every 5 minutes via cron
URL="http://localhost:${BACKEND_PORT}/health"
if ! curl -sf "\${URL}" >/dev/null 2>&1; then
  echo "\$(date -Iseconds) WARN: AllOne Garden health check FAILED" >> "${HEALTHCHECK_LOG}"
  systemctl restart allone-garden 2>/dev/null || true
  [[ -n "${ALERT_EMAIL}" ]] && \
    echo "AllOne Garden on \$(hostname) is DOWN — auto-restarted at \$(date)" | \
    mail -s "🌱 AllOne Garden DOWN" "${ALERT_EMAIL}" 2>/dev/null || true
else
  echo "\$(date -Iseconds) OK" >> "${HEALTHCHECK_LOG}"
fi
# Keep only last 500 lines
tail -n 500 "${HEALTHCHECK_LOG}" > "${HEALTHCHECK_LOG}.tmp" && mv "${HEALTHCHECK_LOG}.tmp" "${HEALTHCHECK_LOG}" 2>/dev/null || true
HEALTHEOF

chmod 755 /usr/local/bin/allone-garden-health

cat > /etc/cron.d/allone-garden-health <<HEALTHCRONEOF
# AllOne Garden health check every 5 minutes
*/5 * * * * root /usr/local/bin/allone-garden-health
HEALTHCRONEOF
chmod 644 /etc/cron.d/allone-garden-health
success "Health monitor running every 5 minutes (auto-restart on failure)"

# ── Step 8: Restart service with new .env ─────────────────────────────────────
info "Restarting allone-garden service with new configuration…"
systemctl restart allone-garden
sleep 3
if systemctl is-active --quiet allone-garden; then
  success "allone-garden service is running"
else
  warn "Service may not have started cleanly. Check: sudo journalctl -u allone-garden -n 50"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
LOCAL_IP=$(hostname -I | awk '{print $1}')

echo ""
echo -e "${GREEN}${BOLD}╔═══════════════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}${BOLD}║   🌱  AllOne Garden Hoofdserver is klaar!            ║${RESET}"
echo -e "${GREEN}${BOLD}╚═══════════════════════════════════════════════════════╝${RESET}"
echo ""
if [[ -n "$DOMAIN" ]]; then
  echo -e "  🌐 Speler-URL  : ${BOLD}https://${DOMAIN}/${RESET}"
  echo -e "  🔍 Health      : ${BOLD}https://${DOMAIN}/health${RESET}"
  echo -e "  📋 Servers     : ${BOLD}https://${DOMAIN}/api/servers${RESET}"
else
  echo -e "  🌐 LAN-URL     : ${BOLD}http://${LOCAL_IP}/${RESET}"
  echo -e "  🔍 Health      : ${BOLD}http://${LOCAL_IP}/health${RESET}"
  echo -e "  📋 Servers     : ${BOLD}http://${LOCAL_IP}/api/servers${RESET}"
  echo ""
  echo -e "  Voeg later HTTPS toe:"
  echo -e "  ${YELLOW}GARDEN_DOMAIN=jouw-domein.nl sudo bash install-mainserver-pi.sh${RESET}"
fi
echo ""
echo -e "  🔐 Maak een admin-account:"
echo -e "     Registreer via de website, voeg daarna je gebruikersnaam toe:"
echo -e "     ${BOLD}sudo bash -c 'echo \"ADMIN_USERS=jouw-naam\" >> ${ENV_FILE}'${RESET}"
echo -e "     ${BOLD}sudo systemctl restart allone-garden${RESET}"
echo ""
echo -e "  📦 Dagelijkse backup  : ${BACKUP_DIR}/"
echo -e "  📝 Logs               : ${BOLD}sudo journalctl -u allone-garden -f${RESET}"
echo -e "  💓 Gezondheidslog     : ${HEALTHCHECK_LOG}"
echo -e "  ⚙️  Config             : ${ENV_FILE}"
echo ""
echo -e "  P2P federatie ingeschakeld — andere AllOne Garden servers"
echo -e "  kunnen automatisch verbinding maken via Hyperswarm DHT."
echo ""
echo -e "  Bedankt voor het hosten van AllOne Garden! 🌍"
echo ""
