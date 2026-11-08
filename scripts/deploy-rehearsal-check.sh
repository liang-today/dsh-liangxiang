#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/load-deploy-target.sh"
source "$ROOT/scripts/deploy-rehearsal-common.sh"
rehearsal_validate_target
rehearsal_require_clean_checkout
deploy_target_preflight
load_deploy_source_version
GIT_SHA="$(git -C "$ROOT" rev-parse --short HEAD)"
"${DEPLOY_SSH[@]}" "$REMOTE" sudo -n bash -s -- "$DEPLOY_EXPECTED_HOSTNAME" "$DEPLOY_STANDBY_PROXY_SHA" "$GIT_SHA" "$PLUGIN_VERSION" "$SERVER_BUILD" <<'CHECK_REHEARSAL'
set -euo pipefail
EXPECTED_HOSTNAME="$1"
EXPECTED_PROXY_SHA="$2"
GIT_SHA="$3"
PLUGIN_VERSION="$4"
SERVER_BUILD="$5"
PREFIX=/opt/liangxiang-rehearsal
ENV_FILE=/etc/liangxiang-rehearsal.env
SERVICE=liangxiang-backend-rehearsal
[[ "$EXPECTED_HOSTNAME" =~ (^|[-.])standby([-.]|$) && ! "$EXPECTED_HOSTNAME" =~ (^|[-.])(prod|production)([-.]|$) ]] || { echo "refusing rehearsal-check: standby hostname required" >&2; exit 1; }
[[ "$(hostname)" == "$EXPECTED_HOSTNAME" ]] || { echo "refusing rehearsal-check: hostname changed" >&2; exit 1; }
[[ "$(sha256sum /etc/caddy/Caddyfile.standby | cut -d ' ' -f 1)" == "$EXPECTED_PROXY_SHA" ]] || { echo "refusing rehearsal-check: standby proxy changed" >&2; exit 1; }
node "$PREFIX/scripts/deploy-target.mjs" receipt "$GIT_SHA" "$SERVER_BUILD" < "$PREFIX/VERSION"
systemctl is-active --quiet "$SERVICE"
[[ "$(systemctl show "$SERVICE" -p WorkingDirectory --value)" == "$PREFIX" ]] || { echo "refusing rehearsal-check: service working directory changed" >&2; exit 1; }
[[ "$(systemctl show "$SERVICE" -p FragmentPath --value)" == /etc/systemd/system/liangxiang-backend-rehearsal.service ]] || { echo "refusing rehearsal-check: unexpected service unit" >&2; exit 1; }
[[ "$(systemctl show "$SERVICE" -p User --value)" == liangxiang && "$(systemctl show "$SERVICE" -p Group --value)" == liangxiang ]] || { echo "refusing rehearsal-check: unexpected service identity" >&2; exit 1; }
ENVIRONMENT="$(systemctl show "$SERVICE" -p EnvironmentFiles --value)"
case "$ENVIRONMENT" in
  "$ENV_FILE (ignore_errors=no)") ;;
  *) echo "refusing rehearsal-check: wrong environment file" >&2; exit 1 ;;
esac
START="$(systemctl show "$SERVICE" -p ExecStart --value)"
case "$START" in
  *"argv[]="*" $PREFIX/lib/rehearsal-backend.js ;"*) ;;
  *) echo "refusing rehearsal-check: wrong backend entrypoint" >&2; exit 1 ;;
esac
cmp -s "$ENV_FILE" "$PREFIX/deploy/liangxiang-rehearsal.env" || { echo "refusing rehearsal-check: rehearsal environment changed" >&2; exit 1; }
curl -fsS --max-time 10 http://127.0.0.1:4195/v1/health | node "$PREFIX/scripts/deploy-target.mjs" health "$PLUGIN_VERSION" "$SERVER_BUILD"
echo "OK: isolated rehearsal service, loopback health, exact build and commit verified."
CHECK_REHEARSAL
