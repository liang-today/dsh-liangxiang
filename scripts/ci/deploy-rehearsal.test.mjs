import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync, readdirSync, realpathSync, rmSync, symlinkSync, linkSync, statSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'

const shellOnly = { skip: process.platform === 'win32' }
const standby = {
  LIANGXIANG_DEPLOY_MODE: 'rehearsal', LIANGXIANG_DEPLOY_ROLE: 'standby',
  LIANGXIANG_DEPLOY_SSH: 'operator@standby.invalid', LIANGXIANG_DEPLOY_SSH_PORT: '2222',
  LIANGXIANG_DEPLOY_EXPECTED_HOSTNAME: 'service-standby-test',
  LIANGXIANG_DEPLOY_HEALTH_URL: 'https://standby.invalid/v1/health',
}
const sha = 'abcd123', version = '1.3.0-alpha.4', build = `${version}-u1`
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex')
const shellQuote = value => `'${value.replaceAll("'", "'\\''")}'`
function writeCommand(path, source) { writeFileSync(path, `#!${process.execPath}\n${source}\n`, { mode: 0o755 }) }

test('both rehearsal entrypoints reject production, destination overrides and dirty heads before any SSH', shellOnly, () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'liangxiang-deploy-rehearsal-')))
  try {
    const scripts = join(directory, 'scripts'), bin = join(directory, 'bin'), trace = join(directory, 'trace')
    mkdirSync(scripts); mkdirSync(bin); mkdirSync(join(directory, 'src/shared'), { recursive: true })
    for (const name of ['deploy.sh', 'deploy-check.sh', 'load-deploy-target.sh', 'load-deploy-ssh.sh', 'deploy-target.mjs', 'deploy-rehearsal.sh', 'deploy-rehearsal-check.sh', 'deploy-rehearsal-common.sh']) {
      copyFileSync(new URL(`../${name}`, import.meta.url), join(scripts, name))
    }
    writeFileSync(join(directory, 'src/shared/index.ts'), `export const PLUGIN_VERSION = '${version}'\nexport const SERVER_BUILD = '${build}'\n`)
    writeCommand(join(bin, 'git'), `if(process.argv.includes('status'))process.stdout.write(process.env.DEPLOY_TEST_DIRTY?' M file\\n':'');else process.stdout.write('${sha}\\n')`)
    writeCommand(join(bin, 'ssh'), `require('node:fs').appendFileSync(process.env.DEPLOY_TEST_TRACE,'ssh\\n');if(process.argv.at(-1)==='hostname')console.log('service-prod-test');else process.exit(91)`)
    for (const command of ['rsync', 'curl']) writeCommand(join(bin, command), `require('node:fs').appendFileSync(process.env.DEPLOY_TEST_TRACE,'${command}\\n');process.exit(92)`)
    const env = { ...process.env, ...standby, PATH: `${bin}:${process.env.PATH}`, DEPLOY_TEST_TRACE: trace }
    const bad = [
      { LIANGXIANG_DEPLOY_MODE: 'unknown' },
      { LIANGXIANG_DEPLOY_ROLE: 'production', LIANGXIANG_DEPLOY_EXPECTED_HOSTNAME: 'service-prod-test' },
      { LIANGXIANG_PREFIX: '/opt/liangxiang' }, { LIANGXIANG_DEPLOY_STAGE: '/var/tmp/liangxiang-deploy' },
      { LIANGXIANG_REHEARSAL_ENV_FILE: '/etc/liangxiang.env' }, { LIANGXIANG_REHEARSAL_SERVICE: 'liangxiang-backend' },
      { LIANGXIANG_REHEARSAL_DATA_DIR: '/var/lib/liangxiang/data' }, { LIANGXIANG_REHEARSAL_DB: '/var/lib/liangxiang/data/liangxiang.sqlite' },
      { LIANGXIANG_REHEARSAL_CLOCK_FILE: '/tmp/clock.json' }, { LIANGXIANG_REHEARSAL_PORT: '4180' },
      { LIANGXIANG_REHEARSAL_SEED: 'anything' }, { DEPLOY_TEST_DIRTY: '1' },
    ]
    for (const entry of ['deploy.sh', 'deploy-check.sh']) {
      for (const patch of bad) {
        const result = spawnSync('bash', [join(scripts, entry)], { cwd: directory, env: { ...env, ...patch }, encoding: 'utf8' })
        assert.notEqual(result.status, 0, JSON.stringify(patch))
        assert.match(result.stderr, /refusing (?:deploy|rehearsal)/)
        assert.equal(existsSync(trace), false, 'rejected rehearsal must not contact SSH, rsync or HTTP')
      }
      const mismatch = spawnSync('bash', [join(scripts, entry)], { cwd: directory, env, encoding: 'utf8' })
      assert.notEqual(mismatch.status, 0)
      assert.match(mismatch.stderr, /hostname/)
      assert.equal(readFileSync(trace, 'utf8'), 'ssh\n')
      rmSync(trace)
    }
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

function fixture() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'liangxiang-rehearsal-install-')))
  const paths = {
    prefix: join(directory, 'installed'), stage: join(directory, 'stage'), env: join(directory, 'rehearsal.env'),
    unit: join(directory, 'units/liangxiang-backend-rehearsal.service'), data: join(directory, 'data/rehearsal'),
    backups: join(directory, 'backups/rehearsal'), ordinaryDb: join(directory, 'ordinary/liangxiang.sqlite'),
    proxy: join(directory, 'Caddyfile.standby'), trace: join(directory, 'trace'),
  }
  paths.db = join(paths.data, 'liangxiang-rehearsal.sqlite'); paths.clock = join(paths.data, 'clock.json')
  for (const path of [paths.prefix, paths.stage, paths.data, join(paths.stage, 'deploy'), join(paths.stage, 'scripts'), join(paths.stage, 'lib'), join(directory, 'units'), join(directory, 'ordinary')]) mkdirSync(path, { recursive: true })
  const replacements = [
    ['/var/lib/liangxiang/rehearsal', paths.data], ['/var/backups/liangxiang/rehearsal', paths.backups],
    ['/var/lib/liangxiang/data/liangxiang.sqlite', paths.ordinaryDb], ['/var/tmp/liangxiang-rehearsal-deploy', paths.stage],
    ['/etc/systemd/system/liangxiang-backend-rehearsal.service', paths.unit], ['/etc/liangxiang-rehearsal.env', paths.env],
    ['/opt/liangxiang-rehearsal', paths.prefix], ['/etc/caddy/Caddyfile.standby', paths.proxy],
  ]
  const rewrite = text => replacements.reduce((value, [from, to]) => value.replaceAll(from, to), text)
  for (const name of ['liangxiang-rehearsal.env', 'liangxiang-backend-rehearsal.service']) writeFileSync(join(paths.stage, 'deploy', name), rewrite(readFileSync(new URL(`../../deploy/${name}`, import.meta.url), 'utf8')))
  copyFileSync(new URL('../deploy-target.mjs', import.meta.url), join(paths.stage, 'scripts/deploy-target.mjs'))
  writeFileSync(join(paths.stage, 'lib/rehearsal-backend.js'), '// compiled isolated entry fixture\n')
  writeFileSync(paths.proxy, 'standby.invalid { respond "ordinary" }\n')
  const createDb = (path, amount = 42, schema = 10) => {
    const db = new DatabaseSync(path)
    db.exec(`CREATE TABLE assets(amount INTEGER NOT NULL); INSERT INTO assets VALUES(${amount}); PRAGMA user_version=${schema}`)
    db.close()
  }
  createDb(paths.ordinaryDb)
  const originalProxyHash = hash(paths.proxy), originalDbHash = hash(paths.ordinaryDb)
  const prelude = `
set -euo pipefail
hostname(){ printf '%s\\n' service-standby-test; }
id(){ case "$1" in -g) printf '${process.getgid?.() ?? 0}\\n';; *) printf '${process.getuid?.() ?? 0}\\n';; esac; }
sha256sum(){ ${shellQuote(process.execPath)} -e 'const f=require("node:fs"),c=require("node:crypto");console.log(c.createHash("sha256").update(f.readFileSync(process.argv[1])).digest("hex")+"  "+process.argv[1])' "$1"; }
chown(){ :; }
restorecon(){ :; }
install(){ local args=(); while (($#)); do case "$1" in -o|-g) shift 2;; *) args+=("$1");shift;; esac; done; command install "\${args[@]}"; }
cp(){ local args=(); for arg in "$@"; do case "$arg" in --preserve=*) ;; *) args+=("$arg");; esac; done; command cp "\${args[@]}"; }
systemctl(){
  printf '%s\\n' "$*" >> ${shellQuote(paths.trace)}
  if [[ "$1" == restart ]]; then
    ${shellQuote(process.execPath)} --input-type=module - ${shellQuote(paths.db)} <<'START_DB'
import { DatabaseSync } from 'node:sqlite'
import { existsSync, statSync } from 'node:fs'
for (const path of [process.argv[2], process.argv[2] + '-wal', process.argv[2] + '-shm']) {
  if (existsSync(path) && (statSync(path).mode & 0o777) !== 0o600) throw new Error('SQLite service files are not writable with private service permissions')
}
const db = new DatabaseSync(process.argv[2]); db.exec('PRAGMA user_version=14'); db.close()
START_DB
  fi
  return 0
}
curl(){
  [[ "\${*: -1}" == http://127.0.0.1:4195/v1/health ]] || return 93
  printf '%s\\n' '{"status":"ok","authority_mode":"DEV_STAGING_ONLY","version":"${version}","server_build":"${build}"}'
}
`
  const installer = rewrite(readFileSync(new URL('../deploy-rehearsal-install.sh', import.meta.url), 'utf8'))
  const run = (seed = 'fresh', patch = {}) => spawnSync('bash', ['-c', prelude + installer, 'fixture', 'service-standby-test', originalProxyHash, sha, '2026-11-08T00:00:00Z', version, build, seed], { encoding: 'utf8', env: { ...process.env, ...patch } })
  const checkerSource = readFileSync(new URL('../deploy-rehearsal-check.sh', import.meta.url), 'utf8')
  const checkBody = rewrite(checkerSource.split("<<'CHECK_REHEARSAL'\n")[1].split('\nCHECK_REHEARSAL')[0])
  const runCheck = (wrong = '') => {
    const inspect = `
systemctl(){
  printf '%s\\n' "$*" >> ${shellQuote(paths.trace)}
  if [[ "$1" == is-active ]]; then return 0; fi
  case "$4" in
    WorkingDirectory) printf '%s\\n' ${shellQuote(paths.prefix)};;
    FragmentPath) printf '%s\\n' ${shellQuote(paths.unit)};;
    User|Group) printf 'liangxiang\\n';;
    EnvironmentFiles) printf '%s\\n' ${shellQuote(paths.env + ' (ignore_errors=no)')};;
    ExecStart) printf '%s\\n' ${shellQuote(`{ path=/bin/node ; argv[]=/bin/node ${wrong === 'entry' ? '/opt/liangxiang/lib/backend.js' : paths.prefix + '/lib/rehearsal-backend.js'} ; ignore_errors=no ; }`)};;
    *) return 94;;
  esac
}
`
    const unhealthy = wrong === 'health' ? `curl(){ printf '%s\\n' '{"status":"ok","authority_mode":"DEV_STAGING_ONLY","version":"old","server_build":"old"}'; }\n` : ''
    return spawnSync('bash', ['-c', prelude + inspect + unhealthy + checkBody, 'fixture', 'service-standby-test', originalProxyHash, sha, version, build], { encoding: 'utf8' })
  }
  return { directory, paths, run, runCheck, createDb, originalProxyHash, originalDbHash, cleanup: () => rmSync(directory, { recursive: true, force: true }) }
}

