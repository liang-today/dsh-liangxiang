#!/usr/bin/env bash
# Deploy the current checkout to the staging backend AND stamp a VERSION file.
#
# HARD RULE (AGENTS.md §15): every server update goes through this script. It
# writes `<prefix>/VERSION = "<short-sha> <UTC timestamp>"`, so the deploy state
# is always checkable against `git rev-parse --short HEAD` via deploy-check.sh.
# Never rsync/build/restart the backend by hand — doing so silently leaves the
# server on an unverifiable snapshot.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="${LIANGBIAO_DEPLOY_SSH:-root@124.71.166.225}"
PREFIX="${LIANGBIAO_PREFIX:-/opt/liangbiao}"

cd "$ROOT"
GIT_SHA="$(git rev-parse --short HEAD)"
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "== deploy ${GIT_SHA} -> ${REMOTE}:${PREFIX} =="

# The checkout is the source of truth; node_modules and local state stay out.
rsync -a --delete \
  --exclude .git \
  --exclude node_modules \
  --exclude .dsh-home \
  --exclude .liangbiao-backend \
  --exclude '*.tgz' \
  --exclude .env \
  -e ssh "$ROOT"/ "$REMOTE:$PREFIX/"

# Stamp the version BEFORE the build so a failed build can never masquerade as
# the new version.
printf '%s %s\n' "$GIT_SHA" "$STAMP" | ssh "$REMOTE" "cat > '$PREFIX/VERSION'"

ssh "$REMOTE" "cd '$PREFIX' && pnpm install && pnpm run build && systemctl restart liangbiao-backend"

echo "== deployed version =="
ssh "$REMOTE" "cat '$PREFIX/VERSION'"
ssh "$REMOTE" "systemctl is-active liangbiao-backend" && echo
