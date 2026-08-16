#!/usr/bin/env bash
# Credit simulated incense on the local fake ledger. Does not call a model.
#
# Requires `pnpm run dev:web`. Works in local fake AND online staging:
# the credit is display-only when a backend is connected (never claimed).
#
# Usage:
#   pnpm run dev:credit           # +1 炷
#   pnpm run dev:credit -- 9      # +9 炷
#   pnpm run dev:credit -- --tokens 3000
. "$(dirname "$0")/env.sh"

PORT="${LIANGBIAO_DEV_PORT:-3080}"
URL="http://127.0.0.1:${PORT}/liangbiao/api/dev/credit"

sticks=""
tokens=""
if [ "${1:-}" = "--tokens" ]; then
  tokens="${2:?need a positive integer after --tokens}"
elif [ -n "${1:-}" ]; then
  sticks="$1"
else
  sticks=1
fi

if [ -n "$tokens" ]; then
  body=$(printf '{"effectiveTokens":%s}' "$tokens")
else
  body=$(printf '{"sticks":%s}' "$sticks")
fi

echo "POST $URL  $body"
if ! response=$(curl -sS -X POST "$URL" -H 'content-type: application/json' -d "$body"); then
  echo "curl failed. Is \`pnpm run dev:web\` running on port $PORT?" >&2
  exit 1
fi
echo "$response" | python3 -c '
import json, sys
raw = sys.stdin.read()
try:
    data = json.loads(raw)
except json.JSONDecodeError:
    print(raw)
    raise SystemExit(1)
if "error" in data:
    print("error:", data["error"], file=sys.stderr)
    print("Restart pnpm run dev:web so the Host picks up /liangbiao/api/dev/credit.", file=sys.stderr)
    raise SystemExit(1)
personal = data["personal"]
eff = personal["effectiveTokensToday"]
used = personal["usedIncenseToday"]
tpi = personal["tokenPerIncense"]
earned = eff // tpi
print(
    "remaining={remaining}  to_next={to_next}  effective={effective}".format(
        remaining=earned - used,
        to_next=tpi - (eff % tpi),
        effective=eff,
    )
)
'
