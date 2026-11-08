#!/usr/bin/env bash
# Root installer. Ordinary and rehearsal data never become writable targets.
set -euo pipefail
EXPECTED_HOSTNAME="$1"; EXPECTED_PROXY_SHA="$2"; GIT_SHA="$3"
PLUGIN_VERSION="$4"; SERVER_BUILD="$5"; STAMP="$6"; CLIENT_IPS="$7"
PREFIX=/opt/liangxiang-internal-test
STAGE=/var/tmp/liangxiang-internal-test-deploy
DATA=/var/lib/liangxiang-internal-test/data
DB="$DATA/liangxiang.sqlite"
SERVICE=liangxiang-backend-internal-test
ENV_FILE=/etc/liangxiang-internal-test.env
UNIT=/etc/systemd/system/liangxiang-backend-internal-test.service
PROXY=/etc/caddy/Caddyfile.standby
SNIPPET=/etc/caddy/liangxiang-internal-test.caddy
[[ "$EXPECTED_HOSTNAME" =~ (^|[-.])standby([-.]|$) && ! "$EXPECTED_HOSTNAME" =~ (^|[-.])(prod|production)([-.]|$) ]]
[[ "$(hostname)" == "$EXPECTED_HOSTNAME" ]]
[[ "$GIT_SHA" =~ ^[a-f0-9]{7,40}$ && "$STAMP" =~ ^[0-9TZ:-]+$ ]]
[[ "$PLUGIN_VERSION" =~ ^[0-9A-Za-z.+-]+$ && "$SERVER_BUILD" =~ ^[0-9A-Za-z.+-]+$ ]]
[[ "$(sha256sum "$PROXY" | cut -d ' ' -f 1)" == "$EXPECTED_PROXY_SHA" ]]
[[ -f "$STAGE/lib/backend.js" ]]
node --input-type=module - "$CLIENT_IPS" "$PREFIX" "$STAGE" "$DATA" "$DB" "$ENV_FILE" "$UNIT" "$SNIPPET" <<'GUARDS'
import { isIP } from 'node:net'
import { existsSync, lstatSync, realpathSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
const ips = process.argv[2].split(',')
if (!ips.length || ips.length > 8 || ips.some(ip => !isIP(ip) || ip === '0.0.0.0' || ip === '::')) throw new Error('exact client exit IPs required')
for (const path of process.argv.slice(3)) {
  if (existsSync(path)) {
    const stat = lstatSync(path)
    if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink !== 1)) throw new Error('aliased internal-test destination')
  }
  let parent = dirname(path)
  while (!existsSync(parent)) parent = dirname(parent)
  if (realpathSync(parent) !== parent) throw new Error('aliased internal-test parent')
}
const template = readFileSync('/var/tmp/liangxiang-internal-test-deploy/deploy/liangxiang-internal-test.env', 'utf8')
const values = Object.fromEntries(template.trim().split(/\r?\n/).map(line => {
  const at = line.indexOf('=')
  if (at <= 0) throw new Error('invalid internal-test environment')
  return [line.slice(0, at), line.slice(at + 1)]
}))
for (const [key, value] of Object.entries({ LIANGXIANG_AUTHORITY_MODE: 'DEV_STAGING_ONLY',
  LIANGXIANG_BACKEND_HOST: '127.0.0.1', LIANGXIANG_BACKEND_PORT: '4196',
  LIANGXIANG_BACKEND_DB: '/var/lib/liangxiang-internal-test/data/liangxiang.sqlite', LIANGXIANG_ALLOW_UNSIGNED: '0' })) {
  if (values[key] !== value) throw new Error('internal-test environment crossed an isolation boundary')
}
GUARDS
id liangxiang-internal-test >/dev/null 2>&1 || useradd --system --no-create-home --shell /sbin/nologin liangxiang-internal-test
BACKUP="/var/backups/liangxiang-internal-test/${STAMP//:/-}-$GIT_SHA"
install -d -o root -g root -m 0700 "$BACKUP"
install -d -o liangxiang-internal-test -g liangxiang-internal-test -m 0700 /var/lib/liangxiang-internal-test "$DATA"
cp -a "$PROXY" "$BACKUP/proxy.before"
for file in "$ENV_FILE" "$UNIT" "$SNIPPET"; do test ! -f "$file" || cp -a "$file" "$BACKUP/$(basename "$file").before"; done
systemctl show liangxiang-backend liangxiang-backend-rehearsal -p Id -p MainPID -p ActiveEnterTimestamp > "$BACKUP/originals.before"
sha256sum /opt/liangxiang/VERSION > "$BACKUP/protected.sha256"
if [[ -d /var/backups/liangxiang-clone ]]; then
  find /var/backups/liangxiang-clone -type f -path '*/source/seed.sqlite' -exec sha256sum '{}' + >> "$BACKUP/protected.sha256"
