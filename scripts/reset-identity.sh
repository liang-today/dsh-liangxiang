#!/usr/bin/env bash
# Mint a fresh community installation identity on the next WebUI start.
#
# The installation id is an Ed25519 keypair persisted in the DSH storage domain:
#
#   $DSH_HOME/storages/liangbiao.json  ->  tables.identity.installation
#
# It is minted ONCE on first install and reused forever. Copying .dsh-home (or
# just that JSON) to a second device therefore carries the SAME keypair, so both
# devices present the same installation id (香客) to the backend. Deleting the
# stored keypair here makes the next boot mint a brand-new one, together with
# the device's OWN MAC fingerprint.
#
# KEEPS: token watermarks + daily_usage (already-observed DSH usage is
# re-claimed as incense under the new id), votes/ledgers/aggregates.
#
# Caveat — device fingerprint: the backend binds `device_fingerprint` (SHA-256
# of the device's MACs) to one installation. A device that merely RODE a cloned
# key has no binding of its own, so the local reset below is enough. But if the
# device's MACs are ALREADY bound to the OLD id (typically the ORIGINAL machine),
# the backend rejects the new key with 409 `device_conflict`; in that case also
# clear the backend row first, e.g.:
#
#   sqlite3 /var/lib/liangbiao/data/liangbiao.sqlite \
#     "DELETE FROM community_identity WHERE installation_id='lk_OLD_ID';"
#
# Usage:
#   pnpm run reset:identity
#   pnpm run reset:identity -- --json /path/to/storages/liangbiao.json
#
# After running: restart the WebUI, then confirm the Host log / badge shows a
# new `lk_…` installation id.
. "$(dirname "$0")/env.sh"

STORAGE="${LIANGBIAO_STORAGE:-$DSH_HOME/storages/liangbiao.json}"

case "${1:-}" in
  -h|--help)
    sed -n '2,30p' "$0"
    exit 0
    ;;
  --json)
    STORAGE="${2:?usage: --json <path>}"
    ;;
esac

if [ ! -f "$STORAGE" ]; then
  echo "no storage at $STORAGE — next boot will mint a fresh identity"
  exit 0
fi

node - "$STORAGE" <<'NODE'
const fs = require('node:fs')
const path = process.argv[2]
const data = JSON.parse(fs.readFileSync(path, 'utf8'))
const tables = data.tables || {}
const entry = tables.identity && tables.identity.installation
if (entry) {
  const old = typeof entry === 'string' ? entry : (entry.installationId || '(unknown)')
  delete tables.identity
  data.tables = tables
  fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n')
  console.log(`removed identity ${old}`)
} else {
  console.log('no identity entry — next boot will mint a fresh identity')
}
console.log('kept watermarks, daily_usage, votes, ledgers, aggregates')
console.log('next: restart the WebUI; the Host will mint a new lk_ installation id')
NODE
