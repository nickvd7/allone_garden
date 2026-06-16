#!/usr/bin/env bash
# Genereer hardened nginx vhost voor AllOne Garden.
# Usage: sudo bash scripts/write-nginx-vhost.sh <install-dir> [pi-ip]
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Run met sudo"; exit 1; }

INSTALL_DIR="${1:?install-dir}"
PI_IP="${2:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
DOMAIN="${GARDEN_DOMAIN:-allone.garden}"
BACKEND_PORT=5000

if [[ -f "${INSTALL_DIR}/packages/backend/.env" ]] && grep -q '^PORT=' "${INSTALL_DIR}/packages/backend/.env"; then
  BACKEND_PORT="$(grep '^PORT=' "${INSTALL_DIR}/packages/backend/.env" | cut -d= -f2-)"
fi

read -r -a CERT_DOMAINS <<< "${GARDEN_CERT_DOMAINS:-${DOMAIN} www.${DOMAIN} api.${DOMAIN}}"
SERVER_NAMES="$(IFS=' '; echo "${CERT_DOMAINS[*]}") _ ${PI_IP}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIMITS_SRC="${SCRIPT_DIR}/nginx/allone-garden-limits.conf"
OVERLOAD_HTML_SRC="${SCRIPT_DIR}/nginx/overload-503.html"

[[ -f "$LIMITS_SRC" ]] || { echo "Ontbreekt: $LIMITS_SRC"; exit 1; }
[[ -d "${INSTALL_DIR}/packages/frontend/build" ]] || { echo "Geen frontend build in ${INSTALL_DIR}"; exit 1; }

install -d -m 755 /etc/nginx/conf.d /etc/nginx/snippets
install -m 644 "$LIMITS_SRC" /etc/nginx/conf.d/allone-garden-limits.conf
install -d -m 755 /var/www/allone-garden
install -m 644 "$OVERLOAD_HTML_SRC" /var/www/allone-garden/overload-503.html

chmod -R a+rX "${INSTALL_DIR}/packages/frontend/build"

cat > /etc/nginx/snippets/allone-garden-server.inc <<EOF
    # AllOne Garden hardened server directives (include in elk server-blok)
    if (-f /var/run/allone-garden-overload) {
        return 503;
    }

    error_page 503 /overload-503.html;

    limit_conn ag_global 100;
    limit_conn ag_perip 25;

    add_header X-Frame-Options            "DENY"              always;
    add_header X-Content-Type-Options     "nosniff"           always;
    add_header Referrer-Policy            "strict-origin"     always;
    add_header Permissions-Policy         "camera=(),microphone=(),geolocation=()" always;

    root ${INSTALL_DIR}/packages/frontend/build;
    index index.html;

    gzip on;
    gzip_types text/plain application/json application/javascript text/css;
    gzip_min_length 1024;

    location = /overload-503.html {
        root /var/www/allone-garden;
        internal;
    }

    location /api/auth/ {
        limit_req zone=ag_auth burst=5 nodelay;
        proxy_pass         http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 5s;
        proxy_send_timeout    30s;
        proxy_read_timeout    30s;
    }

    location /api/ {
        limit_req zone=ag_api burst=30 nodelay;
        proxy_pass         http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 5s;
        proxy_send_timeout    60s;
        proxy_read_timeout    60s;
    }

    location /socket.io/ {
        limit_conn ag_perip 8;
        limit_req zone=ag_general burst=10 nodelay;
        proxy_pass         http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host       \$host;
        proxy_read_timeout 86400;
    }

    location = /install.sh {
        alias ${INSTALL_DIR}/install.sh;
        default_type text/x-shellscript;
        add_header Content-Disposition 'attachment; filename="install.sh"';
    }

    location / {
        limit_req zone=ag_general burst=20 nodelay;
        try_files \$uri /index.html;
        expires 1h;
        add_header Cache-Control "public, max-age=3600";
    }

    location ~ /\. { deny all; }
EOF

cat > /etc/nginx/sites-available/allone-garden <<EOF
# AllOne Garden — hardened vhost (scripts/write-nginx-vhost.sh)
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${SERVER_NAMES};

    include /etc/nginx/snippets/allone-garden-server.inc;
}
EOF

ln -sf /etc/nginx/sites-available/allone-garden /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

echo "[nginx] vhost + snippet geschreven → ${INSTALL_DIR} poort ${BACKEND_PORT}"
