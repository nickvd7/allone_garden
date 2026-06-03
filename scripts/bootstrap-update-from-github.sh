#!/usr/bin/env bash
# Haal de nieuwste update.sh + git-pull.sh binnen zonder git pull (curl van GitHub).
# Handig als git pull om credentials vraagt maar je wel wilt updaten.
set -euo pipefail

ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
REF="${GARDEN_GIT_REF:-main}"
BASE="https://raw.githubusercontent.com/nickvd7/allone_garden/${REF}"

mkdir -p "${ROOT}/scripts"
curl -fsSL "${BASE}/update.sh" -o "${ROOT}/update.sh"
curl -fsSL "${BASE}/scripts/git-pull.sh" -o "${ROOT}/scripts/git-pull.sh"
chmod +x "${ROOT}/update.sh" "${ROOT}/scripts/git-pull.sh"
echo "OK: ${ROOT}/update.sh en scripts/git-pull.sh bijgewerkt van ${REF}"
echo "Run: cd ${ROOT} && sudo bash update.sh"
