#!/usr/bin/env bash
# Build and install dsh-liangxiang into the dedicated dev profile.
#
# Layer order after this script: dsh-base -> dsh-web-app -> dsh-liangxiang.
#
# `plugin add` does two things: it appends the bundle to dsh.profile.bundles AND
# it pnpm-installs the package into <profile>/node_modules. For an IN-BOX bundle
# (dsh-web-app) only the first half is wanted: the installed copy — and its whole
# closure, dsh-tools / dsh-session / dsh-storage-domain … — shadows the
# launcher-maintained fallback at <home>/profiles/node_modules, so plugin rows
# and their in-box consumers end up on TWO module instances of the same package.
# DSH wires internal seams with `unique symbol` keys (TOOL_RUNTIME_SCHEDULER in
# dsh-tools, read by dsh-agent-loop), and two instances mint two symbols: every
# tool call then dies with "Cannot read properties of undefined (reading
# 'prepare')" and leaves the session with tool_calls that have no tool results.
# So the web-app DEPENDENCY is dropped again right after the bundle row exists,
# and assert-profile-modules.mjs guards the invariant.
#
# Our own package stays a dependency — it is genuinely out-of-tree — and pnpm
# links the local checkout, so rebuilds are picked up without reinstalling (the
# HMR receiver stat-polls lib/client.js).
. "$(dirname "$0")/env.sh"

node "$REPO_ROOT/scripts/check-dsh-runtime.mjs"

pnpm run build

dsh_cli plugin --profile "$PROFILE" add "$WEB_APP_SPEC"
dsh_cli plugin --profile "$PROFILE" add .
pnpm --dir "$DSH_HOME/profiles/$PROFILE" remove "${WEB_APP_SPEC%@*}" >/dev/null

echo
echo "== dump-config layer check =="
dsh_cli --profile "$PROFILE" --dump-config | grep -n "dsh-liangxiang" || {
  echo "ERROR: dsh-liangxiang layer missing from dump-config" >&2
  exit 1
}
echo
echo "== module graph check (single instance per in-box package) =="
node "$REPO_ROOT/scripts/assert-profile-modules.mjs" "$DSH_HOME/profiles/$PROFILE"
echo
echo "OK: profile '$PROFILE' ready (DSH_HOME=$DSH_HOME)."
echo "Start the WebUI with: pnpm run dev:web"
