#!/usr/bin/env bash
# Deliberately separate from both the ordinary and synthetic-clock rehearsal.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/load-deploy-target.sh"
[[ "$DEPLOY_ROLE" == standby ]] || { echo 'refusing internal-test: standby target required' >&2; exit 1; }
[[ "${LIANGXIANG_PREFIX:-/opt/liangxiang-internal-test}" == /opt/liangxiang-internal-test \
  && "${LIANGXIANG_DEPLOY_STAGE:-/var/tmp/liangxiang-internal-test-deploy}" == /var/tmp/liangxiang-internal-test-deploy ]] \
  || { echo 'refusing internal-test: fixed isolated destinations required' >&2; exit 1; }
[[ -z "$(git -C "$ROOT" status --porcelain)" ]] || { echo 'refusing internal-test: clean committed source required' >&2; exit 1; }
deploy_target_preflight
load_deploy_source_version
GIT_SHA="$(git -C "$ROOT" rev-parse --short HEAD)"
if [[ "${1:-}" == check ]]; then
  "${DEPLOY_SSH[@]}" "$REMOTE" sudo -n bash -s -- "$DEPLOY_EXPECTED_HOSTNAME" "$GIT_SHA" "$PLUGIN_VERSION" "$SERVER_BUILD" <<'CHECK'
set -euo pipefail
[[ "$(hostname)" == "$1" ]] || exit 1
prefix=/opt/liangxiang-internal-test
node "$prefix/scripts/deploy-target.mjs" receipt "$2" "$4" < "$prefix/VERSION"
systemctl is-active --quiet liangxiang-backend-internal-test
[[ "$(systemctl show liangxiang-backend-internal-test -p User --value)" == liangxiang-internal-test ]]
[[ "$(systemctl show liangxiang-backend-internal-test -p WorkingDirectory --value)" == "$prefix" ]]
cmp /etc/liangxiang-internal-test.env "$prefix/deploy/liangxiang-internal-test.env"
curl -fsS --max-time 10 http://127.0.0.1:4196/v1/health | node "$prefix/scripts/deploy-target.mjs" health "$3" "$4"
echo 'OK: isolated internal-test backend, exact source and real business clock verified.'
CHECK
  node --input-type=module - "$DEPLOY_HEALTH_URL" "$PLUGIN_VERSION" "$SERVER_BUILD" <<'HTTPS_CHECK'
const url = new URL('/liangxiang-internal-test/v1/health', process.argv[2])
const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
if (!response.ok || response.headers.get('x-liangxiang-environment') !== 'internal-test') {
  throw new Error('internal-test HTTPS route or environment label mismatch')
}
const health = await response.json()
if (health.version !== process.argv[3] || health.server_build !== process.argv[4]) {
  throw new Error('internal-test HTTPS build mismatch')
}
console.log('OK: allowed client HTTPS route and environment label verified.')
HTTPS_CHECK
  exit
fi
[[ -n "${LIANGXIANG_INTERNAL_ALLOWED_IPS:-}" && "$LIANGXIANG_INTERNAL_ALLOWED_IPS" =~ ^[0-9a-fA-F:.,]+$ ]] \
  || { echo 'refusing internal-test: exact client exit IPs must be supplied privately' >&2; exit 1; }
node --input-type=module - "$LIANGXIANG_INTERNAL_ALLOWED_IPS" <<'IPS'
import { isIP } from 'node:net'
const ips = process.argv[2].split(',')
if (ips.length > 8 || ips.some(ip => !isIP(ip) || ip === '0.0.0.0' || ip === '::')) throw new Error('explicit client IPs required')
IPS
SOURCE="$(mktemp -d)"
trap 'rm -rf "$SOURCE"' EXIT
git -C "$ROOT" archive HEAD | tar -xf - -C "$SOURCE"
STAGE=/var/tmp/liangxiang-internal-test-deploy
"${DEPLOY_SSH[@]}" "$REMOTE" "umask 077; test ! -L '$STAGE'; mkdir -p '$STAGE'"
rsync -a --delete --exclude .git --exclude .DS_Store --exclude node_modules --exclude lib \
  --exclude .env --exclude '.env.*' --exclude '*.sqlite*' --exclude '*.tgz' --exclude VERSION \
  -e "$DEPLOY_RSYNC_SSH" "$SOURCE"/ "$REMOTE:$STAGE/"
"${DEPLOY_SSH[@]}" "$REMOTE" "cd '$STAGE' && CI=1 npx --yes --package=pnpm@11.28.5 -- pnpm install --frozen-lockfile && CI=1 npx --yes --package=pnpm@11.28.5 -- pnpm run build"
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
"${DEPLOY_SSH[@]}" "$REMOTE" sudo -n bash -s -- "$DEPLOY_EXPECTED_HOSTNAME" "$DEPLOY_STANDBY_PROXY_SHA" "$GIT_SHA" "$PLUGIN_VERSION" "$SERVER_BUILD" "$STAMP" "$LIANGXIANG_INTERNAL_ALLOWED_IPS" < "$ROOT/scripts/deploy-internal-test-install.sh"
bash "$0" check
