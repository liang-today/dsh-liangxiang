#!/usr/bin/env bash
# Deploy the current checkout to the Liangxiang community backend through the
# key-only deployment account. The script builds without privilege, takes an
# online SQLite backup, installs through sudo, verifies health/history, and
# only then stamps VERSION.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="${LIANGXIANG_DEPLOY_SSH:-deploy-user@203.0.113.10}"
PREFIX="${LIANGXIANG_PREFIX:-/opt/liangxiang}"
STAGE="${LIANGXIANG_DEPLOY_STAGE:-/var/tmp/liangxiang-deploy}"

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

echo "== stage ${GIT_SHA} -> ${REMOTE}:${STAGE} =="
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
  -e ssh "$ROOT"/ "$REMOTE:$STAGE/"

# Dependency scripts and the TypeScript build run as the unprivileged deploy
# account. Root is used only for the final installation and service lifecycle.
ssh "$REMOTE" "cd '$STAGE' && CI=1 pnpm install --frozen-lockfile && pnpm run build"

echo "== install ${GIT_SHA} -> ${PREFIX} =="
ssh "$REMOTE" sudo -n bash -s -- "$PREFIX" "$STAGE" "$GIT_SHA" "$STAMP" <<'REMOTE_SCRIPT'
set -euo pipefail

PREFIX="$1"
STAGE="$2"
GIT_SHA="$3"
STAMP="$4"
ENV_FILE="/etc/liangxiang.env"
SERVICE="liangxiang-backend"
DATA_DIR="/var/lib/liangxiang/data"
DB_PATH=""

if [[ ! -f "$ENV_FILE" ]]; then
  echo "refusing deploy: missing $ENV_FILE" >&2
  exit 1
fi
if ! id -u liangxiang >/dev/null 2>&1; then
  useradd --system --home /var/lib/liangxiang --no-create-home --shell /usr/sbin/nologin liangxiang
fi
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

NODE_BIN="$(command -v node)"
sed "s|/usr/bin/node|$NODE_BIN|" "$PREFIX/deploy/liangxiang-backend.service" \
  > /etc/systemd/system/liangxiang-backend.service
restorecon -RF "$PREFIX" "$DATA_DIR" "$ENV_FILE" /etc/systemd/system/liangxiang-backend.service
systemctl daemon-reload

VERIFIED=0
rollback() {
  if [[ "$VERIFIED" -eq 1 ]]; then return; fi
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
curl -fsS --max-time 5 "$BASE_URL/health" | node -e '
  const health = JSON.parse(require("node:fs").readFileSync(0, "utf8"))
  if (health.status !== "ok" || health.authority_mode !== "DEV_STAGING_ONLY") {
    throw new Error("unexpected community health response")
  }
'
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

printf '%s %s\n' "$GIT_SHA" "$STAMP" > "$PREFIX/VERSION"
VERIFIED=1
trap - EXIT
REMOTE_SCRIPT

echo "== deployed version =="
ssh "$REMOTE" "sudo -n cat '$PREFIX/VERSION'"
ssh "$REMOTE" "sudo -n systemctl is-active liangxiang-backend" && echo
