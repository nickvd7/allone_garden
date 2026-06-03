#!/usr/bin/env bash
# Herstel veelvoorkomende 500-oorzaken na install (zonder volledige herinstall).
#   sudo bash scripts/fix-production-500.sh [install-dir]
set -euo pipefail

INSTALL_DIR="${1:-}"
[[ -z "$INSTALL_DIR" ]] && INSTALL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${INSTALL_DIR}/packages/backend/.env"
BUILD_DIR="${INSTALL_DIR}/packages/frontend/build"
OWNER="$(stat -c '%U' "${INSTALL_DIR}/packages/backend" 2>/dev/null || echo root)"

[[ $EUID -eq 0 ]] || { echo "Run met sudo"; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "Geen .env in ${ENV_FILE}"; exit 1; }

echo "[fix] Installatie: ${INSTALL_DIR}"

# ADMIN_USERS (security-check blokkeert npm start in production)
if ! grep -q '^ADMIN_USERS=.' "$ENV_FILE" 2>/dev/null; then
  echo "[fix] ADMIN_USERS toevoegen (standaard: admin — pas aan naar je game-username)"
  printf '\nADMIN_USERS=admin\n' >> "$ENV_FILE"
fi

# FRONTEND_URL: voeg LAN-IP toe als alleen https://allone.garden staat
PI_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
if [[ -n "$PI_IP" ]] && grep -q '^FRONTEND_URL=' "$ENV_FILE"; then
  CURRENT="$(grep '^FRONTEND_URL=' "$ENV_FILE" | cut -d= -f2-)"
  if [[ "$CURRENT" != *"$PI_IP"* ]]; then
    sed -i "s|^FRONTEND_URL=.*|FRONTEND_URL=${CURRENT},http://${PI_IP}|" "$ENV_FILE"
    echo "[fix] FRONTEND_URL uitgebreid met http://${PI_IP}"
  fi
fi

chown "${OWNER}:${OWNER}" "$ENV_FILE"
chmod 600 "$ENV_FILE"

if [[ -x "${INSTALL_DIR}/scripts/sync-postgres-env.sh" ]]; then
  bash "${INSTALL_DIR}/scripts/sync-postgres-env.sh" "$INSTALL_DIR" "$OWNER" || true
fi

[[ -d "$BUILD_DIR" ]] && chmod -R a+rX "$BUILD_DIR" && echo "[fix] build leesbaar voor nginx"

if [[ -f /etc/systemd/system/allone-garden.service ]]; then
  # Zorg dat systemd npm start gebruikt (security-check)
  if grep -q 'ExecStart=.*node src/index.js' /etc/systemd/system/allone-garden.service 2>/dev/null; then
    NPM="$(command -v npm)"
    sed -i "s|^ExecStart=.*|ExecStart=${NPM} start|" /etc/systemd/system/allone-garden.service
    systemctl daemon-reload
    echo "[fix] systemd → npm start"
  fi
  systemctl restart allone-garden
  sleep 2
  systemctl is-active allone-garden && echo "[fix] allone-garden actief" || echo "[fix] allone-garden nog niet actief — zie journalctl"
fi

if [[ -x "${INSTALL_DIR}/scripts/fix-nginx-vhost.sh" ]]; then
  bash "${INSTALL_DIR}/scripts/fix-nginx-vhost.sh" "$INSTALL_DIR"
elif systemctl is-active --quiet nginx 2>/dev/null; then
  nginx -t && systemctl restart nginx
fi

echo ""
bash "${INSTALL_DIR}/scripts/diagnose-server.sh" "$INSTALL_DIR" 2>/dev/null || true
