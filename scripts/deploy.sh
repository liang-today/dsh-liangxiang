#!/usr/bin/env bash
# Deploy the current checkout to the staging backend, preserve the live SQLite
# ledger, verify the new history contract, and only then stamp VERSION.
#
# HARD RULE (AGENTS.md §15): every server update goes through this script. It
# writes `<prefix>/VERSION = "<short-sha> <UTC timestamp>"`, so the deploy state
# is always checkable against `git rev-parse --short HEAD` via deploy-check.sh.
# Never rsync/build/restart the backend by hand — doing so silently leaves the
# server on an unverifiable snapshot.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="${LIANGBIAO_DEPLOY_SSH:-root@203.0.113.11}"
PREFIX="${LIANGBIAO_PREFIX:-/opt/liangbiao}"

cd "$ROOT"
GIT_SHA="$(git rev-parse --short HEAD)"
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "== deploy ${GIT_SHA} -> ${REMOTE}:${PREFIX} =="

# The checkout is the source of truth; node_modules, generated output and local
# state stay out. VERSION is protected until the new process passes smoke checks.
rsync -a --delete \
  --exclude .git \
  --exclude .DS_Store \
  --exclude node_modules \
  --exclude lib \
  --exclude .dsh-home \
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
ENV_FILE="/etc/liangbiao.env"

cd "$PREFIX"
pnpm install --frozen-lockfile
pnpm run build

# Online SQLite backup: node:sqlite's backup API includes WAL state without
# stopping the active service. Never copy only the main DB while WAL is live.
DB_PATH="$(awk -F= '$1 == "LIANGBIAO_BACKEND_DB" { print substr($0, index($0, "=") + 1) }' "$ENV_FILE" | head -1)"
if [[ -z "$DB_PATH" || ! -f "$DB_PATH" ]]; then
  echo "refusing deploy: LIANGBIAO_BACKEND_DB is missing or not a file" >&2
  exit 1
fi
BACKUP_DIR="/var/backups/liangbiao"
BACKUP_PATH="$BACKUP_DIR/liangbiao-${STAMP//:/-}-pre-${GIT_SHA}.sqlite"
mkdir -p "$BACKUP_DIR"
node --input-type=module -e '
  import { DatabaseSync, backup } from "node:sqlite"
  const source = new DatabaseSync(process.argv[1], { readOnly: true })
  await backup(source, process.argv[2])
  source.close()
' "$DB_PATH" "$BACKUP_PATH"
chmod 600 "$BACKUP_PATH"
echo "database backup: $BACKUP_PATH"

systemctl restart liangbiao-backend

BACKEND_PORT="$(awk -F= '$1 == "LIANGBIAO_BACKEND_PORT" { print substr($0, index($0, "=") + 1) }' "$ENV_FILE" | head -1)"
BACKEND_PORT="${BACKEND_PORT:-4180}"
BASE_URL="http://127.0.0.1:${BACKEND_PORT}/v1"
for _ in $(seq 1 30); do
  if curl -fsS --max-time 2 "$BASE_URL/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

systemctl is-active --quiet liangbiao-backend
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
REMOTE_SCRIPT

echo "== deployed version =="
ssh "$REMOTE" "cat '$PREFIX/VERSION'"
ssh "$REMOTE" "systemctl is-active liangbiao-backend" && echo
