#!/usr/bin/env bash
# =============================================================================
# Disable Steam integration for local builds and forks that do not publish
# on Steam. Safe to re-run. Does not uninstall packages or edit package.json.
#
# Usage (from repo root):
#   bash scripts/disable-steam.sh
#   npm run steam:disable
#
# Steam is already off when steam_appid.txt / STEAM_APP_ID is 0 (the default).
# To publish on Steam later, see SETUP_CHECKLIST.md.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APPID_FILE="$ROOT/packages/desktop/steam_appid.txt"
ENV_FILE="$ROOT/packages/desktop/.env"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RESET='\033[0m'

if [[ ! -d "$ROOT/packages/desktop" ]]; then
  echo "Could not find packages/desktop — run this from an AllOne Garden clone." >&2
  exit 1
fi

printf '0\n' > "$APPID_FILE"
echo -e "${GREEN}[steam]${RESET} Wrote 0 to packages/desktop/steam_appid.txt"

if [[ -f "$ENV_FILE" ]]; then
  if grep -q '^STEAM_APP_ID=' "$ENV_FILE"; then
    _tmp="$(mktemp)"
    sed 's/^STEAM_APP_ID=.*/STEAM_APP_ID=0/' "$ENV_FILE" > "$_tmp"
    mv "$_tmp" "$ENV_FILE"
  else
    printf '\nSTEAM_APP_ID=0\n' >> "$ENV_FILE"
  fi
  echo -e "${GREEN}[steam]${RESET} Set STEAM_APP_ID=0 in packages/desktop/.env"
else
  echo -e "${YELLOW}[steam]${RESET} No packages/desktop/.env yet — steam_appid.txt is enough (Steam off)."
fi

echo ""
echo "Steam is disabled. The web game and local desktop builds do not need Steamworks."
echo "Do not set GitHub secrets STEAM_USERNAME / STEAM_CONFIG_VDF / STEAM_APP_ID."
echo "Ignore .github/workflows/steam-deploy.yml unless you publish on Steam."
echo "Fork hard-cut (optional): see docs/QUICK_START.md § Steam."
