#!/usr/bin/env bash
# Enqueue or list 梁案 on the staging backend. Does not replace today's
# active case — midnight (or the next ensureActiveCase) consumes the queue.
#
# Usage (on the VPS, curling localhost):
#   bash scripts/queue-case.sh list
#   bash scripts/queue-case.sh add "明日题目是夯还是拉"
#   bash scripts/queue-case.sh add --on 2026-08-20 "指定日题目是夯还是拉"
#
# Immediate replace-today is still: pnpm run publish:case -- "新题是夯还是拉"
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -a; . ./.env; set +a
fi

URL="${LIANGBIAO_BACKEND_URL:-}"
if [ -z "$URL" ] || [ "$URL" = "local" ]; then
  URL="http://127.0.0.1:4180"
fi
KEY="${LIANGBIAO_COMMUNITY_KEY:-}"
if [ -z "$KEY" ]; then
  echo "LIANGBIAO_COMMUNITY_KEY is required" >&2
  exit 1
fi
URL="${URL%/}"
CMD="${1:-}"
shift || true

case "$CMD" in
  list)
    curl -fsS "$URL/v1/admin/queue" -H "x-liangbiao-community-key: $KEY"
    echo
    ;;
  add)
    ON=""
    if [ "${1:-}" = "--on" ]; then
      ON="${2:-}"
      shift 2 || true
    fi
    TITLE="${1:-}"
    if [ -z "$TITLE" ]; then
      echo "usage: $0 add [--on YYYY-MM-DD] \"梁案标题是夯还是拉\"" >&2
      exit 1
    fi
    BODY="$(python3 -c 'import json,sys
title=sys.argv[1]
on=sys.argv[2]
payload={"title": title}
if on:
    payload["publish_on"]=on
print(json.dumps(payload, ensure_ascii=False))
' "$TITLE" "$ON")"
    curl -fsS -X POST "$URL/v1/admin/queue" \
      -H "content-type: application/json; charset=utf-8" \
      -H "x-liangbiao-community-key: $KEY" \
      -d "$BODY"
    echo
    ;;
  *)
    echo "usage: $0 list | add [--on YYYY-MM-DD] \"标题是夯还是拉\"" >&2
    exit 1
    ;;
esac