fi
WAS_ACTIVE=0
systemctl is-active --quiet "$SERVICE" && WAS_ACTIVE=1
test ! -d "$PREFIX" || cp -a "$PREFIX" "$BACKUP/code.before"
rollback() {
  status=$?; trap - ERR
  systemctl stop "$SERVICE" || true
  cp -a "$BACKUP/proxy.before" "$PROXY"
  if [[ -d "$BACKUP/code.before" ]]; then rsync -a --delete "$BACKUP/code.before/" "$PREFIX/"; fi
  for file in "$ENV_FILE" "$UNIT" "$SNIPPET"; do
    saved="$BACKUP/$(basename "$file").before"
    if [[ -f "$saved" ]]; then cp -a "$saved" "$file"; else rm -f "$file"; fi
  done
  systemctl daemon-reload
  caddy validate --config "$PROXY" >/dev/null 2>&1 && systemctl reload caddy
  if [[ "$WAS_ACTIVE" == 1 ]]; then systemctl start "$SERVICE"; fi
  # Preserve the ledger even on failure; its backup is for explicit recovery.
  echo "Internal-test installation failed ($status); original routing restored, ledger preserved." >&2
  exit "$status"
}
trap rollback ERR
systemctl stop "$SERVICE" 2>/dev/null || true
if [[ -f "$DB" ]]; then
  copy="$DATA/.pre-deploy-$GIT_SHA.sqlite"
  runuser -u liangxiang-internal-test -- node --input-type=module - "$DB" "$copy" <<'BACKUP_DB'
import { DatabaseSync, backup } from 'node:sqlite'
const db = new DatabaseSync(process.argv[2], { readOnly: true })
try { await backup(db, process.argv[3]) } finally { db.close() }
BACKUP_DB
  mv "$copy" "$BACKUP/ledger.before.sqlite"
fi
install -d -o root -g liangxiang-internal-test -m 0750 "$PREFIX"
rsync -a --delete --exclude node_modules --exclude VERSION "$STAGE/" "$PREFIX/"
chown -R root:liangxiang-internal-test "$PREFIX"
chmod -R u=rwX,g=rX,o= "$PREFIX"
install -o root -g liangxiang-internal-test -m 0640 "$PREFIX/deploy/liangxiang-internal-test.env" "$ENV_FILE"
install -o root -g root -m 0644 "$PREFIX/deploy/liangxiang-backend-internal-test.service" "$UNIT"
python3 - "$PROXY" "$SNIPPET" "$CLIENT_IPS" <<'ROUTE'
from pathlib import Path
import sys
p,snippet,ips=Path(sys.argv[1]),Path(sys.argv[2]),sys.argv[3].split(',')
snippet.write_text('handle_path /liangxiang-internal-test/* {\n @allowed remote_ip '+' '.join(ips)+'\n handle @allowed {\n  header X-Liangxiang-Environment internal-test\n  reverse_proxy 127.0.0.1:4196 {\n   flush_interval -1\n   transport http {\n    keepalive 60s\n    response_header_timeout 15s\n   }\n  }\n }\n handle {\n  respond 403\n }\n}\n')
text=p.read_text()
# The site-wide header block is deferred because it removes Server. Its
# environment label must be a default so it cannot overwrite this route.
text=text.replace('\n\t\tX-Liangxiang-Environment standby\n', '\n\t\t?X-Liangxiang-Environment standby\n')
p.write_text(text)
line='\timport /etc/caddy/liangxiang-internal-test.caddy\n'
if line not in text:
 start=text.find('\treverse_proxy 127.0.0.1:4180 {');end=text.rfind('\n}')
 if start<0:raise RuntimeError('unexpected standby routing; refusing to replace it')
 old=text[start:end]
 p.write_text(text[:start]+line+'\thandle {\n'+''.join('\t'+s+'\n'for s in old.splitlines())+'\t}\n}\n')
ROUTE
chown root:caddy "$SNIPPET"
chmod 0640 "$SNIPPET"
restorecon -RF "$PREFIX" /var/lib/liangxiang-internal-test "$ENV_FILE" "$UNIT" "$SNIPPET"
caddy fmt --overwrite "$SNIPPET"
caddy fmt --overwrite "$PROXY"
caddy validate --config "$PROXY"
systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null
systemctl start "$SERVICE"
curl --retry 15 --retry-connrefused --retry-delay 1 --max-time 5 -fsS http://127.0.0.1:4196/v1/health | node "$PREFIX/scripts/deploy-target.mjs" health "$PLUGIN_VERSION" "$SERVER_BUILD"
runuser -u liangxiang-internal-test -- /bin/bash -c 'set -a; source /etc/liangxiang-internal-test.env; set +a; exec /usr/bin/node /opt/liangxiang-internal-test/lib/backend-cli.js broadcast set --hours 48 "内部测试：独立测试香火，与社区账本隔离。"' > "$BACKUP/broadcast.json"
systemctl reload caddy
systemctl show liangxiang-backend liangxiang-backend-rehearsal -p Id -p MainPID -p ActiveEnterTimestamp > "$BACKUP/originals.after"
cmp "$BACKUP/originals.before" "$BACKUP/originals.after"
sha256sum -c "$BACKUP/protected.sha256"
printf '%s %s %s\n' "$SERVER_BUILD" "$GIT_SHA" "$STAMP" > "$PREFIX/VERSION"
trap - ERR
echo 'OK: internal-test server ready; original backends and backup unchanged.'
