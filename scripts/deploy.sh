#!/usr/bin/env bash
# Deploy the current checkout to the community backend, preserve the live
# SQLite ledger, migrate the former Liangbiao service on first v0.5 deploy,
# verify the API contract, and only then stamp VERSION.
#
# HARD RULE (AGENTS.md §15): every server update goes through this script. It
# writes `<prefix>/VERSION = "<short-sha> <UTC timestamp>"`, so the deploy state
# is always checkable against `git rev-parse --short HEAD` via deploy-check.sh.
# Never rsync/build/restart the backend by hand — doing so silently leaves the
# server on an unverifiable snapshot.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="${LIANGXIANG_DEPLOY_SSH:-root@203.0.113.11}"
PREFIX="${LIANGXIANG_PREFIX:-/opt/liangxiang}"

cd "$ROOT"
GIT_SHA="$(git rev-parse --short HEAD)"
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "refusing deploy: checkout has uncommitted changes" >&2
  exit 1
fi

echo "== deploy ${GIT_SHA} -> ${REMOTE}:${PREFIX} =="

# The checkout is the source of truth; node_modules, generated output and local
# state stay out. VERSION is protected until the new process passes smoke checks.
rsync -a --delete \
  --exclude .git \
  --exclude .DS_Store \
  --exclude node_modules \
  --exclude lib \
  --exclude .dsh-home \
  --exclude .liangxiang-backend \
  --exclude .liangbiao-backend \
  --exclude '*.tgz' \
  --exclude .env \
  --exclude VERSION \
  -e ssh "$ROOT"/ "$REMOTE:$PREFIX/"

ssh "$REMOTE" bash -s -- "$PREFIX" "$GIT_SHA" "$STAMP" <<'REMOTE_SCRIPT'
set -euo pipefail

PREFIX="$1"
GIT_SHA="$2"
STAMP="$3"
ENV_FILE="/etc/liangxiang.env"
LEGACY_ENV_FILE="/etc/liangbiao.env"
SERVICE="liangxiang-backend"
LEGACY_SERVICE="liangbiao-backend"
DATA_DIR="/var/lib/liangxiang/data"

LEGACY_WAS_ACTIVE=0
if systemctl is-active --quiet "$LEGACY_SERVICE"; then
  LEGACY_WAS_ACTIVE=1
fi

if ! id -u liangxiang >/dev/null 2>&1; then
  useradd --system --home /var/lib/liangxiang --create-home --shell /usr/sbin/nologin liangxiang
fi
mkdir -p "$DATA_DIR" /var/backups/liangxiang
chown -R liangxiang:liangxiang "$PREFIX" /var/lib/liangxiang

# One-time configuration migration. The old file remains as a rollback copy;
# only the new service reads the transformed file.
if [[ ! -f "$ENV_FILE" ]]; then
  if [[ ! -f "$LEGACY_ENV_FILE" ]]; then
    echo "refusing deploy: neither $ENV_FILE nor $LEGACY_ENV_FILE exists" >&2
    exit 1
  fi
  sed \
    -e 's/^LIANGBIAO_/LIANGXIANG_/' \
    -e 's#/var/lib/liangbiao/data/liangbiao.sqlite#/var/lib/liangxiang/data/liangxiang.sqlite#' \
    "$LEGACY_ENV_FILE" > "$ENV_FILE"
  chmod 640 "$ENV_FILE"
  chown root:liangxiang "$ENV_FILE"
  echo "migrated environment file: $LEGACY_ENV_FILE -> $ENV_FILE"
fi

cd "$PREFIX"
# A remote node_modules created by another pnpm/store version triggers an
# interactive replacement prompt. CI mode makes the frozen reinstall explicit
# and non-interactive; a lock mismatch still fails closed.
CI=1 pnpm install --frozen-lockfile
pnpm run build

DB_PATH="$(awk -F= '$1 == "LIANGXIANG_BACKEND_DB" { print substr($0, index($0, "=") + 1) }' "$ENV_FILE" | head -1)"
if [[ -z "$DB_PATH" ]]; then
  echo "refusing deploy: LIANGXIANG_BACKEND_DB is missing" >&2
  exit 1
fi

