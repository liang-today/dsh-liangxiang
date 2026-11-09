#!/usr/bin/env bash
# Deploy the current checkout to the Liangxiang community backend through the
# key-only deployment account. The script builds without privilege, takes an
# online SQLite backup, installs through sudo, verifies health/history, and
# only then stamps VERSION.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# The rehearsal instance has its own fixed service, storage and loopback port.
case "${LIANGXIANG_DEPLOY_MODE:-standard}" in
  standard) ;;
  rehearsal) exec bash "$ROOT/scripts/deploy-rehearsal.sh" "$@" ;;
  internal-test) exec bash "$ROOT/scripts/deploy-internal-test.sh" "$@" ;;
  *) echo "refusing deploy: unsupported LIANGXIANG_DEPLOY_MODE" >&2; exit 1 ;;
esac
# shellcheck source=load-deploy-target.sh
source "$ROOT/scripts/load-deploy-target.sh"
PREFIX="${LIANGXIANG_PREFIX:-/opt/liangxiang}"
STAGE="${LIANGXIANG_DEPLOY_STAGE:-/var/tmp/liangxiang-deploy}"

# Read-only identity/configuration checks run before rsync or any remote write.
deploy_target_preflight
load_deploy_source_version
PREPARE_ONLY="${LIANGXIANG_DEPLOY_PREPARE_ONLY:-0}"
case "$PREPARE_ONLY" in 0|1) ;; *) echo "refusing deploy: prepare-only must be 0 or 1" >&2; exit 1 ;; esac

cd "$ROOT"
GIT_SHA="$(git rev-parse --short HEAD)"
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "refusing deploy: checkout has uncommitted changes" >&2
  exit 1
fi

case "$STAGE" in
  /var/tmp/liangxiang-deploy) ;;
  *) echo "refusing deploy: unexpected stage path: $STAGE" >&2; exit 1 ;;
esac
case "$PREFIX" in
  /opt/liangxiang) ;;
  *) echo "refusing deploy: unexpected service prefix" >&2; exit 1 ;;
esac

echo "== stage ${DEPLOY_ROLE} ${SERVER_BUILD} ${GIT_SHA} -> ${REMOTE}:${STAGE} =="
rsync -a --delete \
  --exclude .git \
  --exclude .DS_Store \
  --exclude node_modules \
  --exclude lib \
  --exclude .dsh-home \
  --exclude .liangxiang-backend \
  --exclude '*.tgz' \
  --exclude .env \
  --exclude VERSION \
  -e "$DEPLOY_RSYNC_SSH" "$ROOT"/ "$REMOTE:$STAGE/"

# Dependency scripts and the TypeScript build run as the unprivileged deploy
# account. Root is used only for the final installation and service lifecycle.
"${DEPLOY_SSH[@]}" "$REMOTE" "cd '$STAGE' && CI=1 npx --yes --package=pnpm@11.28.5 -- pnpm install --frozen-lockfile && CI=1 npx --yes --package=pnpm@11.28.5 -- pnpm run build"

# The fallback machine can hold the exact compiled release without replacing
# its live application, opening a second ledger, or changing its proxy.
if [[ "$PREPARE_ONLY" == 1 ]]; then
  "${DEPLOY_SSH[@]}" "$REMOTE" sudo -n bash -s -- "$STAGE" "$GIT_SHA" "$SERVER_BUILD" "$STAMP" <<'PREPARE_RELEASE'
set -euo pipefail
stage="$1"; sha="$2"; build="$3"; stamp="$4"
root=/var/backups/liangxiang-release
install -d -m 0700 -o root -g root "$root"
[[ ! -L "$root" && ! -L "$root/$sha" ]] || exit 1
install -d -m 0700 -o root -g root "$root/$sha"
tar -czf "$root/$sha/backend.tar.gz" -C "$stage" lib package.json deploy scripts
chmod 0600 "$root/$sha/backend.tar.gz"
printf '%s %s %s\n' "$build" "$sha" "$stamp" > "$root/$sha/VERSION"
sha256sum "$root/$sha/backend.tar.gz" > "$root/$sha/SHA256SUMS"
echo "compiled fallback release prepared; live services and databases unchanged"
PREPARE_RELEASE
  exit 0
fi

echo "== install ${GIT_SHA} -> ${PREFIX} =="
"${DEPLOY_SSH[@]}" "$REMOTE" sudo -n bash -s -- "$PREFIX" "$STAGE" "$GIT_SHA" "$STAMP" "$SERVER_BUILD" "$DEPLOY_ROLE" "$DEPLOY_EXPECTED_HOSTNAME" "$DEPLOY_STANDBY_PROXY_SHA" "$DEPLOY_HEALTH_URL" "$PLUGIN_VERSION" "${DEPLOY_HEALTH_RESOLVE:-}" <<'REMOTE_SCRIPT'
set -euo pipefail

