#!/usr/bin/env bash
# Seed the built-in 梁案 bank with one dated case per business day.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
START=""
LIMIT=10

while [[ $# -gt 0 ]]; do
  case "$1" in
    --start) START="${2:-}"; shift 2 ;;
    --limit) LIMIT="${2:-}"; shift 2 ;;
    *) echo "usage: $0 --start YYYY-MM-DD [--limit N]" >&2; exit 2 ;;
  esac
done

[[ -n "$START" ]] || { echo "--start is required (server business date, not browser date)" >&2; exit 2; }
cd "$ROOT"
[[ -f lib/backend-cli.js ]] || { echo "lib/backend-cli.js missing — run pnpm run build first" >&2; exit 1; }
exec node lib/backend-cli.js case queue seed --start "$START" --limit "$LIMIT" scripts/case-bank.txt