test('a fresh deployment creates only the isolated clock/service and a verified VERSION', shellOnly, () => {
  const f = fixture()
  try {
    const result = f.run()
    assert.equal(result.status, 0, result.stderr)
    const clock = JSON.parse(readFileSync(f.paths.clock, 'utf8'))
    assert.equal(clock.epoch_ms, Date.parse('2026-11-09T00:00:00+08:00'))
    assert.equal(clock.rate, 0); assert.ok(Number.isSafeInteger(clock.anchor_wall_ms))
    assert.equal(readFileSync(join(f.paths.prefix, 'VERSION'), 'utf8'), `${build} ${sha} 2026-11-08T00:00:00Z\n`)
    const actions = readFileSync(f.paths.trace, 'utf8').trim().split('\n')
    assert.ok(actions.every(action => action === 'daemon-reload' || /^(?:is-active --quiet|stop|enable|restart) liangxiang-backend-rehearsal$/.test(action)))
    assert.equal(hash(f.paths.proxy), f.originalProxyHash)
    assert.equal(hash(f.paths.ordinaryDb), f.originalDbHash)
  } finally { f.cleanup() }
})

test('redeployment preserves existing rehearsal assets and clock bytes with a rollback backup', shellOnly, () => {
  const f = fixture()
  try {
    f.createDb(f.paths.db, 77, 14)
    const clockBytes = '{"epoch_ms":1794157200000,"anchor_wall_ms":1794000000000,"rate":60}\n'
    writeFileSync(f.paths.clock, clockBytes)
    const result = f.run()
    assert.equal(result.status, 0, result.stderr)
    assert.equal(readFileSync(f.paths.clock, 'utf8'), clockBytes)
    const db = new DatabaseSync(f.paths.db, { readOnly: true })
    assert.equal(db.prepare('SELECT amount FROM assets').get().amount, 77); db.close()
    assert.ok(readdirSync(f.paths.backups).some(name => name.endsWith('.sqlite')))
    const receipt = JSON.parse(readFileSync(join(f.paths.backups, readdirSync(f.paths.backups).find(name => name.endsWith('.json') && !name.startsWith('clock-'))), 'utf8'))
    assert.equal(receipt.before.schema, 14); assert.equal(receipt.after.schema, 14)
    assert.deepEqual(receipt.after.quick_check, ['ok'])
    assert.equal(hash(f.paths.ordinaryDb), f.originalDbHash)
  } finally { f.cleanup() }
})

