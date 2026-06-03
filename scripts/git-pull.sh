#!/usr/bin/env bash
# Shared git pull for public HTTPS remotes (no credential prompt hang).
# Usage: git-pull.sh <repo-dir> <unix-user>
set -euo pipefail

REPO_DIR="${1:?repo dir}"
RUN_AS="${2:?user}"

[[ -d "${REPO_DIR}/.git" ]] || { echo "Not a git repo: ${REPO_DIR}" >&2; exit 1; }

run_git() {
  local cmd="$1"
  if [[ "$(id -un)" == "$RUN_AS" ]]; then
    bash -lc "$cmd"
  else
    su -c "$cmd" "$RUN_AS"
  fi
}

# Do not set GIT_ASKPASS=/bin/false — that makes git invoke askpass and fail on
# HTTPS even for public repos. Unset askpass helpers; disable terminal prompts.
run_git "env -u GIT_ASKPASS -u SSH_ASKPASS GIT_TERMINAL_PROMPT=0 \
  git -C '${REPO_DIR}' \
  -c safe.directory='${REPO_DIR}' \
  -c credential.helper= \
  -c core.askPass= \
  fetch --prune origin"

run_git "env -u GIT_ASKPASS -u SSH_ASKPASS GIT_TERMINAL_PROMPT=0 \
  git -C '${REPO_DIR}' \
  -c safe.directory='${REPO_DIR}' \
  -c credential.helper= \
  -c core.askPass= \
  pull --ff-only"