PREFIX="$1"
STAGE="$2"
GIT_SHA="$3"
STAMP="$4"
SERVER_BUILD="$5"
DEPLOY_ROLE="$6"
EXPECTED_HOSTNAME="$7"
STANDBY_PROXY_SHA="$8"
PUBLIC_HEALTH_URL="$9"
PLUGIN_VERSION="${10}"
HEALTH_RESOLVE="${11:-}"
ENV_FILE="/etc/liangxiang.env"
SERVICE="liangxiang-backend"
DATA_DIR="/var/lib/liangxiang/data"
DB_PATH=""

if [[ "$(hostname)" != "$EXPECTED_HOSTNAME" ]]; then
  echo "refusing deploy: remote hostname changed after preflight" >&2
  exit 1
fi
marker=/etc/liangxiang-deploy-role
if [[ "$EXPECTED_HOSTNAME" == liangxiang || -e "$marker" ]]; then
  [[ -f "$marker" && ! -L "$marker" && "$(stat -c '%u:%a' "$marker")" == 0:600 && "$(cat "$marker")" == "$DEPLOY_ROLE" ]] || {
    echo "refusing deploy: role marker changed after preflight" >&2; exit 1;
  }
fi
case "$DEPLOY_ROLE" in
  standby)
    if [[ "$(sha256sum /etc/caddy/Caddyfile.standby | cut -d ' ' -f 1)" != "$STANDBY_PROXY_SHA" ]]; then
      echo "refusing deploy: standby proxy changed after preflight" >&2
      exit 1
    fi
    ;;
  production) ;;
  *) echo "refusing deploy: invalid target role" >&2; exit 1 ;;
esac

if [[ ! -f "$ENV_FILE" ]]; then
  echo "refusing deploy: missing $ENV_FILE" >&2
  exit 1
fi
if ! id -u liangxiang >/dev/null 2>&1; then
  useradd --system --home /var/lib/liangxiang --no-create-home --shell /usr/sbin/nologin liangxiang
fi
# 0.8 admission is ticket-only. Remove the retired shared-key setting without
# ever printing its value into deploy output or process arguments.
ENV_TEMP="$(mktemp /etc/.liangxiang.env.XXXXXX)"
awk '$0 !~ /^LIANGXIANG_COMMUNITY_KEY=/' "$ENV_FILE" > "$ENV_TEMP"
chown root:liangxiang "$ENV_TEMP"
chmod 0640 "$ENV_TEMP"
mv -f "$ENV_TEMP" "$ENV_FILE"
install -d -o root -g liangxiang -m 0750 "$PREFIX"
install -d -o liangxiang -g liangxiang -m 0700 "$DATA_DIR"
install -d -o root -g root -m 0700 /var/backups/liangxiang
chown root:liangxiang "$ENV_FILE"
chmod 0640 "$ENV_FILE"

DB_PATH="$(awk -F= '$1 == "LIANGXIANG_BACKEND_DB" { print substr($0, index($0, "=") + 1) }' "$ENV_FILE" | head -1)"
if [[ -z "$DB_PATH" || ! -f "$DB_PATH" ]]; then
  echo "refusing deploy: LIANGXIANG_BACKEND_DB is missing or does not exist" >&2
  exit 1
