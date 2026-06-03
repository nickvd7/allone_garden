#!/usr/bin/env bash
# Haal allone_garden broncode binnen zonder git credentials (publieke repo).
# Methodes: 1) tarball via codeload.github.com  2) git clone zonder prompt
# Usage: fetch-github-tree.sh <doelmap> [ref]
set -euo pipefail

DEST="${1:?doelmap}"
REF="${2:-${GARDEN_GIT_REF:-main}}"
SLUG="nickvd7/allone_garden"
PARENT="$(dirname "$DEST")"
BASE="$(basename "$DEST")"

mkdir -p "$PARENT"
rm -rf "${PARENT}/${BASE}.tmp.$$"
TMP="${PARENT}/${BASE}.tmp.$$"
mkdir -p "$TMP"

fetch_tarball() {
  local url="https://codeload.github.com/${SLUG}/tar.gz/refs/heads/${REF}"
  echo "[fetch] Download ${url}"
  curl -fsSL --connect-timeout 30 --max-time 600 "$url" | tar -xz -C "$TMP" --strip-components=1
}

fetch_git() {
  local url="https://github.com/${SLUG}.git"
  echo "[fetch] git clone ${url} (${REF})"
  env -u GIT_ASKPASS -u SSH_ASKPASS GIT_TERMINAL_PROMPT=0 \
    git -c credential.helper= -c core.askPass= \
    clone --depth=1 --branch "$REF" "$url" "$TMP/repo"
  rsync -a "$TMP/repo/" "$TMP/"
  rm -rf "$TMP/repo"
}

if fetch_tarball 2>/dev/null; then
  :
elif fetch_git 2>/dev/null; then
  :
else
  echo "[fetch] Kon broncode niet ophalen (netwerk of private repo)." >&2
  exit 1
fi

if [[ -d "$DEST" ]]; then
  BACKUP="${DEST}.bak.$(date +%Y%m%d%H%M%S)"
  mv "$DEST" "$BACKUP"
  echo "[fetch] Backup ${DEST} → ${BACKUP}"
fi
mv "$TMP" "$DEST"
echo "[fetch] OK → ${DEST}"
