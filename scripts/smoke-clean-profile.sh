#!/usr/bin/env bash
# Clean-profile smoke test:
#  1. build + pack a tarball
#  2. install web-app + the tarball into a FRESH profile
#  3. assert the bundle layer appears in dump-config
#  4. boot the WebUI, assert the client bundle is served with the loader
#     banner and that the boot graph lists the plugin
#  5. tear everything down (bounded waits everywhere)
. "$(dirname "$0")/env.sh"

node "$REPO_ROOT/scripts/check-dsh-runtime.mjs"

smoke_pnpm_cli() {
  # Preview re-baselines may intentionally target an exact, source-audited
  # DSH package younger than pnpm 11's 24h window. Keep this escape hatch in
  # the disposable clean-profile smoke; normal dev/install commands retain
  # the repository's supply-chain policy.
  if [ "${LIANGXIANG_ALLOW_FRESH_DSH:-0}" = "1" ]; then
    PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 command pnpm --config.minimumReleaseAge=0 "$@"
  else
    command pnpm "$@"
  fi
}

smoke_dsh_cli() {
  smoke_pnpm_cli exec dsh "$@"
}

# Explicit smoke-only override is applied after env.sh/.env. A clean-profile
# smoke must never contact a configured community backend by accident; online
# coverage requires an explicit LIANGXIANG_SMOKE_BACKEND_URL (or smoke:online).
if [ -n "${LIANGXIANG_SMOKE_BACKEND_URL:-}" ]; then
  export LIANGXIANG_BACKEND_URL="$LIANGXIANG_SMOKE_BACKEND_URL"
else
  export LIANGXIANG_BACKEND_URL="local"
fi

# A Profile is not isolated if it shares DSH's global storage domains. Older
# session-projection records can make a newly installed current DSH fail before
# Liangxiang even boots, so the smoke gets a throwaway DSH_HOME by default.
SMOKE_TEMP_HOME=""
if [ -n "${LIANGXIANG_SMOKE_DSH_HOME:-}" ]; then
  export DSH_HOME="$LIANGXIANG_SMOKE_DSH_HOME"
else
  SMOKE_TEMP_HOME="$(mktemp -d)"
  export DSH_HOME="$SMOKE_TEMP_HOME"
fi

SMOKE_PROFILE="${LIANGXIANG_SMOKE_PROFILE:-liangxiang-smoke}"
PORT="${LIANGXIANG_SMOKE_PORT:-3981}"
SERVER_PID=""
BROWSER_SMOKE="${LIANGXIANG_SMOKE_BROWSER:-0}"
BOOT_LOG=""
AUTH_COOKIE=""
ROOT_HTML=""
CLIENT_BUNDLE=""

case "$BROWSER_SMOKE" in
  0|1) ;;
  *) echo "ERROR: LIANGXIANG_SMOKE_BROWSER must be 0 or 1" >&2; exit 2 ;;
esac

# Browser checks use a deterministic authority inside this throwaway Profile.
# An explicit mode wins; otherwise an explicit smoke backend selects online,
# while the safe default remains local before the Host process starts.
if [ "$BROWSER_SMOKE" = "1" ] && [ -z "${LIANGXIANG_SMOKE_SWITCH_MODE:-}" ]; then
  if [ -n "${LIANGXIANG_SMOKE_BACKEND_URL:-}" ]; then
    LIANGXIANG_SMOKE_SWITCH_MODE="online"
  else
    LIANGXIANG_SMOKE_SWITCH_MODE="local"
    LIANGXIANG_SMOKE_EXPECT_AUTHORITY="${LIANGXIANG_SMOKE_EXPECT_AUTHORITY:-LOCAL_FAKE_DEV}"
  fi
fi

cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    # Bounded drain: dsh gives the tree up to 5s; wait a little longer.
    for _ in $(seq 1 10); do
      kill -0 "$SERVER_PID" 2>/dev/null || break
      sleep 1
    done
    kill -9 "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  [ -n "$BOOT_LOG" ] && rm -f "$BOOT_LOG"
  [ -n "$AUTH_COOKIE" ] && rm -f "$AUTH_COOKIE"
  [ -n "$ROOT_HTML" ] && rm -f "$ROOT_HTML"
  [ -n "$CLIENT_BUNDLE" ] && rm -f "$CLIENT_BUNDLE"
  if [ -n "$SMOKE_TEMP_HOME" ]; then
    rm -rf "$SMOKE_TEMP_HOME"
  else
    rm -rf "${DSH_HOME:?}/profiles/$SMOKE_PROFILE"
  fi
  [ -n "${TARBALL:-}" ] && rm -f "./$TARBALL"
}
trap cleanup EXIT