fi
case "$DB_PATH" in
  /var/lib/liangxiang/data/*) ;;
  *) echo "refusing deploy: database must be below $DATA_DIR" >&2; exit 1 ;;
esac

BACKUP_PATH="/var/backups/liangxiang/liangxiang-${STAMP//:/-}-pre-${GIT_SHA}.sqlite"
node --input-type=module -e '
  import { DatabaseSync, backup } from "node:sqlite"
  const source = new DatabaseSync(process.argv[1], { readOnly: true })
  await backup(source, process.argv[2])
  source.close()
' "$DB_PATH" "$BACKUP_PATH"
chmod 0600 "$BACKUP_PATH"
echo "database backup: $BACKUP_PATH"

rsync -a --delete \
  --exclude node_modules \
  --exclude VERSION \
  "$STAGE"/ "$PREFIX"/
chown -R root:liangxiang "$PREFIX"
# rsync -a also copies a temporary worktree's private root mode (0700).
# Normalize AFTER copying, otherwise the service user cannot enter its cwd.
chmod 0750 "$PREFIX"

NODE_BIN="$(command -v node)"
sed "s|/usr/bin/node|$NODE_BIN|" "$PREFIX/deploy/liangxiang-backend.service" \
  > /etc/systemd/system/liangxiang-backend.service
restorecon -RF "$PREFIX" "$DATA_DIR" "$ENV_FILE" /etc/systemd/system/liangxiang-backend.service
install -o root -g root -m 0755 "$PREFIX/scripts/liang" /usr/local/bin/liang
restorecon -F /usr/local/bin/liang
systemctl daemon-reload

BACKEND_VERIFIED=0
rollback() {
  # Before health/history pass, a failed candidate must not be left serving.
  # After they pass, later proxy-install failures restore the previous Caddy
  # file and deliberately keep the already-healthy backend available. VERSION
  # remains unstamped so deploy-check still reports the partial deployment.
  if [[ "$BACKEND_VERIFIED" -eq 1 ]]; then return; fi
  systemctl stop "$SERVICE" >/dev/null 2>&1 || true
}
trap rollback EXIT

systemctl enable "$SERVICE" >/dev/null
systemctl restart "$SERVICE"

BACKEND_PORT="$(awk -F= '$1 == "LIANGXIANG_BACKEND_PORT" { print substr($0, index($0, "=") + 1) }' "$ENV_FILE" | head -1)"
BACKEND_PORT="${BACKEND_PORT:-4180}"
BASE_URL="http://127.0.0.1:${BACKEND_PORT}/v1"
for _ in $(seq 1 30); do
  if curl -fsS --max-time 2 "$BASE_URL/health" >/dev/null 2>&1; then break; fi
  sleep 0.5
done

systemctl is-active --quiet "$SERVICE"
curl -fsS --max-time 5 "$BASE_URL/health" | node "$PREFIX/scripts/deploy-target.mjs" health "$PLUGIN_VERSION" "$SERVER_BUILD"
curl -fsS --max-time 5 "$BASE_URL/history" | node -e '
  const history = JSON.parse(require("node:fs").readFileSync(0, "utf8"))
  if (history.schema_version !== 1 || history.archive_schema_version !== 1
      || !Number.isSafeInteger(history.archive_version) || history.archive_version < 0
      || history.full !== true || history.stale !== false
      || !Array.isArray(history.days) || !Array.isArray(history.weeks) || !Array.isArray(history.months)) {
    throw new Error("history contract smoke check failed")
  }
  console.log(`history archive_version=${history.archive_version} days=${history.days.length} weeks=${history.weeks.length} months=${history.months.length}`)
'
BACKEND_VERIFIED=1

# Keep the checked-in reverse-proxy contract in the same atomic deployment.
# This is what makes trusted client-IP forwarding auditable instead of a
# one-off server tweak. Restore the last config if validation/reload fails.
# Begin proxy install (executable isolation contract).
CADDY_BIN="$(command -v caddy || true)"
if [[ -z "$CADDY_BIN" ]]; then
  echo "refusing deploy: Caddy is missing" >&2
  exit 1
fi
if [[ "$DEPLOY_ROLE" == standby ]]; then
  # The standby IP certificate and service drop-in are host-owned. Never copy
  # the production domain template over either active or inactive proxy files.
  CADDY_CONFIG="/etc/caddy/Caddyfile.standby"
  if [[ "$(sha256sum "$CADDY_CONFIG" | cut -d ' ' -f 1)" != "$STANDBY_PROXY_SHA" ]]; then
    echo "refusing deploy: standby proxy changed before validation" >&2
    exit 1
  fi
  "$CADDY_BIN" validate --config "$CADDY_CONFIG"
  if [[ "$(sha256sum "$CADDY_CONFIG" | cut -d ' ' -f 1)" != "$STANDBY_PROXY_SHA" ]]; then
    echo "refusing deploy: standby proxy changed during validation" >&2
    exit 1
  fi
  systemctl is-active --quiet caddy
else
  CADDY_CONFIG="/etc/caddy/Caddyfile"
  if [[ ! -f "$CADDY_CONFIG" ]]; then
    echo "refusing deploy: production Caddy configuration is missing" >&2
    exit 1
  fi
  "$CADDY_BIN" validate --config "$PREFIX/deploy/Caddyfile"
  CADDY_BACKUP="/var/backups/liangxiang/Caddyfile-${STAMP//:/-}-pre-${GIT_SHA}"
  cp --preserve=mode,ownership,timestamps "$CADDY_CONFIG" "$CADDY_BACKUP"
  install -o root -g root -m 0644 "$PREFIX/deploy/Caddyfile" "$CADDY_CONFIG"
  "$CADDY_BIN" fmt --overwrite "$CADDY_CONFIG"
  if ! "$CADDY_BIN" validate --config "$CADDY_CONFIG" || ! systemctl reload caddy; then
    cp --preserve=mode,ownership,timestamps "$CADDY_BACKUP" "$CADDY_CONFIG"
    systemctl reload caddy || true
    echo "Caddy update failed and was rolled back: $CADDY_BACKUP" >&2
    exit 1
  fi
fi

# End proxy install.
CURL_OPTIONS=()
if [[ -n "$HEALTH_RESOLVE" ]]; then CURL_OPTIONS+=(--resolve "$HEALTH_RESOLVE"); fi
curl -fsS --max-time 10 "${CURL_OPTIONS[@]}" "$PUBLIC_HEALTH_URL" | node "$PREFIX/scripts/deploy-target.mjs" health "$PLUGIN_VERSION" "$SERVER_BUILD"
printf '%s %s %s\n' "$SERVER_BUILD" "$GIT_SHA" "$STAMP" > "$PREFIX/VERSION"
trap - EXIT
REMOTE_SCRIPT

echo "== deployed version =="
"${DEPLOY_SSH[@]}" "$REMOTE" "sudo -n cat '$PREFIX/VERSION'"
"${DEPLOY_SSH[@]}" "$REMOTE" "sudo -n systemctl is-active liangxiang-backend" && echo
deploy_health_curl | node "$ROOT/scripts/deploy-target.mjs" health "$PLUGIN_VERSION" "$SERVER_BUILD"
echo "OK: configured ${DEPLOY_ROLE} target health matches ${SERVER_BUILD}."
