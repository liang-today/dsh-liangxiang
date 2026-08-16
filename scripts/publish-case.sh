#!/usr/bin/env bash
# Publish a new 梁案 on the online backend (community soft trust).
# Archives the current active case, opens a zero-vote successor, and clears
# used incense for the business date. Claimed tokens stay.
#
# Usage:
#   pnpm run publish:case -- "测试发布：梁标是夯还是拉"
#   bash scripts/publish-case.sh "测试发布：梁标是夯还是拉"
#
# Reads LIANGBIAO_BACKEND_URL and LIANGBIAO_COMMUNITY_KEY from the environment
# or .env. Prefer curling 127.0.0.1 on the VPS itself so the key does not
# travel the public network — see docs/121-vps-deploy.md.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -a; . ./.env; set +a
fi

TITLE="${1:-}"
if [ -z "$TITLE" ]; then
  echo "usage: $0 \"梁案标题是夯还是拉\"" >&2
  exit 1
fi
URL="${LIANGBIAO_BACKEND_URL:-}"
if [ -z "$URL" ] || [ "$URL" = "local" ]; then
  echo "LIANGBIAO_BACKEND_URL must point at the online backend (not local)" >&2
  exit 1
fi
KEY="${LIANGBIAO_COMMUNITY_KEY:-}"
if [ -z "$KEY" ]; then
  echo "LIANGBIAO_COMMUNITY_KEY is required" >&2
  exit 1
fi
URL="${URL%/}"
BODY="$(python3 -c 'import json,sys; print(json.dumps({"title": sys.argv[1]}, ensure_ascii=False))' "$TITLE")"
curl -fsS -X POST "$URL/v1/admin/cases" \
  -H "content-type: application/json; charset=utf-8" \
  -H "x-liangbiao-community-key: $KEY" \
  -d "$BODY"
echo
