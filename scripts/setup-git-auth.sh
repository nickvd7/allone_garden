#!/usr/bin/env bash
# =============================================================================
# Eenmalige GitHub-auth voor de Pi-clone (privé-repo) — daarna nooit meer
# een wachtwoord bij git pull.
#
# Methode SSH (aanbevolen, standaard):
#   bash scripts/setup-git-auth.sh
#   → genereert een SSH-key, toont de public key, je plakt die als Deploy Key
#     op GitHub, daarna werkt git pull zonder prompt.
#
# Methode token (alternatief):
#   GIT_AUTH=token bash scripts/setup-git-auth.sh
#   → slaat een Personal Access Token op via git credential store.
#
# NIET met sudo draaien — run als de gebruiker die de clone bezit (bv. nickvd).
# =============================================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
info()    { echo -e "${CYAN}[git-auth]${RESET} $*"; }
success() { echo -e "${GREEN}[git-auth]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[git-auth]${RESET} $*"; }

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SLUG="${GARDEN_SLUG:-nickvd7/allone_garden}"
METHOD="${GIT_AUTH:-ssh}"

if [[ $EUID -eq 0 && -n "${SUDO_USER:-}" ]]; then
  warn "Draai dit zonder sudo (als ${SUDO_USER}). Herstart…"
  exec sudo -u "$SUDO_USER" -H bash "${BASH_SOURCE[0]}" "$@"
fi

cd "$REPO_DIR"

if [[ "$METHOD" == "token" ]]; then
  # ── Personal Access Token via credential store ─────────────────────────────
  info "Token-methode: origin op HTTPS + credential store"
  git remote set-url origin "https://github.com/${SLUG}.git"
  git config --global credential.helper store
  echo ""
  echo -e "${BOLD}Maak een token aan:${RESET}"
  echo "  1. https://github.com/settings/tokens?type=beta  (Fine-grained token)"
  echo "  2. Repository access → Only select repositories → ${SLUG}"
  echo "  3. Permissions → Contents: Read-only"
  echo "  4. Genereer en kopieer het token (begint met github_pat_…)"
  echo ""
  echo -e "${BOLD}Daarna één keer:${RESET}  git -C ${REPO_DIR} pull"
  echo "  Username: nickvd7"
  echo "  Password: <plak je token>"
  echo "  → wordt opgeslagen in ~/.git-credentials, daarna geen prompt meer."
  exit 0
fi

# ── SSH deploy key (aanbevolen) ───────────────────────────────────────────────
KEY="${HOME}/.ssh/id_ed25519"
mkdir -p "${HOME}/.ssh"; chmod 700 "${HOME}/.ssh"

if [[ ! -f "$KEY" ]]; then
  info "SSH-key genereren (${KEY})…"
  ssh-keygen -t ed25519 -N "" -f "$KEY" -C "allone-garden-pi-$(hostname)"
else
  info "Bestaande SSH-key gevonden (${KEY})"
fi

# github.com aan known_hosts toevoegen (voorkomt host-verificatieprompt)
if ! ssh-keygen -F github.com &>/dev/null; then
  ssh-keyscan -t ed25519,rsa github.com >> "${HOME}/.ssh/known_hosts" 2>/dev/null || true
fi

git remote set-url origin "git@github.com:${SLUG}.git"

echo ""
echo -e "${BOLD}══════════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}1) Kopieer deze public key:${RESET}"
echo ""
cat "${KEY}.pub"
echo ""
echo -e "${BOLD}2) Voeg toe als Deploy Key (read-only) op GitHub:${RESET}"
echo "   https://github.com/${SLUG}/settings/keys/new"
echo "   • Title: raspberrypi"
echo "   • Key:   (plak bovenstaande regel)"
echo "   • 'Allow write access' UIT laten staan"
echo -e "${BOLD}══════════════════════════════════════════════════════════════${RESET}"
echo ""
read -rp "Klaar met toevoegen op GitHub? Druk Enter om te testen… " _ || true

info "Verbinding testen…"
if ssh -o StrictHostKeyChecking=accept-new -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
  success "SSH werkt — git pull vraagt nu nooit meer om een wachtwoord."
else
  warn "Kon nog niet bevestigen. Test handmatig: ssh -T git@github.com"
  warn "En daarna: git -C ${REPO_DIR} pull"
fi

info "Origin staat nu op: $(git remote get-url origin)"
