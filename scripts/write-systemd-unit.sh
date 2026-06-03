#!/usr/bin/env bash
# Schrijf /etc/systemd/system/allone-garden.service (node met volledig pad, geen npm).
# Usage: sudo bash scripts/write-systemd-unit.sh <install-dir> [unix-user]
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Run met sudo"; exit 1; }

INSTALL_DIR="${1:?install-dir}"
# typo allone_garden → allone-garden
if [[ ! -f "${INSTALL_DIR}/packages/backend/.env" && -f "${INSTALL_DIR/_garden/-garden}/packages/backend/.env" ]]; then
  INSTALL_DIR="${INSTALL_DIR/_garden/-garden}"
  echo "[systemd] Pad gecorrigeerd naar ${INSTALL_DIR}"
fi
SERVICE_USER="${2:-$(stat -c '%U' "${INSTALL_DIR}/packages/backend" 2>/dev/null || echo garden)}"
BACKEND_DIR="${INSTALL_DIR}/packages/backend"
ENV_FILE="${BACKEND_DIR}/.env"
NODE_BIN="$(command -v node)"

[[ -x "$NODE_BIN" ]] || { echo "node niet gevonden in PATH"; exit 1; }
[[ -f "${BACKEND_DIR}/src/index.js" ]] || { echo "Geen backend in ${BACKEND_DIR}"; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "Geen .env: ${ENV_FILE}"; exit 1; }

cat > /etc/systemd/system/allone-garden.service <<EOF
[Unit]
Description=AllOne Garden Server
After=network.target postgresql.service redis-server.service
Wants=postgresql.service redis-server.service

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${BACKEND_DIR}
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=NODE_ENV=production
EnvironmentFile=${ENV_FILE}
ExecStart=${NODE_BIN} src/index.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=allone-garden

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable allone-garden
echo "[systemd] Unit geschreven: User=${SERVICE_USER} Workdir=${BACKEND_DIR} ExecStart=${NODE_BIN} src/index.js"