test('standby-copy seeds a distinct database read-only and never overwrites an existing rehearsal', shellOnly, () => {
  const f = fixture()
  try {
    const result = f.run('standby-copy')
    assert.equal(result.status, 0, result.stderr)
    const db = new DatabaseSync(f.paths.db, { readOnly: true })
    assert.equal(db.prepare('SELECT amount FROM assets').get().amount, 42); db.close()
    assert.equal(hash(f.paths.ordinaryDb), f.originalDbHash)
    const beforeTrace = readFileSync(f.paths.trace, 'utf8')
    const again = f.run('standby-copy')
    assert.notEqual(again.status, 0)
    assert.match(again.stderr, /cannot replace/)
    assert.equal(readFileSync(f.paths.trace, 'utf8'), beforeTrace, 'rejected replacement cannot stop even the rehearsal service')
  } finally { f.cleanup() }
})

test('unsafe environment templates and symlink destinations fail before any service lifecycle', shellOnly, () => {
  const f = fixture()
  try {
    const envFile = join(f.paths.stage, 'deploy/liangxiang-rehearsal.env'), correct = readFileSync(envFile, 'utf8')
    writeFileSync(envFile, correct.replace('LIANGXIANG_ALLOW_UNSIGNED=0', 'LIANGXIANG_ALLOW_UNSIGNED=1'))
    const unsafe = f.run()
    assert.notEqual(unsafe.status, 0); assert.match(unsafe.stderr, /fixed isolated paths, port and signed mode/)
    assert.equal(existsSync(f.paths.trace), false)
    writeFileSync(envFile, correct)
    symlinkSync(join(f.directory, 'missing-target'), f.paths.clock)
    const symlink = f.run()
    assert.notEqual(symlink.status, 0); assert.match(symlink.stderr, /symlink destination/)
    assert.equal(existsSync(f.paths.trace), false)
    assert.equal(hash(f.paths.ordinaryDb), f.originalDbHash)
  } finally { f.cleanup() }
})