echo "== 1/5 build + pack =="
smoke_pnpm_cli run build
TARBALL="$(smoke_pnpm_cli pack --silent | tail -n 1)"
echo "packed: $TARBALL"

echo "== 2/5 fresh profile install =="
rm -rf "${DSH_HOME:?}/profiles/$SMOKE_PROFILE"
# Let the pinned DSH CLI create its own current Profile template, then append
# the same explicit native-build decisions audited for this repository. The
# no-op pnpm help command gives us a safe seam before the first package add.
smoke_dsh_cli plugin --profile "$SMOKE_PROFILE" help >/dev/null
node "$REPO_ROOT/scripts/prepare-smoke-profile-policy.mjs" \
  "$DSH_HOME/profiles/$SMOKE_PROFILE/pnpm-workspace.yaml" \
  "$REPO_ROOT/pnpm-workspace.yaml"
smoke_dsh_cli plugin --profile "$SMOKE_PROFILE" add "$WEB_APP_SPEC"
# This is a prebuilt local tarball produced in step 1. Do not execute package
# lifecycle scripts again inside the Profile; the smoke is testing the packed
# artifacts, not granting a second install-time code path.
smoke_dsh_cli plugin --profile "$SMOKE_PROFILE" add --ignore-scripts "./$TARBALL"
# In-box bundles must come from the installation, never from a profile-local
# copy — see the comment in dev-install.sh (duplicate module instances break
# the tool scheduler's symbol seam).
smoke_pnpm_cli --dir "$DSH_HOME/profiles/$SMOKE_PROFILE" remove "${WEB_APP_SPEC%@*}" >/dev/null
node "$REPO_ROOT/scripts/assert-profile-modules.mjs" "$DSH_HOME/profiles/$SMOKE_PROFILE"

echo "== 3/5 dump-config layer =="
smoke_dsh_cli --profile "$SMOKE_PROFILE" --dump-config | grep -n "dsh-liangxiang"

echo "== 4/5 boot + probe =="
BOOT_LOG="$(mktemp)"
DSH_BIN="$REPO_ROOT/node_modules/.bin/dsh"
if [ ! -x "$DSH_BIN" ]; then
  echo "ERROR: DSH CLI missing at $DSH_BIN; install repository dependencies first" >&2
  exit 1
fi
"$DSH_BIN" --profile "$SMOKE_PROFILE" --port "$PORT" --no-open >"$BOOT_LOG" 2>&1 &
SERVER_PID=$!
# Out of the job table: suppresses the shell's async "Terminated" notice on teardown.
disown "$SERVER_PID" 2>/dev/null || true

BASE="http://127.0.0.1:$PORT"
UP=""
AUTH_URL=""
AUTH_COOKIE="$(mktemp)"
for _ in $(seq 1 60); do
  AUTH_URL="$(sed -n 's/^dsh web: \(http:\/\/[^ ]*token=[A-Za-z0-9_-]*\).*/\1/p' "$BOOT_LOG" | tail -n 1)"
  if [ -n "$AUTH_URL" ]; then
    AUTH_STATUS="$(curl -sS -c "$AUTH_COOKIE" -o /dev/null -w '%{http_code}' "$AUTH_URL" || true)"
    if [ "$AUTH_STATUS" = "303" ]; then UP=1; break; fi
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then break; fi
  sleep 1
done
if [ -z "$UP" ]; then
  echo "ERROR: WebUI did not come up on $BASE" >&2
  cat "$BOOT_LOG" >&2
  exit 1
fi

# Current DSH advertises immutable, revisioned combo resources instead of a
# stable one-plugin URL. Resolve the resource from the authenticated boot HTML
# so this probe exercises the public client-module contract rather than a
# stale internal URL shape.
ROOT_HTML="$(mktemp)"
curl -sf -b "$AUTH_COOKIE" -o "$ROOT_HTML" "$BASE/"
CLIENT_PATH="$(node -e '
  const html = require("node:fs").readFileSync(process.argv[1], "utf8")
  const attrs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1])
  const resource = attrs.find((value) => value.includes("/plugins/??") && value.includes("dsh-liangxiang/client.js"))
  if (resource === undefined) process.exit(2)
  process.stdout.write(resource.replaceAll("&amp;", "&"))
