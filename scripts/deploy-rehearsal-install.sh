#!/usr/bin/env bash
# Root-side installer for the isolated instance. No ordinary-service writes.
set -euo pipefail
EXPECTED_HOSTNAME="$1"
EXPECTED_PROXY_SHA="$2"
GIT_SHA="$3"
STAMP="$4"
PLUGIN_VERSION="$5"
SERVER_BUILD="$6"
SEED_MODE="${7:-fresh}"
PREFIX=/opt/liangxiang-rehearsal
STAGE=/var/tmp/liangxiang-rehearsal-deploy
ENV_FILE=/etc/liangxiang-rehearsal.env
SERVICE=liangxiang-backend-rehearsal
UNIT_FILE=/etc/systemd/system/liangxiang-backend-rehearsal.service
DATA_DIR=/var/lib/liangxiang/rehearsal
DB_PATH=/var/lib/liangxiang/rehearsal/liangxiang-rehearsal.sqlite
CLOCK_PATH=/var/lib/liangxiang/rehearsal/clock.json
BACKUP_DIR=/var/backups/liangxiang/rehearsal

[[ "$EXPECTED_HOSTNAME" =~ (^|[-.])standby([-.]|$) && ! "$EXPECTED_HOSTNAME" =~ (^|[-.])(prod|production)([-.]|$) ]] || { echo "refusing rehearsal: a standby hostname is required" >&2; exit 1; }
[[ "$(hostname)" == "$EXPECTED_HOSTNAME" ]] || { echo "refusing rehearsal: hostname changed after preflight" >&2; exit 1; }
[[ "$(sha256sum /etc/caddy/Caddyfile.standby | cut -d ' ' -f 1)" == "$EXPECTED_PROXY_SHA" ]] || { echo "refusing rehearsal: standby proxy changed after preflight" >&2; exit 1; }
[[ "$GIT_SHA" =~ ^[a-f0-9]{7,40}$ && "$PLUGIN_VERSION" =~ ^[0-9A-Za-z.+-]+$ && "$SERVER_BUILD" =~ ^[0-9A-Za-z.+-]+$ ]] || { echo "refusing rehearsal: invalid source identity" >&2; exit 1; }
case "$SEED_MODE" in
  fresh) ;;
  standby-copy)
    [[ ! -e "$DB_PATH" && ! -L "$DB_PATH" ]] || { echo "refusing rehearsal: standby-copy cannot replace an existing rehearsal database" >&2; exit 1; }
    ;;
  *) echo "refusing rehearsal: invalid seed mode" >&2; exit 1 ;;
esac
id -u liangxiang >/dev/null
[[ -f "$STAGE/lib/rehearsal-backend.js" ]] || { echo "refusing rehearsal: isolated backend entry is missing" >&2; exit 1; }

# Refuse symlink aliases and a malformed template before stopping any instance.
# The program entry validates these paths again before it opens a database.
node --input-type=module - "$PREFIX" "$STAGE" "$ENV_FILE" "$UNIT_FILE" "$DATA_DIR" "$DB_PATH" "$CLOCK_PATH" "$BACKUP_DIR" "$PREFIX/VERSION" "$DB_PATH-wal" "$DB_PATH-shm" <<'VALIDATE'
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname } from 'node:path'
for (const path of process.argv.slice(2)) {
  try {
    const state = lstatSync(path)
    if (state.isSymbolicLink()) throw new Error('refusing rehearsal: symlink destination')
    if (state.isFile() && state.nlink !== 1) throw new Error('refusing rehearsal: linked destination file')
  }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  let parent = dirname(path)
  while (!existsSync(parent)) parent = dirname(parent)
  if (realpathSync(parent) !== parent) throw new Error('refusing rehearsal: aliased destination parent')
}
const envFile = `${process.argv[3]}/deploy/liangxiang-rehearsal.env`
const expected = {
  LIANGXIANG_REHEARSAL: '1', LIANGXIANG_AUTHORITY_MODE: 'DEV_STAGING_ONLY',
  LIANGXIANG_BACKEND_HOST: '127.0.0.1', LIANGXIANG_BACKEND_PORT: '4195',
  LIANGXIANG_BACKEND_DB: '/var/lib/liangxiang/rehearsal/liangxiang-rehearsal.sqlite',
  LIANGXIANG_REHEARSAL_CLOCK_FILE: '/var/lib/liangxiang/rehearsal/clock.json',
  LIANGXIANG_REHEARSAL_TICK_MS: '40',
  LIANGXIANG_BUSINESS_TZ: 'Asia/Shanghai', LIANGXIANG_SNAPSHOT_SECONDS: '1',
  LIANGXIANG_TOKEN_PER_INCENSE: '50000', LIANGXIANG_ALLOW_UNSIGNED: '0',
}
const actual = {}
for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  if (!line || /^\s*#/.test(line)) continue
  const match = /^([A-Z_]+)=(.*)$/.exec(line)
  if (!match || Object.hasOwn(actual, match[1])) throw new Error('refusing rehearsal: invalid environment template')
  actual[match[1]] = match[2]
}
if (Object.keys(actual).length !== Object.keys(expected).length || Object.entries(expected).some(([key, value]) => actual[key] !== value)) {
  throw new Error('refusing rehearsal: environment must use the fixed isolated paths, port and signed mode')
}
VALIDATE

