#!/usr/bin/env bash
# =============================================================================
# Volledige herinstallatie Raspberry Pi → /opt/allone-garden
#
#   cd ~/coding/allone_garden
#   git pull
#   sudo bash reinstall-pi.sh
#
# Of zonder lokale repo (haalt main van GitHub):
#   curl -fsSL https://raw.githubusercontent.com/nickvd7/allone_garden/main/reinstall-pi.sh | sudo bash
# =============================================================================
export GARDEN_DIR=/opt/allone-garden
export GARDEN_USER=garden
export FRESH_CLONE=1
export FRESH_INSTALL=1
export RUN_GIT_PULL=0

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)/install-fresh.sh"
if [[ ! -f "$SCRIPT" ]]; then
  echo "install-fresh.sh niet gevonden — gebruik curl variant of clone eerst."
  exit 1
fi
exec bash "$SCRIPT"
