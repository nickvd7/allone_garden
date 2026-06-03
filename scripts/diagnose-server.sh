#!/usr/bin/env bash
# Snelle diagnose bij 500 / lege pagina na deploy op Pi.
#   sudo bash scripts/diagnose-server.sh [install-dir]
set -euo pipefail

INSTALL_DIR="${1:-}"
if [[ -z "$INSTALL_DIR" ]]; then
  for d in /opt/allone-garden "$HOME/coding/allone_garden" "$(cd "$(dirname "$0")/.." && pwd)"; do
    [[ -f "$d/packages/backend/.env" ]] && INSTALL_DIR="$d" && break
  done
fi
[[ -n "$INSTALL_DIR" && -d "$INSTALL_DIR" ]] || { echo "Geen install-dir"; exit 1; }

ENV_FILE="${INSTALL_DIR}/packages/backend/.env"
BUILD_DIR="${INSTALL_DIR}/packages/frontend/build"
PORT=5000
[[ -f "$ENV_FILE" ]] && grep -q '^PORT=' "$ENV_FILE" && PORT="$(grep '^PORT=' "$ENV_FILE" | cut -d= -f2-)"

echo "=== AllOne Garden diagnose ==="
echo "Install: ${INSTALL_DIR}"
echo ""

echo "--- systemd allone-garden ---"
systemctl is-active allone-garden 2>/dev/null || echo "unit niet actief"
systemctl status allone-garden --no-pager -l 2>/dev/null | tail -20 || true
echo ""

echo "--- backend logs (laatste 30 regels) ---"
journalctl -u allone-garden -n 30 --no-pager 2>/dev/null || true
echo ""

echo "--- nginx ---"
nginx -t 2>&1 || true
echo "enabled sites:"; ls -la /etc/nginx/sites-enabled/ 2>/dev/null || true
grep -E '^\s*(root|proxy_pass|server_name)' /etc/nginx/sites-enabled/* 2>/dev/null || true
echo ""

echo "--- frontend build ---"
if [[ -f "${BUILD_DIR}/index.html" ]]; then
  ls -la "${BUILD_DIR}/index.html"
  if id www-data &>/dev/null; then
    if sudo -u www-data test -r "${BUILD_DIR}/index.html"; then
      echo "OK: www-data kan index.html lezen"
    else
      echo "FOUT: www-data kan index.html NIET lezen → nginx 500/403"
      echo "Fix: sudo chmod -R a+rX ${BUILD_DIR}"
    fi
  fi
else
  echo "FOUT: geen ${BUILD_DIR}/index.html — run: cd packages/frontend && npm run build"
fi
echo ""

echo "--- API health (direct backend :${PORT}) ---"
if curl -fsS "http://127.0.0.1:${PORT}/api/health" 2>/dev/null; then
  echo ""
  echo "OK: backend reageert op poort ${PORT}"
else
  echo "FOUT: geen antwoord op http://127.0.0.1:${PORT}/api/health"
  echo "     Backend draait niet of luistert op andere poort"
fi
echo ""

echo "--- API health (via nginx /api/health) ---"
curl -fsS "http://127.0.0.1/api/health" 2>/dev/null && echo "" || echo "FOUT: nginx → backend proxy faalt (502/500)"
echo ""

echo "--- DATABASE_URL test ---"
if [[ -f "$ENV_FILE" ]]; then
  sudo -u "$(stat -c '%U' "$ENV_FILE")" -H bash -c \
    "cd '${INSTALL_DIR}/packages/backend' && node scripts/check-db-connection.js" \
    && echo "OK: PostgreSQL" || echo "FOUT: DATABASE_URL — sudo bash scripts/sync-postgres-env.sh ${INSTALL_DIR} $(stat -c '%U' "$ENV_FILE")"
else
  echo "FOUT: geen .env"
fi
echo ""

echo "--- .env hints ---"
[[ -f "$ENV_FILE" ]] && grep -E '^(NODE_ENV|FRONTEND_URL|ADMIN_USERS|DATABASE_URL)=' "$ENV_FILE" | sed 's/DATABASE_URL=.*/DATABASE_URL=***redacted***/' || true