# Read-only SQLite connections can create WAL/SHM sidecars. Normalize every
# dedicated file through its descriptor, so root audits cannot block the
# unprivileged service or follow a substituted symlink outside this database.
normalize_rehearsal_sqlite_permissions() {
  local rehearsal_uid rehearsal_gid
  rehearsal_uid="$(id -u liangxiang)"
  rehearsal_gid="$(id -g liangxiang)"
  node --input-type=module - "$DB_PATH" "$rehearsal_uid" "$rehearsal_gid" <<'SQLITE_PERMISSIONS'
import { constants, openSync, fstatSync, fchownSync, fchmodSync, closeSync } from 'node:fs'
const uid = Number(process.argv[3]), gid = Number(process.argv[4])
if (!Number.isSafeInteger(uid) || !Number.isSafeInteger(gid) || uid < 0 || gid < 0) throw new Error('invalid rehearsal service identity')
for (const path of [process.argv[2], `${process.argv[2]}-wal`, `${process.argv[2]}-shm`]) {
  let fd
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    const state = fstatSync(fd)
    if (!state.isFile() || state.nlink !== 1) throw new Error('refusing rehearsal: unsafe SQLite file')
    fchownSync(fd, uid, gid)
    fchmodSync(fd, 0o600)
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  finally { if (fd !== undefined) closeSync(fd) }
}
SQLITE_PERMISSIONS
}

cleanup_rehearsal_install() {
  local status=$?
  trap - EXIT
  normalize_rehearsal_sqlite_permissions || status=1
  if [[ "$status" -ne 0 ]]; then systemctl stop "$SERVICE" >/dev/null 2>&1 || true; fi
  return "$status"
}

install -d -o root -g liangxiang -m 0750 "$PREFIX"
install -d -o liangxiang -g liangxiang -m 0700 "$DATA_DIR"
install -d -o root -g root -m 0700 "$BACKUP_DIR"
# Only the dedicated test service can be interrupted. The normal 4180 backend
# and every proxy/SSH configuration remain outside this lifecycle.
if systemctl is-active --quiet "$SERVICE"; then systemctl stop "$SERVICE"; fi
trap cleanup_rehearsal_install EXIT
normalize_rehearsal_sqlite_permissions
if [[ -f "$DB_PATH" ]]; then
  BACKUP_PATH="$BACKUP_DIR/rehearsal-${STAMP//:/-}-pre-${GIT_SHA}-$$.sqlite"
  node --input-type=module - "$DB_PATH" "$BACKUP_PATH" <<'BACKUP'
import { DatabaseSync, backup } from 'node:sqlite'
const source = new DatabaseSync(process.argv[2], { readOnly: true })
try { await backup(source, process.argv[3]) } finally { source.close() }
BACKUP
  chmod 0600 "$BACKUP_PATH"
  echo "rehearsal database backup: $BACKUP_PATH"
fi
if [[ -f "$CLOCK_PATH" ]]; then
  cp --preserve=mode,ownership,timestamps "$CLOCK_PATH" "$BACKUP_DIR/clock-${STAMP//:/-}-pre-${GIT_SHA}-$$.json"
fi

# A standalone copy is the only permitted read of the ordinary standby ledger.
# No ordinary connection is writable and its service is never interrupted.
if [[ "$SEED_MODE" == standby-copy ]]; then
  node --input-type=module - "$DB_PATH" <<'SEED'
