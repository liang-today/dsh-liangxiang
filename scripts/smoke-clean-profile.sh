#!/usr/bin/env bash
# Clean-profile smoke test:
#  1. build + pack a tarball
#  2. install web-app + the tarball into a FRESH profile
#  3. assert the bundle layer appears in dump-config
#  4. boot the WebUI, assert the client bundle is served with the loader
#     banner and that the boot graph lists the plugin
#  5. tear everything down (bounded waits everywhere)
. "$(dirname "$0")/env.sh"

SMOKE_PROFILE="${LIANGXIANG_SMOKE_PROFILE:-liangxiang-smoke}"
PORT="${LIANGXIANG_SMOKE_PORT:-3981}"
SERVER_PID=""

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
  rm -rf "${DSH_HOME:?}/profiles/$SMOKE_PROFILE"
  [ -n "${TARBALL:-}" ] && rm -f "./$TARBALL"
}
trap cleanup EXIT

echo "== 1/5 build + pack =="
pnpm run build
TARBALL="$(pnpm pack --silent | tail -n 1)"
echo "packed: $TARBALL"

echo "== 2/5 fresh profile install =="
rm -rf "${DSH_HOME:?}/profiles/$SMOKE_PROFILE"
dsh_cli plugin --profile "$SMOKE_PROFILE" add "$WEB_APP_SPEC"
dsh_cli plugin --profile "$SMOKE_PROFILE" add "./$TARBALL"
# In-box bundles must come from the installation, never from a profile-local
# copy — see the comment in dev-install.sh (duplicate module instances break
# the tool scheduler's symbol seam).
pnpm --dir "$DSH_HOME/profiles/$SMOKE_PROFILE" remove "${WEB_APP_SPEC%@*}" >/dev/null
node "$REPO_ROOT/scripts/assert-profile-modules.mjs" "$DSH_HOME/profiles/$SMOKE_PROFILE"

echo "== 3/5 dump-config layer =="
dsh_cli --profile "$SMOKE_PROFILE" --dump-config | grep -n "dsh-liangxiang"

echo "== 4/5 boot + probe =="
BOOT_LOG="$(mktemp)"
pnpm exec dsh --profile "$SMOKE_PROFILE" --port "$PORT" >"$BOOT_LOG" 2>&1 &
SERVER_PID=$!
# Out of the job table: suppresses the shell's async "Terminated" notice on teardown.
disown "$SERVER_PID" 2>/dev/null || true

BASE="http://127.0.0.1:$PORT"
UP=""
for _ in $(seq 1 60); do
  if curl -sf -o /dev/null "$BASE/"; then UP=1; break; fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then break; fi
  sleep 1
done
if [ -z "$UP" ]; then
  echo "ERROR: WebUI did not come up on $BASE" >&2
  cat "$BOOT_LOG" >&2
  exit 1
fi

# rolldown may reformat the banner across lines; assert on the first 200
# bytes containing both the loader call and the bundle id.
#
# Download to a file first: piping into `head -c` makes curl fail with a write
# error once the bundle is large enough for head to close the pipe early, and
# under `pipefail` that aborts the whole smoke run (it did, the moment inlined
# artwork pushed client.js past a few hundred KB).
CLIENT_BUNDLE="$(mktemp)"
curl -sf -o "$CLIENT_BUNDLE" "$BASE/plugins/dsh-liangxiang/client.js"
BUNDLE_HEAD="$(head -c 200 "$CLIENT_BUNDLE")"
rm -f "$CLIENT_BUNDLE"
case "$BUNDLE_HEAD" in
  'window.__ModuleLoader__.load('*'"dsh-liangxiang"'*) echo "client bundle served with loader banner" ;;
  *) echo "ERROR: unexpected client bundle head: $BUNDLE_HEAD" >&2; exit 1 ;;
esac

if curl -sf "$BASE/" | grep -q '__DSH_BOOT__.*dsh-liangxiang'; then
  echo "boot graph lists dsh-liangxiang"
else
  echo "ERROR: dsh-liangxiang missing from __DSH_BOOT__ graph" >&2
  exit 1
fi

if grep -q '\[dsh-liangxiang\] host half active' "$BOOT_LOG"; then
  echo "host half activated"
else
  echo "ERROR: host lifecycle marker missing from boot log" >&2
  cat "$BOOT_LOG" >&2
  exit 1
fi

echo "== 5/5 teardown =="
cleanup
trap - EXIT
SERVER_PID=""
echo "SMOKE OK"