# First brand migration (and retry after a failed first migration): copy the
# live legacy database with node:sqlite's online backup API so WAL state is
# included. If rollback restarted the legacy service, always refresh the new
# copy; otherwise a later retry could silently deploy a stale partial copy.
if [[ "$LEGACY_WAS_ACTIVE" -eq 1 || ! -f "$DB_PATH" ]]; then
  LEGACY_DB="$(awk -F= '$1 == "LIANGBIAO_BACKEND_DB" { print substr($0, index($0, "=") + 1) }' "$LEGACY_ENV_FILE" | head -1)"
  if [[ -z "$LEGACY_DB" || ! -f "$LEGACY_DB" ]]; then
    echo "refusing migration: no existing Liangxiang or legacy Liangbiao database" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$DB_PATH")"
  MIGRATION_PATH="${DB_PATH}.migration-${GIT_SHA}-$$"
  node --input-type=module -e '
    import { DatabaseSync, backup } from "node:sqlite"
    const source = new DatabaseSync(process.argv[1], { readOnly: true })
    await backup(source, process.argv[2])
    source.close()
  ' "$LEGACY_DB" "$MIGRATION_PATH"
  systemctl stop "$SERVICE" >/dev/null 2>&1 || true
  rm -f "${DB_PATH}-wal" "${DB_PATH}-shm"
  mv -f "$MIGRATION_PATH" "$DB_PATH"
  chown liangxiang:liangxiang "$DB_PATH"
  chmod 600 "$DB_PATH"
  echo "migrated SQLite ledger into the Liangxiang data directory"
fi

BACKUP_PATH="/var/backups/liangxiang/liangxiang-${STAMP//:/-}-pre-${GIT_SHA}.sqlite"
node --input-type=module -e '
  import { DatabaseSync, backup } from "node:sqlite"
  const source = new DatabaseSync(process.argv[1], { readOnly: true })
  await backup(source, process.argv[2])
  source.close()
' "$DB_PATH" "$BACKUP_PATH"
chmod 600 "$BACKUP_PATH"
echo "database backup: $BACKUP_PATH"

NODE_BIN="$(command -v node)"
sed "s|/usr/bin/node|$NODE_BIN|" deploy/liangxiang-backend.service > /etc/systemd/system/liangxiang-backend.service
systemctl daemon-reload

if [[ "$LEGACY_WAS_ACTIVE" -eq 1 ]]; then
  systemctl stop "$LEGACY_SERVICE"
fi

ROLLED_FORWARD=0
rollback() {
  if [[ "$ROLLED_FORWARD" -eq 1 ]]; then return; fi
  systemctl stop "$SERVICE" >/dev/null 2>&1 || true
  if [[ "$LEGACY_WAS_ACTIVE" -eq 1 ]]; then
    systemctl start "$LEGACY_SERVICE" >/dev/null 2>&1 || true
  fi
}
trap rollback EXIT

systemctl enable "$SERVICE" >/dev/null
systemctl restart "$SERVICE"

BACKEND_PORT="$(awk -F= '$1 == "LIANGXIANG_BACKEND_PORT" { print substr($0, index($0, "=") + 1) }' "$ENV_FILE" | head -1)"
BACKEND_PORT="${BACKEND_PORT:-4180}"
BASE_URL="http://127.0.0.1:${BACKEND_PORT}/v1"
for _ in $(seq 1 30); do
  if curl -fsS --max-time 2 "$BASE_URL/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

systemctl is-active --quiet "$SERVICE"
curl -fsS --max-time 5 "$BASE_URL/health" | node -e '
  const health = JSON.parse(require("node:fs").readFileSync(0, "utf8"))
  if (health.status !== "ok" || health.authority_mode !== "DEV_STAGING_ONLY") {
    throw new Error("unexpected staging health response")
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

# VERSION describes a verified running deployment, not merely an attempted
# file sync. A build/restart/smoke failure leaves the previous stamp in place.
printf '%s %s\n' "$GIT_SHA" "$STAMP" > "$PREFIX/VERSION"
ROLLED_FORWARD=1
trap - EXIT
if systemctl list-unit-files "$LEGACY_SERVICE.service" --no-legend 2>/dev/null | grep -q "$LEGACY_SERVICE"; then
  systemctl disable "$LEGACY_SERVICE" >/dev/null 2>&1 || true
fi
REMOTE_SCRIPT

echo "== deployed version =="
ssh "$REMOTE" "cat '$PREFIX/VERSION'"
ssh "$REMOTE" "systemctl is-active liangxiang-backend" && echo
