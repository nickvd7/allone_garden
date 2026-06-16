#!/usr/bin/env bash
# Zorg dat elk SSL server-blok de hardened include heeft (na certbot wijzigingen).
set -euo pipefail

SITE="/etc/nginx/sites-enabled/allone-garden"
SNIPPET_MARKER="allone-garden-server.inc"
INCLUDE_LINE="    include /etc/nginx/snippets/${SNIPPET_MARKER};"

[[ -f "$SITE" ]] || exit 0
grep -q "$SNIPPET_MARKER" "$SITE" && exit 0

TMP="$(mktemp)"
awk -v inc="$INCLUDE_LINE" '
  /^[[:space:]]*server[[:space:]]*\{/ { in_server=1; printed_include=0 }
  in_server && /ssl_certificate/ && !printed_include {
    print inc
    printed_include=1
  }
  { print }
' "$SITE" > "$TMP" && mv "$TMP" "$SITE"

if ! grep -q "$SNIPPET_MARKER" "$SITE"; then
  # Geen ssl_certificate gevonden — include na eerste server_name in elk server-blok
  TMP="$(mktemp)"
  awk -v inc="$INCLUDE_LINE" '
    /^[[:space:]]*server[[:space:]]*\{/ { in_server=1; after_name=0 }
    in_server && /^[[:space:]]*server_name/ { print; after_name=1; next }
    in_server && after_name && !done { print inc; done=1; after_name=0 }
    { print }
  ' "$SITE" > "$TMP" && mv "$TMP" "$SITE"
fi

nginx -t
