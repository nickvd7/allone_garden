#!/usr/bin/env bash
# Pas nginx-hardening + overload-guard toe op een bestaande Pi-installatie.
#
# Usage:
#   sudo GARDEN_EMAIL=you@example.com bash scripts/apply-nginx-hardening.sh [install-dir]
#
# Na router-wissel of overload-incident opnieuw draaien is veilig (idempotent).
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Run met sudo"; exit 1; }

INSTALL_DIR="${1:-}"
if [[ -z "$INSTALL_DIR" && -f /etc/systemd/system/allone-garden.service ]]; then
  _wd="$(grep -E '^WorkingDirectory=' /etc/systemd/system/allone-garden.service 2>/dev/null | cut -d= -f2- || true)"
  [[ -n "$_wd" ]] && INSTALL_DIR="$(cd "${_wd}/../.." && pwd)"
fi
[[ -z "$INSTALL_DIR" ]] && INSTALL_DIR="/opt/allone-garden"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[hardening] Install-dir: ${INSTALL_DIR}"

bash "${SCRIPT_DIR}/write-nginx-vhost.sh" "$INSTALL_DIR"
bash "${SCRIPT_DIR}/write-systemd-unit.sh" "$INSTALL_DIR"

# Overload guard + defaults
install -d -m 755 /usr/local/bin
install -m 755 "${SCRIPT_DIR}/overload-guard.sh" /usr/local/bin/allone-garden-overload-guard

if [[ ! -f /etc/default/allone-garden-overload ]]; then
  cat > /etc/default/allone-garden-overload <<'EOF'
# Drempels overload-modus (nginx 503, thuisnetwerk blijft werken)
MAX_HTTPS_CONN=80
MAX_LOAD_1M=3.5
COOLDOWN_CONN=40
COOLDOWN_LOAD=2.0
EOF
  chmod 644 /etc/default/allone-garden-overload
fi

cat > /etc/cron.d/allone-garden-overload <<'CRON'
# Overload guard — elke minuut; bij drukte tijdelijk 503 voor de site
* * * * * root /usr/local/bin/allone-garden-overload-guard
CRON
chmod 644 /etc/cron.d/allone-garden-overload

# fail2ban (zelfde als install-mainserver-pi.sh)
if command -v fail2ban-client &>/dev/null || apt-get install -y -qq fail2ban 2>/dev/null; then
  cat > /etc/fail2ban/filter.d/allone-garden.conf <<'FBEOF'
[Definition]
failregex = ^<HOST>.*"POST /api/auth/(login|register).*" (401|429)
ignoreregex =
FBEOF
  cat > /etc/fail2ban/jail.d/allone-garden.conf <<'FBEOF'
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
  echo "[hardening] fail2ban jail allone-garden"
fi

nginx -t
systemctl restart nginx
systemctl restart allone-garden

if [[ -x "${SCRIPT_DIR}/setup-ssl.sh" && -n "${GARDEN_DOMAIN:-}" ]]; then
  GARDEN_DOMAIN="$GARDEN_DOMAIN" \
    GARDEN_EMAIL="${GARDEN_EMAIL:-}" \
    bash "${SCRIPT_DIR}/setup-ssl.sh" || echo "[hardening] SSL stap overgeslagen — zie setup-ssl.sh"
elif [[ -z "${GARDEN_DOMAIN:-}" ]]; then
  echo "[hardening] Geen GARDEN_DOMAIN — SSL overgeslagen (HTTP/LAN)"
fi

if [[ -x "${SCRIPT_DIR}/ensure-nginx-ssl-hardening.sh" ]]; then
  bash "${SCRIPT_DIR}/ensure-nginx-ssl-hardening.sh" && systemctl reload nginx 2>/dev/null || true
fi

echo "[hardening] Klaar. Test: curl -sS http://127.0.0.1/api/health"
curl -fsS "http://127.0.0.1/api/health" && echo "" || true
echo "[hardening] Overload-log: /var/log/allone-garden-overload.log"
