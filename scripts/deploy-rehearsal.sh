#!/usr/bin/env bash
# Enter only through scripts/deploy.sh with LIANGXIANG_DEPLOY_MODE=rehearsal.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/load-deploy-target.sh"
source "$ROOT/scripts/deploy-rehearsal-common.sh"
rehearsal_validate_target
rehearsal_require_clean_checkout
deploy_target_preflight
FULL_SHA="$(git -C "$ROOT" rev-parse HEAD)"
GIT_SHA="$(git -C "$ROOT" rev-parse --short "$FULL_SHA")"
SOURCE="$(mktemp -d)"
trap 'rm -rf "$SOURCE"' EXIT
# Freeze exactly the clean commit. Later edits in another app cannot slip into
# the uploaded files while VERSION continues to name this original SHA.
git -C "$ROOT" archive "$FULL_SHA" | tar -xf - -C "$SOURCE"
VERSIONS="$(node "$ROOT/scripts/deploy-target.mjs" versions "$SOURCE/src/shared/index.ts")"
while IFS='=' read -r key value; do
  case "$key" in PLUGIN_VERSION) PLUGIN_VERSION="$value";; SERVER_BUILD) SERVER_BUILD="$value";; esac
done <<< "$VERSIONS"
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "== stage isolated rehearsal ${SERVER_BUILD} ${GIT_SHA} =="
# The stage directory is separate from the ordinary deployer's workspace.
"${DEPLOY_SSH[@]}" "$REMOTE" bash -s -- "$REHEARSAL_STAGE" <<'STAGE_SCRIPT'
set -euo pipefail
[[ "$1" == /var/tmp/liangxiang-rehearsal-deploy && ! -L "$1" ]] || exit 1
umask 077
mkdir -p "$1"
STAGE_SCRIPT
rsync -a --delete \
  --exclude .git --exclude .DS_Store --exclude node_modules --exclude lib \
  --exclude .dsh-home --exclude .liangxiang-backend --exclude '*.tgz' \
  --exclude .env --exclude '.env.*' --exclude '*.sqlite*' --exclude '*.db' \
  --exclude '*.log' --exclude coverage --exclude test-results --exclude playwright-report \
  --exclude VERSION \
  -e "$DEPLOY_RSYNC_SSH" "$SOURCE"/ "$REMOTE:$REHEARSAL_STAGE/"
"${DEPLOY_SSH[@]}" "$REMOTE" "cd '$REHEARSAL_STAGE' && CI=1 npx --yes --package=pnpm@11.28.5 -- pnpm install --frozen-lockfile && CI=1 npx --yes --package=pnpm@11.28.5 -- pnpm run build && test -f lib/rehearsal-backend.js"

# The installer has no configurable production paths and receives no secrets.
"${DEPLOY_SSH[@]}" "$REMOTE" sudo -n bash -s -- "$DEPLOY_EXPECTED_HOSTNAME" "$DEPLOY_STANDBY_PROXY_SHA" "$GIT_SHA" "$STAMP" "$PLUGIN_VERSION" "$SERVER_BUILD" "$REHEARSAL_SEED_MODE" < "$ROOT/scripts/deploy-rehearsal-install.sh"
echo "== verify isolated rehearsal =="
bash "$ROOT/scripts/deploy-rehearsal-check.sh"
