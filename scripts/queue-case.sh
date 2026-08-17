#!/usr/bin/env bash
# Enqueue or list 梁案 via the operator CLI (SQLite in-process). HTTP
# /v1/admin/queue is closed.
#
# Usage (on the VPS):
#   bash scripts/queue-case.sh list
#   bash scripts/queue-case.sh add "明日题目是夯还是拉"
#   bash scripts/queue-case.sh add --on 2026-08-20 "指定日题目是夯还是拉"
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -a; . ./.env; set +a
fi

if [ ! -f lib/backend-cli.js ]; then
  echo "lib/backend-cli.js missing — run pnpm run build first" >&2
  exit 1
fi

CMD="${1:-}"
shift || true

case "$CMD" in
  list)
    exec node lib/backend-cli.js case queue list
    ;;
  add)
    exec node lib/backend-cli.js case queue add "$@"
    ;;
  *)
    echo "usage: $0 list | add [--on YYYY-MM-DD] \"标题是夯还是拉\"" >&2
    exit 1
    ;;
esac