import { DatabaseSync, backup } from 'node:sqlite'
import { existsSync, lstatSync, linkSync, unlinkSync, writeFileSync } from 'node:fs'
const sourcePath = '/var/lib/liangxiang/data/liangxiang.sqlite'
const target = process.argv[2], temporary = `${target}.incoming-${process.pid}`
if (lstatSync(sourcePath).isSymbolicLink() || existsSync(target)) throw new Error('refusing rehearsal: unsafe or existing seed target')
writeFileSync(temporary, '', { flag: 'wx', mode: 0o600 })
let source
try {
  source = new DatabaseSync(sourcePath, { readOnly: true })
  await backup(source, temporary)
  const copy = new DatabaseSync(temporary, { readOnly: true })
  try {
    if (copy.prepare('PRAGMA quick_check').all().some(row => Object.values(row)[0] !== 'ok') || copy.prepare('PRAGMA foreign_key_check').all().length !== 0) throw new Error('rehearsal seed failed integrity checks')
  } finally { copy.close() }
  linkSync(temporary, target) // Fails atomically if any competing writer created it.
} finally {
  source?.close()
  // These names belong only to this process's closed temporary copy. Never
  // unlink the dedicated database WAL, which may contain committed data.
  for (const path of [`${temporary}-wal`, `${temporary}-shm`, temporary]) {
    try { unlinkSync(path) } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
}
SEED
fi
BEFORE_STATE="$(node --input-type=module - "$DB_PATH" "$SEED_MODE" <<'BEFORE'
import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
const path = process.argv[2]
if (!existsSync(path)) console.log(JSON.stringify({ seed: process.argv[3], existed: false, schema: null, quick_check: null, foreign_key_violations: null }))
else {
  const db = new DatabaseSync(path, { readOnly: true })
  try { console.log(JSON.stringify({ seed: process.argv[3], existed: true, schema: db.prepare('PRAGMA user_version').get().user_version, quick_check: db.prepare('PRAGMA quick_check').all().map(row => Object.values(row)[0]), foreign_key_violations: db.prepare('PRAGMA foreign_key_check').all().length })) }
  finally { db.close() }
}
BEFORE
)"
normalize_rehearsal_sqlite_permissions
rsync -a --delete --exclude node_modules --exclude VERSION "$STAGE"/ "$PREFIX"/
chown -R root:liangxiang "$PREFIX"
chmod 0750 "$PREFIX"
install -o root -g liangxiang -m 0640 "$PREFIX/deploy/liangxiang-rehearsal.env" "$ENV_FILE"
NODE_BIN="$(command -v node)"
sed "s|/usr/bin/node|$NODE_BIN|" "$PREFIX/deploy/liangxiang-backend-rehearsal.service" > "$UNIT_FILE"
chown root:root "$UNIT_FILE"
chmod 0644 "$UNIT_FILE"

# Initialization is exclusive; redeploys preserve the existing clock bytes and
# database. Business-clock acceleration never changes the Linux clock.
node --input-type=module - "$CLOCK_PATH" <<'CLOCK'
import { writeFileSync } from 'node:fs'
const epoch = Date.parse('2026-11-09T00:00:00+08:00')
if (epoch !== 1794153600000) throw new Error('unexpected rehearsal epoch')
try {
  writeFileSync(process.argv[2], `${JSON.stringify({ epoch_ms: epoch, anchor_wall_ms: Date.now(), rate: 0 })}\n`, { flag: 'wx', mode: 0o600 })
} catch (error) { if (error.code !== 'EEXIST') throw error }
CLOCK
chown liangxiang:liangxiang "$CLOCK_PATH"
chmod 0600 "$CLOCK_PATH"
normalize_rehearsal_sqlite_permissions
restorecon -RF "$PREFIX" "$DATA_DIR" "$ENV_FILE" "$UNIT_FILE" "$BACKUP_DIR"
systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null
systemctl restart "$SERVICE"
for _ in $(seq 1 30); do
  if curl -fsS --max-time 2 http://127.0.0.1:4195/v1/health >/dev/null 2>&1; then break; fi
  sleep 0.5
done
systemctl is-active --quiet "$SERVICE"
curl -fsS --max-time 10 http://127.0.0.1:4195/v1/health | node "$PREFIX/scripts/deploy-target.mjs" health "$PLUGIN_VERSION" "$SERVER_BUILD"
[[ "$(sha256sum /etc/caddy/Caddyfile.standby | cut -d ' ' -f 1)" == "$EXPECTED_PROXY_SHA" ]] || { echo "refusing rehearsal: standby proxy changed during install" >&2; exit 1; }
EVIDENCE_PATH="$BACKUP_DIR/rehearsal-${STAMP//:/-}-${GIT_SHA}-$$.json"
node --input-type=module - "$DB_PATH" "$BEFORE_STATE" "$EVIDENCE_PATH" "$GIT_SHA" "$SERVER_BUILD" "$STAMP" <<'EVIDENCE'
import { DatabaseSync } from 'node:sqlite'
import { writeFileSync } from 'node:fs'
const db = new DatabaseSync(process.argv[2], { readOnly: true })
try {
  const after = { schema: db.prepare('PRAGMA user_version').get().user_version, quick_check: db.prepare('PRAGMA quick_check').all().map(row => Object.values(row)[0]), foreign_key_violations: db.prepare('PRAGMA foreign_key_check').all().length }
  if (after.quick_check.some(value => value !== 'ok') || after.foreign_key_violations !== 0) throw new Error('rehearsal database verification failed')
  const evidence = { commit: process.argv[5], build: process.argv[6], deployed_at: process.argv[7], before: JSON.parse(process.argv[3]), after }
  writeFileSync(process.argv[4], `${JSON.stringify(evidence)}\n`, { flag: 'wx', mode: 0o600 })
  console.log(`rehearsal database verified: schema ${evidence.before.schema ?? 'new'} -> ${after.schema}, quick_check=ok`)
} finally { db.close() }
EVIDENCE
normalize_rehearsal_sqlite_permissions
printf '%s %s %s\n' "$SERVER_BUILD" "$GIT_SHA" "$STAMP" > "$PREFIX/VERSION"
echo "OK: rehearsal installed with its own database, service and business clock."
