#!/usr/bin/env bash
# Verify the staging backend is running the current checkout. Exits 0 when the
# server's VERSION file matches local `git rev-parse --short HEAD`, 1 otherwise.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# The rehearsal instance has its own fixed service, storage and loopback port.
case "${LIANGXIANG_DEPLOY_MODE:-standard}" in
  standard) ;;
  rehearsal) exec bash "$ROOT/scripts/deploy-rehearsal-check.sh" "$@" ;;
  internal-test) exec bash "$ROOT/scripts/deploy-internal-test.sh" check "$@" ;;
  *) echo "refusing deploy: unsupported LIANGXIANG_DEPLOY_MODE" >&2; exit 1 ;;
esac
# shellcheck source=load-deploy-target.sh
source "$ROOT/scripts/load-deploy-target.sh"
PREFIX="${LIANGXIANG_PREFIX:-/opt/liangxiang}"
case "$PREFIX" in
  /opt/liangxiang) ;;
  *) echo "refusing deploy-check: unexpected service prefix" >&2; exit 1 ;;
esac
deploy_target_preflight
load_deploy_source_version

cd "$ROOT"
LOCAL="$(git rev-parse --short HEAD)"
REMOTE_VERSION="$("${DEPLOY_SSH[@]}" "$REMOTE" "sudo -n cat '$PREFIX/VERSION' 2>/dev/null" || true)"

echo "local : ${LOCAL}"
echo "server: ${REMOTE_VERSION:-<missing>}"

if node "$ROOT/scripts/deploy-target.mjs" receipt "$LOCAL" "$SERVER_BUILD" <<< "$REMOTE_VERSION"; then
  "${DEPLOY_SSH[@]}" "$REMOTE" "sudo -n systemctl is-active --quiet liangxiang-backend"
  deploy_health_curl | node "$ROOT/scripts/deploy-target.mjs" health "$PLUGIN_VERSION" "$SERVER_BUILD"
  echo "OK: configured ${DEPLOY_ROLE} target matches the exact build/commit and healthy service."
  exit 0
fi
echo "STALE: server does not match local checkout. Run scripts/deploy.sh." >&2
exit 1
