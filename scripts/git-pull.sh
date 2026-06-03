#!/usr/bin/env bash
# Update a clone without GitHub username/password prompts.
# Public repos: anonymous ls-remote + fetch (no credentials).
# Usage: git-pull.sh <repo-dir> <unix-user>
set -euo pipefail

REPO_DIR="${1:?repo dir}"
RUN_AS="${2:?user}"

[[ -d "${REPO_DIR}/.git" ]] || { echo "Not a git repo: ${REPO_DIR}" >&2; exit 1; }

GIT_ENV="env -u GIT_ASKPASS -u SSH_ASKPASS GIT_TERMINAL_PROMPT=0"
GIT_BASE="${GIT_ENV} git -C '${REPO_DIR}' -c safe.directory='${REPO_DIR}' -c credential.helper= -c core.askPass=''"

run_git() {
  local cmd="$1"
  if [[ "$(id -un)" == "$RUN_AS" ]]; then
    bash -lc "$cmd"
  else
    su -c "$cmd" "$RUN_AS"
  fi
}

# github.com/owner/repo from origin URL (HTTPS with optional user@, or git@)
parse_github_slug() {
  local url="$1" owner="" repo=""
  if [[ "$url" =~ git@github\.com:([^/]+)/([^/.]+)(\.git)?$ ]]; then
    owner="${BASH_REMATCH[1]}"; repo="${BASH_REMATCH[2]}"
  elif [[ "$url" =~ github\.com[:/]+([^/]+)/([^/.]+)(\.git)? ]]; then
    owner="${BASH_REMATCH[1]}"; repo="${BASH_REMATCH[2]}"
  fi
  owner="${owner#git@github.com:}"
  if [[ -n "$owner" && -n "$repo" ]]; then
    printf '%s/%s' "$owner" "$repo"
  fi
}

ORIGIN="$(run_git "${GIT_BASE} remote get-url origin" 2>/dev/null || true)"
SLUG="$(parse_github_slug "$ORIGIN")"
PUBLIC_URL="https://github.com/${SLUG:-nickvd7/allone_garden}.git"

BRANCH="$(run_git "${GIT_BASE} rev-parse --abbrev-ref HEAD" 2>/dev/null || echo main)"
[[ "$BRANCH" == HEAD ]] && BRANCH=main

LOCAL="$(run_git "${GIT_BASE} rev-parse HEAD")"

REMOTE_SHA="$(
  run_git "${GIT_BASE} ls-remote '${PUBLIC_URL}' 'refs/heads/${BRANCH}'" 2>/dev/null \
    | awk 'NR==1 {print $1}'
)"

if [[ -z "$REMOTE_SHA" && "$BRANCH" != main ]]; then
  BRANCH=main
  REMOTE_SHA="$(
    run_git "${GIT_BASE} ls-remote '${PUBLIC_URL}' 'refs/heads/main'" 2>/dev/null \
      | awk 'NR==1 {print $1}'
  )"
fi

if [[ -z "$REMOTE_SHA" ]]; then
  echo "Could not read refs from ${PUBLIC_URL} (private repo or offline)." >&2
  echo "Run 'git pull' manually in ${REPO_DIR}, then:" >&2
  echo "  UPDATE_SKIP_GIT_PULL=1 sudo bash update.sh" >&2
  exit 1
fi

if [[ "$LOCAL" == "$REMOTE_SHA" ]]; then
  echo "Repository already up to date (${LOCAL:0:7} on ${BRANCH})"
  exit 0
fi

echo "Updating ${LOCAL:0:7} → ${REMOTE_SHA:0:7} (${BRANCH}) from ${PUBLIC_URL}…"
run_git "${GIT_BASE} fetch --prune '${PUBLIC_URL}' '${BRANCH}'"
run_git "${GIT_BASE} merge --ff-only FETCH_HEAD"
echo "Repository updated to $(run_git "${GIT_BASE} rev-parse --short HEAD")"
