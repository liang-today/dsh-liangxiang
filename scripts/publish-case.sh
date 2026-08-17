#!/usr/bin/env bash
# Publish a new 梁案 on the VPS via the operator CLI (SQLite in-process).
# HTTP POST /v1/admin/cases is closed — this must run on the machine that
# holds the database.
#
# Usage:
#   pnpm run publish:case -- "测试发布：梁标是夯还是拉"
#   bash scripts/publish-case.sh "测试发布：梁标是夯还是拉"
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
if [ ! -f lib/backend-cli.js ]; then
  echo "lib/backend-cli.js missing — run pnpm run build first" >&2
  exit 1
fi
exec node lib/backend-cli.js case publish "$TITLE"
