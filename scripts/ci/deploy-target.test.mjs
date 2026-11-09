import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readDeployEnv, resolveDeployTarget, verifyHostname, verifyReceipt, verifyHealth } from '../deploy-target.mjs'

const standby = {
  LIANGXIANG_DEPLOY_ROLE: 'standby',
  LIANGXIANG_DEPLOY_SSH: 'operator@standby.invalid',
  LIANGXIANG_DEPLOY_EXPECTED_HOSTNAME: 'service-standby-test',
  LIANGXIANG_DEPLOY_HEALTH_URL: 'https://standby.invalid/v1/health',
  LIANGXIANG_DEPLOY_SSH_PORT: '2222',
}

test('standby requires explicit role, hostname and a health URL on the SSH host', async () => {
  const target = await resolveDeployTarget(standby, () => { throw new Error('same host needs no DNS') })
  assert.equal(target.role, 'standby')
  assert.equal(target.healthUrl, standby.LIANGXIANG_DEPLOY_HEALTH_URL)
  for (const key of ['LIANGXIANG_DEPLOY_ROLE', 'LIANGXIANG_DEPLOY_SSH', 'LIANGXIANG_DEPLOY_EXPECTED_HOSTNAME', 'LIANGXIANG_DEPLOY_HEALTH_URL']) {
    await assert.rejects(resolveDeployTarget({ ...standby, [key]: '' }), /refusing deploy/)
  }
  for (const patch of [
    { LIANGXIANG_DEPLOY_ROLE: 'auto' },
    { LIANGXIANG_DEPLOY_EXPECTED_HOSTNAME: 'service-prod-test' },
    { LIANGXIANG_DEPLOY_EXPECTED_HOSTNAME: 'service-prod-standby-test' },
    { LIANGXIANG_DEPLOY_SSH: 'operator@standby.invalid;false' },
    { LIANGXIANG_DEPLOY_SSH_PORT: '65536' },
    { LIANGXIANG_DEPLOY_HEALTH_URL: 'https://production.invalid/v1/health' },
    { LIANGXIANG_DEPLOY_HEALTH_URL: 'http://standby.invalid/v1/health' },
    { LIANGXIANG_DEPLOY_HEALTH_URL: 'https://standby.invalid/v1/health?target=other' },
    { LIANGXIANG_DEPLOY_HEALTH_URL: 'https://operator@standby.invalid/v1/health' },
  ]) await assert.rejects(resolveDeployTarget({ ...standby, ...patch }), /refusing deploy/)
})

test('an explicit production TLS alias must resolve to exactly the SSH target endpoints', async () => {
  const production = {
    ...standby, LIANGXIANG_DEPLOY_ROLE: 'production', LIANGXIANG_DEPLOY_EXPECTED_HOSTNAME: 'service-prod-test',
    LIANGXIANG_DEPLOY_SSH: 'operator@ssh.invalid', LIANGXIANG_DEPLOY_HEALTH_URL: 'https://tls.invalid/v1/health',
  }
  await resolveDeployTarget(production, async () => [{ address: 'same-endpoint' }])
  await assert.rejects(resolveDeployTarget(production, async host => [{ address: host }]), /different targets/)
  await assert.rejects(resolveDeployTarget(production, async host => host === 'ssh.invalid'
    ? [{ address: 'same-endpoint' }] : [{ address: 'same-endpoint' }, { address: 'other-endpoint' }]), /different targets/)
})