' "$ROOT_HTML")"
CLIENT_BUNDLE="$(mktemp)"
CLIENT_STATUS="$(curl -sS -b "$AUTH_COOKIE" -o "$CLIENT_BUNDLE" -w '%{http_code}' \
  "$BASE$CLIENT_PATH" || true)"
if [ "$CLIENT_STATUS" != "200" ]; then
  echo "ERROR: client bundle returned HTTP ${CLIENT_STATUS:-none}" >&2
  exit 1
fi
if grep -Fq 'window.__ModuleLoader__.load(' "$CLIENT_BUNDLE" && \
    grep -Fq '"dsh-liangxiang"' "$CLIENT_BUNDLE"; then
  echo "client combo served with Liangxiang loader registration"
else
  echo "ERROR: client combo omitted the Liangxiang loader registration" >&2
  exit 1
fi

if grep -q '__DSH_BOOT__.*dsh-liangxiang' "$ROOT_HTML"; then
  echo "boot graph lists dsh-liangxiang"
else
  echo "ERROR: dsh-liangxiang missing from __DSH_BOOT__ graph" >&2
  exit 1
fi

HOST_LOG="$DSH_HOME/logs/liangxiang.log"
if [ -f "$HOST_LOG" ] && grep -q '\[dsh-liangxiang\] host half active' "$HOST_LOG"; then
  echo "host half activated"
else
  echo "ERROR: host lifecycle marker missing from $HOST_LOG" >&2
  cat "$BOOT_LOG" >&2
  exit 1
fi

if [ -n "${LIANGXIANG_SMOKE_SWITCH_MODE:-}" ]; then
  case "$LIANGXIANG_SMOKE_SWITCH_MODE" in
    online|local) ;;
    *) echo "ERROR: LIANGXIANG_SMOKE_SWITCH_MODE must be online or local" >&2; exit 2 ;;
  esac
  MODE_RESPONSE="$(mktemp)"
  MODE_STATUS=""
  for _ in $(seq 1 20); do
    MODE_STATUS="$(curl -sS -o "$MODE_RESPONSE" -w '%{http_code}' -X POST "$BASE/liangxiang/api/mode" \
      -H 'content-type: application/json' \
      -H 'x-liangxiang-mode-action: configure' \
      --data "{\"mode\":\"$LIANGXIANG_SMOKE_SWITCH_MODE\"}" || true)"
    [ "$MODE_STATUS" = "200" ] && break
    sleep 0.25
  done
  if [ "$MODE_STATUS" != "200" ]; then
    echo "ERROR: mode selection returned HTTP ${MODE_STATUS:-none}" >&2
    cat "$MODE_RESPONSE" >&2
    rm -f "$MODE_RESPONSE"
    exit 1
  fi
  rm -f "$MODE_RESPONSE"
  echo "explicit mode selection: $LIANGXIANG_SMOKE_SWITCH_MODE"
fi

if [ -n "${LIANGXIANG_SMOKE_EXPECT_AUTHORITY:-}" ]; then
  ACTUAL_AUTHORITY="$(curl -sf "$BASE/liangxiang/api/state" | node -e '
    const value = JSON.parse(require("node:fs").readFileSync(0, "utf8"))
    if (typeof value.authorityMode !== "string") process.exit(2)
    process.stdout.write(value.authorityMode)
  ')"
  if [ "$ACTUAL_AUTHORITY" != "$LIANGXIANG_SMOKE_EXPECT_AUTHORITY" ]; then
    echo "ERROR: expected authority $LIANGXIANG_SMOKE_EXPECT_AUTHORITY, got $ACTUAL_AUTHORITY" >&2
    cat "$BOOT_LOG" >&2
    exit 1
  fi
  echo "authority mode: $ACTUAL_AUTHORITY"
fi

if [ "${LIANGXIANG_SMOKE_EXPECT_AUTHORITY:-}" = "LOCAL_FAKE_DEV" ]; then
  test -f "$DSH_HOME/storages/liangxiang_local.json" || {
    echo "ERROR: LOCAL_FAKE_DEV did not materialize liangxiang_local.json" >&2
    exit 1
  }
  echo "isolated local storage materialized"
fi

if [ "$BROWSER_SMOKE" = "1" ]; then
  echo "== browser baseline against packed clean Profile =="
  LIANGXIANG_BROWSER_BASE_URL="$BASE" \
    LIANGXIANG_BROWSER_AUTH_URL="$AUTH_URL" \
    bash "$REPO_ROOT/scripts/smoke-browser-profile.sh"
fi

echo "== 5/5 teardown =="
cleanup
trap - EXIT
SERVER_PID=""
echo "SMOKE OK"
