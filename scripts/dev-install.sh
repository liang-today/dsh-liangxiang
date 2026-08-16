#!/usr/bin/env bash
# Build and install dsh-liangbiao into the dedicated dev profile.
#
# Layer order after this script: dsh-base -> dsh-web-app -> dsh-liangbiao.
# The web-app bundle is added as a profile dependency so it joins
# dsh.profile.bundles; at boot its in-box copy from the dsh installation
# resolves first (documented resolution order). Our package is added as a
# local checkout, which pnpm links — rebuilds are picked up without
# reinstalling (the HMR receiver stat-polls lib/client.js).
. "$(dirname "$0")/env.sh"

pnpm run build

dsh_cli plugin --profile "$PROFILE" add "$WEB_APP_SPEC"
dsh_cli plugin --profile "$PROFILE" add .

echo
echo "== dump-config layer check =="
dsh_cli --profile "$PROFILE" --dump-config | grep -n "dsh-liangbiao" || {
  echo "ERROR: dsh-liangbiao layer missing from dump-config" >&2
  exit 1
}
echo
echo "OK: profile '$PROFILE' ready (DSH_HOME=$DSH_HOME)."
echo "Start the WebUI with: pnpm run dev:web"
