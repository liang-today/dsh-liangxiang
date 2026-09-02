#!/usr/bin/env bash
# Back up DSH's rebuildable session projection cache after an alpha schema change.
# Session logs and Liangxiang's two ledgers are intentionally outside this scope.
. "$(dirname "$0")/env.sh"

CACHE_FILE="$DSH_HOME/storages/session_projcache.json"
CACHE_DIR="$DSH_HOME/storages/session_projcache"

if [ ! -e "$CACHE_FILE" ] && [ ! -e "$CACHE_DIR" ]; then
  echo "No session projection cache found under $DSH_HOME/storages."
  exit 0
fi

set +e
node "$REPO_ROOT/scripts/check-dev-projection-cache.mjs" "$DSH_HOME"
CHECK_STATUS=$?
set -e
case "$CHECK_STATUS" in
  0)
    echo "The DSH session projection cache is already compatible; nothing was moved."
    exit 0
    ;;
  2) ;;
  *)
    echo "Could not validate the DSH projection cache; refusing to move it." >&2
    exit "$CHECK_STATUS"
    ;;
esac

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$DSH_HOME/backups/session_projcache/$STAMP"
mkdir -p "$BACKUP_DIR"

if [ -e "$CACHE_FILE" ]; then
  mv "$CACHE_FILE" "$BACKUP_DIR/"
fi
if [ -e "$CACHE_DIR" ]; then
  mv "$CACHE_DIR" "$BACKUP_DIR/"
fi

echo "Backed up the rebuildable DSH projection cache to:"
echo "  $BACKUP_DIR"
echo "Preserved: sessions/, storages/liangxiang.json, and storages/liangxiang_local.json"
echo "Next: pnpm run dev:web"