test('ignored deployment configuration is parsed as data and explicit empty values fail closed', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'liangxiang-deploy-env-'))
  try {
    const filename = join(directory, '.env')
    writeFileSync(filename, Object.entries(standby).map(([key, value]) => `${key}="${value}"`).join('\n') + '\nUNRELATED_KEY="ignored"\n')
    assert.deepEqual(readDeployEnv({}, filename), standby)
    const overridden = readDeployEnv({ LIANGXIANG_DEPLOY_ROLE: '' }, filename)
    await assert.rejects(resolveDeployTarget(overridden), /ROLE/)
    writeFileSync(filename, 'LIANGXIANG_DEPLOY_SSH=$(false)\n')
    await assert.rejects(resolveDeployTarget({ ...standby, ...readDeployEnv({}, filename) }), /user@host/)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('hostname, VERSION and health checks compare exact identities', () => {
  assert.doesNotThrow(() => verifyHostname('service-standby-test', 'service-standby-test\n'))
  assert.throws(() => verifyHostname('service-standby-test', 'service-prod-test\n'), /hostname/)
  const version = '1.2.3-beta.1', build = `${version}-u1`, sha = 'abcd123'
  assert.doesNotThrow(() => verifyReceipt(`${build} ${sha} 2026-11-07T00:00:00Z`, sha, build))
  for (const receipt of [`${build} x${sha}x 2026-11-07T00:00:00Z`, `other ${sha} 2026-11-07T00:00:00Z`, `${build} ${sha}`]) {
    assert.throws(() => verifyReceipt(receipt, sha, build), /exactly/)
  }
  const health = { status: 'ok', authority_mode: 'DEV_STAGING_ONLY', version, server_build: build }
  assert.doesNotThrow(() => verifyHealth(health, version, build))
  for (const patch of [{ version: 'old' }, { server_build: `${version}-u2` }, { authority_mode: 'LOCAL_FAKE_DEV' }, { status: 'error' }]) {
    assert.throws(() => verifyHealth({ ...health, ...patch }, version, build), /health response/)
  }
})

test('both real shell entrypoints reject missing or mismatched targets before rsync, curl or remote installation', { skip: process.platform === 'win32' }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'liangxiang-deploy-guard-'))
  try {
    const scripts = join(directory, 'scripts'), bin = join(directory, 'bin'), trace = join(directory, 'trace')
    mkdirSync(scripts); mkdirSync(bin)
    for (const file of ['deploy.sh', 'deploy-check.sh', 'load-deploy-target.sh', 'load-deploy-ssh.sh', 'deploy-target.mjs']) {
      copyFileSync(new URL(`../${file}`, import.meta.url), join(scripts, file))
    }
    for (const command of ['ssh', 'rsync', 'curl']) {
      writeFileSync(join(bin, command), `#!${process.execPath}\nconst fs=require('node:fs');fs.appendFileSync(process.env.DEPLOY_TEST_TRACE,'${command}\\n');if('${command}'==='ssh'&&process.argv.at(-1)==='hostname'){console.log('service-prod-test')}else{process.exit(91)}\n`, { mode: 0o755 })
    }
    const base = { ...process.env, ...standby, PATH: `${bin}:${process.env.PATH}`, DEPLOY_TEST_TRACE: trace }
    for (const entry of ['deploy.sh', 'deploy-check.sh']) {
      for (const patch of [
        { LIANGXIANG_DEPLOY_ROLE: '' },
        { LIANGXIANG_DEPLOY_HEALTH_URL: 'https://production.invalid/v1/health' },
      ]) {
        const result = spawnSync('bash', [join(scripts, entry)], { cwd: directory, env: { ...base, ...patch }, encoding: 'utf8' })
        assert.notEqual(result.status, 0)
        assert.match(result.stderr, /refusing deploy/)
        assert.equal(existsSync(trace), false, 'configuration rejection must precede any SSH, rsync or HTTP request')
      }
      const mismatch = spawnSync('bash', [join(scripts, entry)], { cwd: directory, env: base, encoding: 'utf8' })
      assert.notEqual(mismatch.status, 0)
      assert.match(mismatch.stderr, /remote hostname/)
      assert.equal(readFileSync(trace, 'utf8'), 'ssh\n', 'remote mismatch may only perform the read-only hostname check')
      rmSync(trace)
    }
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('the actual standby proxy branch validates the active file without copying, formatting or reloading production configuration', { skip: process.platform === 'win32' }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'liangxiang-deploy-proxy-'))
  try {
    const bin = join(directory, 'bin'), active = join(directory, 'Caddyfile.standby'), trace = join(directory, 'trace')
    mkdirSync(bin)
    const content = 'standby.invalid {\n respond "standby"\n}\n'
    writeFileSync(active, content)
    writeFileSync(join(bin, 'caddy'), `#!${process.execPath}\nif(process.argv[2]!=='validate')process.exit(91);require('node:fs').appendFileSync(process.env.DEPLOY_TEST_TRACE,'validate\\n')\n`, { mode: 0o755 })
    const source = readFileSync(new URL('../deploy.sh', import.meta.url), 'utf8')
    const start = source.indexOf('# Begin proxy install')
    const end = source.indexOf('# End proxy install.', start)
    assert.ok(start >= 0 && end > start)
    const block = source.slice(start, end).replaceAll('/etc/caddy/Caddyfile.standby', active)
    const script = 'set -euo pipefail\ninstall(){ exit 92; }\ncp(){ exit 93; }\nsystemctl(){ [[ "$*" == "is-active --quiet caddy" ]]; }\n' + block
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, DEPLOY_ROLE: 'standby',
      STANDBY_PROXY_SHA: createHash('sha256').update(content).digest('hex'), DEPLOY_TEST_TRACE: trace }
    const valid = spawnSync('bash', ['-c', script], { env, encoding: 'utf8' })
    assert.equal(valid.status, 0, valid.stderr)
    assert.equal(readFileSync(active, 'utf8'), content)
    assert.equal(readFileSync(trace, 'utf8'), 'validate\n')
    rmSync(trace)
    const changed = spawnSync('bash', ['-c', script], { env: { ...env, STANDBY_PROXY_SHA: 'wrong' }, encoding: 'utf8' })
    assert.notEqual(changed.status, 0)
    assert.match(changed.stderr, /standby proxy changed/)
    assert.equal(existsSync(trace), false, 'a changed proxy must fail before validation')
    assert.equal(readFileSync(active, 'utf8'), content)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
