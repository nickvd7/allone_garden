#!/usr/bin/env bash
# Update a clone without GitHub username/password prompts.
# 1) Resolve origin/main SHA via GitHub API (curl, no git credentials).
# 2) If behind: git fetch from anonymous https://github.com/owner/repo.git
# Usage: git-pull.sh <repo-dir> <unix-user>
set -euo pipefail

REPO_DIR="${1:?repo dir}"
RUN_AS="${2:?user}"

REPO_DIR="$(cd "$REPO_DIR" && pwd)"
[[ -d "${REPO_DIR}/.git" ]] || { echo "[git-pull] Geen git-repo: ${REPO_DIR}" >&2; exit 1; }

# ── Run git as repo owner (no su -c / bash -lc quoting issues) ───────────────
run_git() {
  local -a git_cmd=(
    env -u GIT_ASKPASS -u SSH_ASKPASS
    GIT_TERMINAL_PROMPT=0
    git
    -c "safe.directory=${REPO_DIR}"
    -c safe.directory=*
    -c credential.helper=
    -c core.askPass=
    -C "$REPO_DIR"
  )
  if [[ "$(id -un)" == "$RUN_AS" ]]; then
    "${git_cmd[@]}" "$@"
  elif [[ "$(id -un)" == root ]] && command -v sudo &>/dev/null; then
    sudo -u "$RUN_AS" -H "${git_cmd[@]}" "$@"
  else
    su - "$RUN_AS" -c "$(printf '%q ' "${git_cmd[@]}" "$@")"
  fi
}

parse_github_slug() {
  local url="$1" owner="" repo=""
  if [[ "$url" =~ git@github\.com:([^/]+)/([^/.]+) ]]; then
    owner="${BASH_REMATCH[1]}"; repo="${BASH_REMATCH[2]}"
  elif [[ "$url" =~ github\.com[:/]+([^/@]+)/([^/.]+) ]]; then
    owner="${BASH_REMATCH[1]}"; repo="${BASH_REMATCH[2]}"
  fi
  repo="${repo%.git}"
  if [[ -n "$owner" && -n "$repo" && "$owner" != *@* ]]; then
    printf '%s/%s' "$owner" "$repo"
  fi
}

# GitHub API (public repos) — works without git credentials; run as root OK.
remote_sha_via_api() {
  local slug="$1" branch="$2" json sha=""
  command -v curl &>/dev/null || return 1
  json="$(curl -fsSL --connect-timeout 20 --max-time 40 \
    -H 'Accept: application/vnd.github+json' \
    -H 'User-Agent: allone-garden-update' \
    "https://api.github.com/repos/${slug}/git/refs/heads/${branch}" 2>/dev/null)" || return 1
  sha="$(printf '%s' "$json" | grep -oE '"sha"[[:space:]]*:[[:space:]]*"[a-f0-9]{40}"' | head -1 | grep -oE '[a-f0-9]{40}')" || true
  [[ -n "$sha" ]] && printf '%s' "$sha"
}

remote_sha_via_git() {
  local url="$1" branch="$2"
  run_git ls-remote "$url" "refs/heads/${branch}" 2>/dev/null | awk 'NR==1 {print $1; exit}'
}

ORIGIN="$(run_git remote get-url origin 2>/dev/null || true)"
SLUG="$(parse_github_slug "$ORIGIN")"
SLUG="${SLUG:-nickvd7/allone_garden}"
PUBLIC_URL="https://github.com/${SLUG}.git"

# Embedded credentials in HTTPS origin (https://user@github.com/...) force password prompts.
if [[ "$ORIGIN" == *"@"* ]] && [[ "$ORIGIN" == *github.com* ]]; then
  echo "[git-pull] origin bevat inlognaam — zet om naar anonieme HTTPS URL"
  run_git remote set-url origin "$PUBLIC_URL"
  ORIGIN="$PUBLIC_URL"
fi

BRANCH="$(run_git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"
[[ "$BRANCH" == HEAD ]] && BRANCH=main

LOCAL="$(run_git rev-parse HEAD)"
echo "[git-pull] local ${LOCAL:0:7} branch ${BRANCH} slug ${SLUG}"

REMOTE_SHA="$(remote_sha_via_api "$SLUG" "$BRANCH" || true)"
if [[ -z "$REMOTE_SHA" && "$BRANCH" != main ]]; then
  REMOTE_SHA="$(remote_sha_via_api "$SLUG" main || true)"
  [[ -n "$REMOTE_SHA" ]] && BRANCH=main
fi
if [[ -z "$REMOTE_SHA" ]]; then
  echo "[git-pull] GitHub API unavailable, trying git ls-remote…"
  REMOTE_SHA="$(remote_sha_via_git "$PUBLIC_URL" "$BRANCH" || true)"
fi
if [[ -z "$REMOTE_SHA" && "$BRANCH" != main ]]; then
  BRANCH=main
  REMOTE_SHA="$(remote_sha_via_git "$PUBLIC_URL" main || true)"
fi

if [[ -z "$REMOTE_SHA" ]]; then
  echo "[git-pull] Kon remote HEAD niet bepalen (netwerk, private repo, of oude git-pull.sh)." >&2
  exit 1
fi

if [[ "$LOCAL" == "$REMOTE_SHA" ]]; then
  echo "[git-pull] Already up to date (${LOCAL:0:7})"
  exit 0
fi

echo "[git-pull] Updating ${LOCAL:0:7} → ${REMOTE_SHA:0:7} (${BRANCH})"
if ! run_git fetch --prune "$PUBLIC_URL" "$BRANCH"; then
  echo "[git-pull] fetch failed from ${PUBLIC_URL}" >&2
  exit 1
fi
if ! run_git merge --ff-only FETCH_HEAD; then
  echo "[git-pull] merge --ff-only failed (local commits or dirty tree?)" >&2
  exit 1
fi
echo "[git-pull] Now at $(run_git rev-parse --short HEAD)"

# Anonymous HTTPS remote avoids future username/password prompts on git pull.
if [[ "$ORIGIN" == *"@"* ]] || [[ "$ORIGIN" != "$PUBLIC_URL" ]]; then
  echo "[git-pull] Tip: git remote set-url origin ${PUBLIC_URL}"
fi
