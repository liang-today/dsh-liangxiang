#!/usr/bin/env bash
# Reload the reviewed production proxy without deploying the application or DB.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/load-deploy-target.sh"
[[ "$DEPLOY_ROLE" == production ]] || { echo 'refusing proxy deploy: production role required' >&2; exit 1; }
cd "$ROOT"
[[ -z "$(git status --porcelain)" ]] || { echo 'refusing proxy deploy: checkout is not clean' >&2; exit 1; }
deploy_target_preflight
load_deploy_source_version
deploy_health_curl | node "$ROOT/scripts/deploy-target.mjs" health "$PLUGIN_VERSION" "$SERVER_BUILD"
sha="$(git rev-parse HEAD)"
config_sha="$(shasum -a 256 deploy/Caddyfile | cut -d ' ' -f 1)"
previous_sha="$("${DEPLOY_SSH[@]}" "$REMOTE" sudo -n sha256sum /etc/caddy/Caddyfile | cut -d ' ' -f 1)"
stage="$("${DEPLOY_SSH[@]}" "$REMOTE" 'umask 077; mktemp /var/tmp/liangxiang-proxy.XXXXXXXX')"
[[ "$stage" =~ ^/var/tmp/liangxiang-proxy\.[a-zA-Z0-9]{8}$ ]] || exit 1
cleanup() { "${DEPLOY_SSH[@]}" "$REMOTE" "rm -f '$stage'"; }
trap cleanup EXIT
"${DEPLOY_SSH[@]}" "$REMOTE" "cat > '$stage'" < deploy/Caddyfile
"${DEPLOY_SSH[@]}" "$REMOTE" sudo -n bash -s -- "$stage" "$sha" "$config_sha" "$previous_sha" "$DEPLOY_EXPECTED_HOSTNAME" <<'INSTALL_PROXY'
set -euo pipefail
stage="$1"; sha="$2"; expected="$3"; previous="$4"; expected_host="$5"
[[ "$(hostname)" == "$expected_host" ]] || exit 1
marker=/etc/liangxiang-deploy-role
[[ -f "$marker" && ! -L "$marker" && "$(stat -c '%u:%a' "$marker")" == 0:600 && "$(cat "$marker")" == production ]] || exit 1
[[ -f "$stage" && ! -L "$stage" && "$(sha256sum "$stage" | cut -d ' ' -f 1)" == "$expected" ]] || exit 1
config=/etc/caddy/Caddyfile
[[ "$(sha256sum "$config" | cut -d ' ' -f 1)" == "$previous" ]] || { echo 'refusing proxy deploy: configuration changed' >&2; exit 1; }
for property in ExecStart ExecReload; do
  value="$(systemctl show caddy -p "$property" --value)"
  case "$value" in *"--config $config "*|*"--config=$config "*) ;; *) echo 'refusing proxy deploy: unexpected active proxy file' >&2; exit 1 ;; esac
done
systemctl is-active --quiet liangxiang-backend
pid="$(systemctl show liangxiang-backend -p MainPID --value)"
version="$(cat /opt/liangxiang/VERSION)"
caddy validate --config "$stage" --adapter caddyfile
stamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
install -d -m 0700 /var/backups/liangxiang
backup="/var/backups/liangxiang/Caddyfile-${stamp}-pre-proxy-${sha}"
cp --preserve=mode,ownership,timestamps "$config" "$backup"
changed=0
rollback() {
  code=$?
  if [[ "$code" != 0 && "$changed" == 1 ]]; then
    cp --preserve=mode,ownership,timestamps "$backup" "$config"
    systemctl reload caddy || true
    echo 'Proxy configuration restored after failed verification' >&2
  fi
  exit "$code"
}
trap rollback EXIT
changed=1
install -o root -g root -m 0644 "$stage" "$config"
restorecon -F "$config"
caddy validate --config "$config"
systemctl reload caddy
systemctl is-active --quiet caddy
[[ "$(systemctl show liangxiang-backend -p MainPID --value)" == "$pid" && "$(cat /opt/liangxiang/VERSION)" == "$version" ]] || { echo 'Application changed during proxy deployment' >&2; exit 1; }
curl -fsS --max-time 5 http://127.0.0.1:4180/v1/health >/dev/null
curl -fsS --max-time 5 -D - -o /dev/null -X OPTIONS -H 'Origin: https://liang.today' -H 'Access-Control-Request-Method: GET' -H 'Access-Control-Request-Headers: x-liangxiang-liangzi-policy' https://api.liang.today/v1/snapshot | tr -d '\r' | grep -qi '^access-control-allow-origin: \*$'
install -o root -g root -m 0644 "$stage" /opt/liangxiang/deploy/Caddyfile
printf '%s %s %s\n' "$sha" "$expected" "$stamp" > /opt/liangxiang/PROXY_VERSION
echo "Proxy deployed: $sha; application PID and VERSION unchanged; rollback: $backup"
trap - EXIT
INSTALL_PROXY
deploy_health_curl | node "$ROOT/scripts/deploy-target.mjs" health "$PLUGIN_VERSION" "$SERVER_BUILD"