test('hard-linked deployment destinations cannot alias an ordinary database or VERSION', shellOnly, () => {
  for (const choose of ['db', 'version']) {
    const f = fixture()
    try {
      const destination = choose === 'db' ? f.paths.db : join(f.paths.prefix, 'VERSION')
      linkSync(f.paths.ordinaryDb, destination)
      const result = f.run()
      assert.notEqual(result.status, 0); assert.match(result.stderr, /linked destination file/)
      assert.equal(existsSync(f.paths.trace), false)
      assert.equal(hash(f.paths.ordinaryDb), f.originalDbHash)
    } finally { f.cleanup() }
  }
})


test('rehearsal deploy-check requires the exact receipt, isolated service entry and matching health', shellOnly, () => {
  const f = fixture()
  try {
    assert.equal(f.run().status, 0)
    const valid = f.runCheck()
    assert.equal(valid.status, 0, valid.stderr)
    for (const wrong of ['entry', 'health']) {
      const result = f.runCheck(wrong)
      assert.notEqual(result.status, 0)
      assert.match(result.stderr, wrong === 'entry' ? /wrong backend entrypoint/ : /health response/)
    }
    writeFileSync(join(f.paths.prefix, 'VERSION'), `${build} deadbee 2026-11-08T00:00:00Z\n`)
    const stale = f.runCheck()
    assert.notEqual(stale.status, 0); assert.match(stale.stderr, /VERSION/)
    assert.equal(hash(f.paths.proxy), f.originalProxyHash)
    assert.equal(hash(f.paths.ordinaryDb), f.originalDbHash)
  } finally { f.cleanup() }
})

