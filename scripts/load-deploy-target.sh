# Sourced by both deployment commands. All destination checks precede writes.
DEPLOY_TARGET_CONFIG="$(node "$ROOT/scripts/deploy-target.mjs" config "$ROOT/.env")"
while IFS='=' read -r key value; do
  case "$key" in
    LIANGXIANG_DEPLOY_SSH) LIANGXIANG_DEPLOY_SSH="$value" ;;
    LIANGXIANG_DEPLOY_SSH_PORT) LIANGXIANG_DEPLOY_SSH_PORT="$value" ;;
    DEPLOY_ROLE) DEPLOY_ROLE="$value" ;;
    DEPLOY_EXPECTED_HOSTNAME) DEPLOY_EXPECTED_HOSTNAME="$value" ;;
    DEPLOY_HEALTH_URL) DEPLOY_HEALTH_URL="$value" ;;
    DEPLOY_HEALTH_RESOLVE) DEPLOY_HEALTH_RESOLVE="$value" ;;
  esac
done <<< "$DEPLOY_TARGET_CONFIG"
unset DEPLOY_TARGET_CONFIG key value
source "$ROOT/scripts/load-deploy-ssh.sh"

# Keep the heredoc outside a quoted command substitution: macOS Bash 3.2
# otherwise misparses the remote case statement before SSH receives it.
standby_proxy_check_script() {
  cat <<'PROXY_CHECK'
set -euo pipefail
CONFIG=/etc/caddy/Caddyfile.standby
for property in ExecStart ExecReload; do
  value="$(systemctl show caddy -p "$property" --value)"
  case "$value" in
    *"--config $CONFIG "*|*"--config=$CONFIG "*) ;;
    *) echo "refusing deploy: Caddy does not use the standby configuration" >&2; exit 1 ;;
  esac
done
sha256sum "$CONFIG" | cut -d ' ' -f 1
PROXY_CHECK
}

# Read only. Do not source the operator environment or print its contents.
deploy_signed_auth_check_script() {
  cat <<'AUTH_CHECK'
set -euo pipefail
awk '
/^[[:space:]]*LIANGXIANG_ALLOW_UNSIGNED[[:space:]]*=/ {
  value=$0
  sub(/^[^=]*=/, "", value)
  gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
  if (value != "0" && value != "\"0\"" && value != "\0470\047" && value != "") bad=1
}
END {
  if (bad) {
    print "refusing deploy: unsigned authentication must be disabled" > "/dev/stderr"
    exit 1
  }
}' "$1"
AUTH_CHECK
}

deploy_target_preflight() {
  local actual
  actual="$("${DEPLOY_SSH[@]}" -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE" hostname)"
  node "$ROOT/scripts/deploy-target.mjs" hostname "$DEPLOY_EXPECTED_HOSTNAME" <<< "$actual"
  # Generic hostnames require an explicit root-owned role. A forwarder marker
  # also fences accidental restarts of an old production writer after cutover.
  "${DEPLOY_SSH[@]}" "$REMOTE" sudo -n bash -s -- "$DEPLOY_EXPECTED_HOSTNAME" "$DEPLOY_ROLE" <<'ROLE_CHECK'
set -euo pipefail
marker=/etc/liangxiang-deploy-role
if [[ "$1" == liangxiang || -e "$marker" ]]; then
  [[ -f "$marker" && ! -L "$marker" && "$(stat -c '%u:%a' "$marker")" == 0:600 && "$(cat "$marker")" == "$2" ]] || {
    echo "refusing deploy: root-owned role marker does not match target role" >&2; exit 1;
  }
fi
ROLE_CHECK
  deploy_signed_auth_check_script | "${DEPLOY_SSH[@]}" "$REMOTE" sudo -n bash -s -- /etc/liangxiang.env
  DEPLOY_STANDBY_PROXY_SHA="not-used"
  if [[ "$DEPLOY_ROLE" == standby ]]; then
    DEPLOY_STANDBY_PROXY_SHA="$(standby_proxy_check_script | "${DEPLOY_SSH[@]}" "$REMOTE" sudo -n bash -s)"
    if [[ ! "$DEPLOY_STANDBY_PROXY_SHA" =~ ^[a-f0-9]{64}$ ]]; then
      echo "refusing deploy: invalid standby proxy fingerprint" >&2
      exit 1
    fi
  fi
}

deploy_health_curl() {
  if [[ -n "${DEPLOY_HEALTH_RESOLVE:-}" ]]; then
    curl -fsS --max-time 10 --resolve "$DEPLOY_HEALTH_RESOLVE" "$DEPLOY_HEALTH_URL"
  else
    curl -fsS --max-time 10 "$DEPLOY_HEALTH_URL"
  fi
}

load_deploy_source_version() {
  local versions key value
  versions="$(node "$ROOT/scripts/deploy-target.mjs" versions "$ROOT/src/shared/index.ts")"
  while IFS='=' read -r key value; do
    case "$key" in
      PLUGIN_VERSION) PLUGIN_VERSION="$value" ;;
      SERVER_BUILD) SERVER_BUILD="$value" ;;
    esac
  done <<< "$versions"
}
