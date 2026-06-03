#!/usr/bin/env bash
# Herstel nginx vhost: default_server + LAN-IP, root = echte install-map.
#   sudo bash scripts/fix-nginx-vhost.sh [install-dir]
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Run met sudo"; exit 1; }

INSTALL_DIR="${1:-}"
if [[ -z "$INSTALL_DIR" && -f /etc/systemd/system/allone-garden.service ]]; then
  _wd="$(grep -E '^WorkingDirectory=' /etc/systemd/system/allone-garden.service 2>/dev/null | cut -d= -f2- || true)"
  if [[ -n "$_wd" ]]; then
    INSTALL_DIR="$(cd "${_wd}/../.." && pwd)"
  fi
fi
if [[ -z "$INSTALL_DIR" ]]; then
  for d in /opt/allone-garden "$HOME/coding/allone_garden"; do
    [[ -f "$d/packages/backend/.env" ]] && INSTALL_DIR="$d" && break
  done
fi
[[ -n "$INSTALL_DIR" && -d "${INSTALL_DIR}/packages/frontend/build" ]] \
  || { echo "Geen geldige install-dir met frontend build: ${INSTALL_DIR:-?}"; exit 1; }

BACKEND_PORT=5000
[[ -f "${INSTALL_DIR}/packages/backend/.env" ]] \
  && grep -q '^PORT=' "${INSTALL_DIR}/packages/backend/.env" \
  && BACKEND_PORT="$(grep '^PORT=' "${INSTALL_DIR}/packages/backend/.env" | cut -d= -f2-)"

PI_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
DOMAIN="${GARDEN_DOMAIN:-allone.garden}"
CERT_DOMAINS="${DOMAIN} www.${DOMAIN} api.${DOMAIN}"

info() { echo "[nginx-fix] $*"; }

info "Install: ${INSTALL_DIR}"
info "Build:   ${INSTALL_DIR}/packages/frontend/build"
info "IP:      ${PI_IP:-<none>}"

chmod -R a+rX "${INSTALL_DIR}/packages/frontend/build"

cat > /etc/nginx/sites-available/allone-garden <<EOF
# AllOne Garden — gegenereerd door fix-nginx-vhost.sh
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${CERT_DOMAINS} _ ${PI_IP};

    root ${INSTALL_DIR}/packages/frontend/build;
    index index.html;

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

    location /socket.io/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_read_timeout 86400;
    }

    location = /install.sh {
        alias ${INSTALL_DIR}/install.sh;
        default_type text/x-shellscript;
        add_header Content-Disposition 'attachment; filename="install.sh"';
    }

    location / {
        try_files \$uri /index.html;
    }
}
EOF

ln -sf /etc/nginx/sites-available/allone-garden /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
nginx -t
systemctl restart nginx
info "OK — nginx herstart. Test: curl -sS http://127.0.0.1/api/health"
curl -fsS "http://127.0.0.1/api/health" && echo "" || warn "curl zonder Host faalt nog — probeer in browser via http://${PI_IP}/"
