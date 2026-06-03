#!/usr/bin/env bash
# Herstel 502/500: .env, PostgreSQL, systemd (node), nginx vhost.
#   sudo bash scripts/fix-production-500.sh /opt/allone-garden
set -euo pipefail

INSTALL_DIR="${1:-}"
[[ -z "$INSTALL_DIR" ]] && INSTALL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${INSTALL_DIR}/packages/backend/.env"
BUILD_DIR="${INSTALL_DIR}/packages/frontend/build"
OWNER="$(stat -c '%U' "${INSTALL_DIR}/packages/backend" 2>/dev/null || echo garden)"

[[ $EUID -eq 0 ]] || { echo "Run met sudo"; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "Geen .env in ${ENV_FILE}"; exit 1; }

echo "[fix] Installatie: ${INSTALL_DIR} (user: ${OWNER})"

if ! grep -q '^ADMIN_USERS=.' "$ENV_FILE" 2>/dev/null; then
  printf '\nADMIN_USERS=admin\n' >> "$ENV_FILE"
  echo "[fix] ADMIN_USERS=admin toegevoegd"
fi

PI_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
if [[ -n "$PI_IP" ]] && grep -q '^FRONTEND_URL=' "$ENV_FILE"; then
  CURRENT="$(grep '^FRONTEND_URL=' "$ENV_FILE" | cut -d= -f2-)"
  if [[ "$CURRENT" != *"$PI_IP"* ]]; then
    sed -i "s|^FRONTEND_URL=.*|FRONTEND_URL=${CURRENT},http://${PI_IP}|" "$ENV_FILE"
    echo "[fix] FRONTEND_URL + http://${PI_IP}"
  fi
fi

chown "${OWNER}:${OWNER}" "$ENV_FILE"
chmod 600 "$ENV_FILE"

if [[ -x "${INSTALL_DIR}/scripts/sync-postgres-env.sh" ]]; then
  bash "${INSTALL_DIR}/scripts/sync-postgres-env.sh" "$INSTALL_DIR" "$OWNER" || true
fi

[[ -d "$BUILD_DIR" ]] && chmod -R a+rX "$BUILD_DIR"

# systemd: altijd node met volledig pad (npm start faalt vaak onder systemd)
WRITE_UNIT="${INSTALL_DIR}/scripts/write-systemd-unit.sh"
[[ -x "$WRITE_UNIT" ]] || WRITE_UNIT="$(dirname "$0")/write-systemd-unit.sh"
if [[ -x "$WRITE_UNIT" ]]; then
  bash "$WRITE_UNIT" "$INSTALL_DIR" "$OWNER"
else
  NODE_BIN="$(command -v node)"
  sed -i "s|^ExecStart=.*|ExecStart=${NODE_BIN} src/index.js|" /etc/systemd/system/allone-garden.service 2>/dev/null || true
  systemctl daemon-reload
fi

systemctl restart allone-garden
sleep 3
if systemctl is-active --quiet allone-garden; then
  echo "[fix] allone-garden actief"
else
  echo "[fix] FOUT — service start niet. Laatste logs:"
  journalctl -u allone-garden -n 25 --no-pager || true
  exit 1
fi

if curl -fsS "http://127.0.0.1:5000/api/health" >/dev/null; then
  echo "[fix] Backend OK op :5000"
else
  echo "[fix] Backend reageert niet op :5000"
  exit 1
fi

NGINX_FIX="${INSTALL_DIR}/scripts/fix-nginx-vhost.sh"
[[ -x "$NGINX_FIX" ]] || NGINX_FIX="$(dirname "$0")/fix-nginx-vhost.sh"
[[ -x "$NGINX_FIX" ]] && bash "$NGINX_FIX" "$INSTALL_DIR"

if curl -fsS "http://127.0.0.1/api/health" >/dev/null; then
  echo "[fix] nginx → backend OK"
else
  echo "[fix] nginx proxy nog fout — run: sudo bash scripts/fix-nginx-vhost.sh ${INSTALL_DIR}"
fi