test('rehearsal uploads a frozen HEAD even if another app edits the checkout during copying', shellOnly, () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'liangxiang-rehearsal-source-')))
  try {
    const scripts = join(directory, 'scripts'), bin = join(directory, 'bin'), collected = join(directory, 'collected')
    mkdirSync(scripts); mkdirSync(bin); mkdirSync(join(directory, 'src/shared'), { recursive: true })
    for (const name of ['deploy.sh', 'load-deploy-target.sh', 'load-deploy-ssh.sh', 'deploy-target.mjs', 'deploy-rehearsal.sh', 'deploy-rehearsal-common.sh']) copyFileSync(new URL(`../${name}`, import.meta.url), join(scripts, name))
    const committedSource = `export const PLUGIN_VERSION = '${version}'\nexport const SERVER_BUILD = '${build}'\n`
    writeFileSync(join(directory, 'src/shared/index.ts'), committedSource)
    writeFileSync(join(directory, '.gitignore'), 'bin/\ntrace\ncollected/\n')
    const git = args => {
      const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8' })
      assert.equal(result.status, 0, result.stderr)
    }
    git(['init', '-q']); git(['add', 'scripts', 'src', '.gitignore'])
    git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture'])
    writeCommand(join(bin, 'ssh'), `if(process.argv.at(-1)==='hostname')console.log('service-standby-test');else{const input=require('node:fs').readFileSync(0,'utf8');if(input.includes('CONFIG=/etc/caddy/Caddyfile.standby')){const syntax=require('node:child_process').spawnSync('bash',['-n'],{input,encoding:'utf8'});if(syntax.status!==0){process.stderr.write(syntax.stderr);process.exit(91)}console.log('a'.repeat(64))}}`)
    writeCommand(join(bin, 'rsync'), `const fs=require('node:fs'),path=require('node:path');fs.appendFileSync(path.join(process.env.DEPLOY_TEST_ROOT,'src/shared/index.ts'),'// edited after archive\\n');fs.mkdirSync(process.env.DEPLOY_TEST_COLLECTED,{recursive:true});fs.cpSync(process.argv.at(-2),process.env.DEPLOY_TEST_COLLECTED,{recursive:true});process.exit(92)`)
    const result = spawnSync('bash', [join(scripts, 'deploy.sh')], { cwd: directory, encoding: 'utf8', env: { ...process.env, ...standby, PATH: `${bin}:${process.env.PATH}`, DEPLOY_TEST_ROOT: directory, DEPLOY_TEST_COLLECTED: collected } })
    assert.equal(result.status, 92, result.stderr)
    assert.equal(readFileSync(join(collected, 'src/shared/index.ts'), 'utf8'), committedSource)
    assert.match(readFileSync(join(directory, 'src/shared/index.ts'), 'utf8'), /edited after archive/)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})


