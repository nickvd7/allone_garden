#!/usr/bin/env bash
# =============================================================================
# Volledige herinstallatie Pi — structureel zonder git clone op /opt
#
#   ~/coding/allone_garden     ← git (git pull / git-pull.sh)
#   /opt/allone-garden         ← productie (rsync + install.sh)
#
# Gebruik:
#   cd ~/coding/allone_garden
#   git pull
#   sudo bash reinstall-pi.sh
# =============================================================================
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Run met sudo: sudo bash reinstall-pi.sh"; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY="${ROOT}/scripts/deploy-to-production.sh"
FRESH="${ROOT}/install-fresh.sh"

[[ -x "$DEPLOY" ]] || { echo "Ontbreekt: scripts/deploy-to-production.sh — eerst git pull"; exit 1; }
[[ -f "$FRESH" ]]   || { echo "Ontbreekt: install-fresh.sh"; exit 1; }

# 1) Werk-copy → /opt (geen git clone op /opt)
bash "$DEPLOY"

# 2) Volledige install op /opt (geen tweede clone)
export GARDEN_DIR=/opt/allone-garden
export GARDEN_USER=garden
export FRESH_CLONE=0
export FRESH_INSTALL=1
export RUN_GIT_PULL=0
export GARDEN_DEPLOY=

exec bash "$FRESH"
