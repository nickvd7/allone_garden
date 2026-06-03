#!/usr/bin/env bash
# Handmatige git pull + schone install (zelfde repo-map).
#   bash pull-and-install.sh          # git pull als jouw user
#   sudo bash pull-and-install.sh     # pull + install-fresh met sudo
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "▶ git pull"
git pull

if [[ $EUID -eq 0 ]]; then
  export RUN_GIT_PULL=0
  exec bash "${ROOT}/install-fresh.sh"
else
  echo "▶ install-fresh (sudo)"
  exec sudo bash "${ROOT}/install-fresh.sh"
fi