test('retrying a WAL rehearsal repairs all service files without deleting committed WAL frames', shellOnly, () => {
  const f = fixture()
  let writer
  try {
    f.createDb(f.paths.db, 77, 10)
    writer = new DatabaseSync(f.paths.db)
    writer.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; UPDATE assets SET amount=88')
    const wal = `${f.paths.db}-wal`, shm = `${f.paths.db}-shm`, originalWalInode = statSync(wal).ino
    chmodSync(wal, 0o400); chmodSync(shm, 0o400)
    const result = f.run('fresh')
    assert.equal(result.status, 0, result.stderr)
    const db = new DatabaseSync(f.paths.db, { readOnly: true })
    assert.equal(db.prepare('SELECT amount FROM assets').get().amount, 88); db.close()
    assert.equal(statSync(wal).ino, originalWalInode, 'existing WAL is retained rather than deleted and recreated')
    for (const path of [f.paths.db, wal, shm]) {
      const state = statSync(path)
      assert.equal(state.mode & 0o777, 0o600)
      assert.equal(state.uid, process.getuid())
      assert.equal(state.gid, process.getgid())
    }
  } finally { writer?.close(); f.cleanup() }
})

test('a live WAL source is copied consistently and its temporary audit sidecars are removed', shellOnly, () => {
  const f = fixture()
  let source
  try {
    source = new DatabaseSync(f.paths.ordinaryDb)
    source.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; UPDATE assets SET amount=1234')
    const originalDbHash = hash(f.paths.ordinaryDb), originalWalHash = hash(`${f.paths.ordinaryDb}-wal`)
    const result = f.run('standby-copy')
    assert.equal(result.status, 0, result.stderr)
    const target = new DatabaseSync(f.paths.db, { readOnly: true })
    assert.equal(target.prepare('SELECT amount FROM assets').get().amount, 1234); target.close()
    assert.equal(hash(f.paths.ordinaryDb), originalDbHash)
    assert.equal(hash(`${f.paths.ordinaryDb}-wal`), originalWalHash, 'source WAL was not checkpointed or changed')
    assert.deepEqual(readdirSync(f.paths.data).filter(name => name.includes('.incoming-')), [])
    for (const path of [f.paths.db, `${f.paths.db}-wal`, `${f.paths.db}-shm`]) {
      if (!existsSync(path)) continue
      const state = statSync(path)
      assert.equal(state.mode & 0o777, 0o600)
      assert.equal(state.uid, process.getuid())
      assert.equal(state.gid, process.getgid())
    }
  } finally { source?.close(); f.cleanup() }
})
