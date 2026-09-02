#!/usr/bin/env bash
# Run the browser contract against an already-started real DSH WebUI.
# This script never serves a fixture page and never installs browser binaries.
. "$(dirname "$0")/env.sh"

BASE_URL="${LIANGXIANG_BROWSER_BASE_URL:-}"
AUTH_URL="${LIANGXIANG_BROWSER_AUTH_URL:-}"
if [ -z "$BASE_URL" ]; then
  echo "ERROR: LIANGXIANG_BROWSER_BASE_URL must point at a running DSH WebUI" >&2
  exit 2
fi

COOKIE_FILE="$(mktemp)"
cleanup_browser_probe() { rm -f "$COOKIE_FILE"; }
trap cleanup_browser_probe EXIT

if [ -n "$AUTH_URL" ]; then
  AUTH_STATUS="$(curl -sS -c "$COOKIE_FILE" -o /dev/null -w '%{http_code}' "$AUTH_URL" || true)"
  if [ "$AUTH_STATUS" != "303" ]; then
    echo "ERROR: DSH browser token exchange returned HTTP ${AUTH_STATUS:-none}" >&2
    exit 1
  fi
  ROOT_HTML="$(curl -fsS -b "$COOKIE_FILE" "$BASE_URL/")"
else
  ROOT_HTML="$(curl -fsS "$BASE_URL/")" || {
    echo "ERROR: DSH WebUI is not reachable at $BASE_URL" >&2
    exit 1
  }
fi

if ! grep -q '__DSH_BOOT__.*dsh-liangxiang' <<<"$ROOT_HTML"; then
  echo "ERROR: $BASE_URL is not booted with dsh-liangxiang" >&2
  exit 1
fi

export LIANGXIANG_BROWSER_BASE_URL="$BASE_URL"
PLAYWRIGHT_BIN="$REPO_ROOT/node_modules/.bin/playwright"
if [ ! -x "$PLAYWRIGHT_BIN" ]; then
  echo "ERROR: Playwright missing at $PLAYWRIGHT_BIN; install repository dependencies first" >&2
  exit 1
fi
"$PLAYWRIGHT_BIN" test "$@"
