#!/usr/bin/env bash
# Reset Liangxiang staging ledgers to "never voted today".
#
# Online (DEV_STAGING_ONLY): wipes the Raspberry Pi SQLite (global 香火/香客/票).
# Offline Host: clears votes / ledgers / aggregates in
#               $DSH_HOME/storages/liangxiang_local.json, but KEEPS local
#               daily_usage. Shared token watermarks and community identity in
#               liangxiang.json are never touched.
#
# Usage:
#   pnpm run reset:staging              # Pi + local Host
#   pnpm run reset:staging -- --local   # only this machine's JSON
#   pnpm run reset:staging -- --pi      # only the Pi database
#
# After running: stop and restart `pnpm run dev:web` (in-memory state would
# otherwise write the old ledger back).
. "$(dirname "$0")/env.sh"

PI_HOST="${LIANGXIANG_STAGING_SSH:-}"
PI_HEALTH_URL="${LIANGXIANG_STAGING_HEALTH_URL:-}"
STORAGE="${DSH_HOME}/storages/liangxiang_local.json"
LOCAL_BACKEND_DIR="${REPO_ROOT}/.liangxiang-backend"

do_pi=1
do_local=1
for arg in "$@"; do
  case "$arg" in
    --local) do_pi=0; do_local=1 ;;
    --pi) do_pi=1; do_local=0 ;;
    -h|--help)
      sed -n '2,16p' "$0"
      exit 0
      ;;
  esac
done

reset_local_json() {
  if [ ! -f "$STORAGE" ]; then
    echo "OK: no Host ledger at $STORAGE"
    return
  fi
  python3 - "$STORAGE" <<'PY'
import json, sys
path = sys.argv[1]
with open(path, encoding='utf-8') as fh:
    data = json.load(fh)
tables = data.setdefault('tables', {})
# Keep identity (same 香客) and token observation (same 香火库存 after re-claim).
tables['ledgers'] = {}
tables['aggregates'] = {}
tables['votes'] = {}
with open(path, 'w', encoding='utf-8') as fh:
    json.dump(data, fh, ensure_ascii=False, indent=2)
    fh.write('\n')
print(f'OK: cleared votes/ledgers/aggregates in {path}')
print('    kept local daily_usage; shared watermarks/community identity were untouched')
PY
}

reset_pi() {
  if [ -z "$PI_HOST" ] || [ -z "$PI_HEALTH_URL" ]; then
    echo "ERROR: --pi requires LIANGXIANG_STAGING_SSH and LIANGXIANG_STAGING_HEALTH_URL" >&2
    exit 2
  fi
  echo "== reset Pi sqlite on $PI_HOST =="
  ssh -o BatchMode=yes -o ConnectTimeout=10 "$PI_HOST" "bash -s" <<'REMOTE'
set -euo pipefail
systemctl --user stop liangxiang-backend
rm -f "$HOME/liangxiang-backend/data/liangxiang.sqlite" \
      "$HOME/liangxiang-backend/data/liangxiang.sqlite-wal" \
      "$HOME/liangxiang-backend/data/liangxiang.sqlite-shm"
systemctl --user start liangxiang-backend
sleep 1
systemctl --user is-active liangxiang-backend
REMOTE
  curl -fsS "$PI_HEALTH_URL"
  echo
}

if [ "$do_pi" = 1 ]; then
  reset_pi
fi

if [ "$do_local" = 1 ]; then
  echo "== reset local Host ledger =="
  reset_local_json
  if [ -d "$LOCAL_BACKEND_DIR" ]; then
    rm -f "$LOCAL_BACKEND_DIR"/*.sqlite "$LOCAL_BACKEND_DIR"/*.sqlite-wal "$LOCAL_BACKEND_DIR"/*.sqlite-shm
    echo "OK: cleared local .liangxiang-backend sqlite (if any)"
  fi
fi

echo
echo "Next: restart WebUI so the Host re-bootstraps an empty case (待开梁)."
echo "  Ctrl+C the current \`pnpm run dev:web\`, then run it again."
echo "Do not hand-edit storages/liangxiang_local.json — use this script."
