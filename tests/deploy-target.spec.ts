import { expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { resolveDeployTarget, verifyHostname, verifyReceipt, verifyHealth } from '../scripts/deploy-target.mjs'

const options = { LIANGXIANG_DEPLOY_ROLE: 'production', LIANGXIANG_DEPLOY_SSH: 'ops@192.0.2.10',
  LIANGXIANG_DEPLOY_EXPECTED_HOSTNAME: 'liangxiang', LIANGXIANG_DEPLOY_SSH_PORT: '18800',
  LIANGXIANG_DEPLOY_HEALTH_URL: 'https://api.example.test/v1/health' }
const dns = async () => [{ address: '192.0.2.20', family: 4 }]

it('requires an explicit role and keeps ordinary hostname role checks', async () => {
  await expect(resolveDeployTarget({ ...options, LIANGXIANG_DEPLOY_ROLE: '' }, dns)).rejects.toThrow('must explicitly')
  await expect(resolveDeployTarget({ ...options, LIANGXIANG_DEPLOY_EXPECTED_HOSTNAME: 'liangxiang-standby-test' }, dns)).rejects.toThrow('selected standby or production role')
})

it('pins TLS health to exactly the SSH IP before DNS changes, preserving the domain', async () => {
  const target = await resolveDeployTarget({ ...options, LIANGXIANG_DEPLOY_HEALTH_CONNECT_IP: '192.0.2.10' }, dns)
  expect(target.healthUrl).toBe(options.LIANGXIANG_DEPLOY_HEALTH_URL)
  expect(target.healthResolve).toBe('api.example.test:443:192.0.2.10')
  await expect(resolveDeployTarget(options, dns)).rejects.toThrow('different targets')
  await expect(resolveDeployTarget({ ...options, LIANGXIANG_DEPLOY_HEALTH_CONNECT_IP: '192.0.2.20' }, dns)).rejects.toThrow('SSH target')
  await expect(resolveDeployTarget({ ...options, LIANGXIANG_DEPLOY_HEALTH_CONNECT_IP: 'host.example.test' }, dns)).rejects.toThrow('literal IP')
})

it('does not let standby targets use a production health alias or arbitrary pinned address', async () => {
  const standby = { ...options, LIANGXIANG_DEPLOY_ROLE: 'standby' }
  await expect(resolveDeployTarget(standby, dns)).rejects.toThrow('exactly match')
  await expect(resolveDeployTarget({ ...standby, LIANGXIANG_DEPLOY_HEALTH_CONNECT_IP: '192.0.2.10' }, dns)).rejects.toThrow('production')
  expect((await resolveDeployTarget({ ...standby, LIANGXIANG_DEPLOY_HEALTH_URL: 'https://192.0.2.10/v1/health' }, dns)).role).toBe('standby')
})

it('rejects a changed host, stale receipt or mismatched running version', () => {
  expect(() => verifyHostname('liangxiang', 'other')).toThrow()
  expect(() => verifyReceipt('2.0.0-u1 abcdef0 2026-11-08T12:00:00Z', 'fffffff', '2.0.0-u1')).toThrow()
  expect(() => verifyHealth({ status: 'ok', authority_mode: 'DEV_STAGING_ONLY', version: '1.2.0', server_build: '1.2.0-u2' }, '2.0.0', '2.0.0-u1')).toThrow()
})

// Native Windows cannot execute the target's POSIX deployment scripts and shell stubs.
it.skipIf(process.platform === 'win32')('prepare-only builds a fallback artifact without calling the live installer, health route or service lifecycle', () => {
  const directory = mkdtempSync(join(tmpdir(), 'liangxiang-prepare-only-'))
  try {
    const calls = join(directory, 'calls'), input = join(directory, 'input')
    writeFileSync(join(directory, 'git'), '#!/bin/sh\ncase "$1" in rev-parse) echo abcdef0 ;; status) ;; *) exit 1 ;; esac\n', { mode: 0o700 })
    writeFileSync(join(directory, 'rsync'), '#!/bin/sh\necho rsync >> "$LIANGXIANG_TEST_CALLS"\n', { mode: 0o700 })
    writeFileSync(join(directory, 'curl'), '#!/bin/sh\necho unexpected-health >> "$LIANGXIANG_TEST_CALLS"\nexit 99\n', { mode: 0o700 })
    writeFileSync(join(directory, 'ssh'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$LIANGXIANG_TEST_CALLS"\ncase "$*" in *hostname) echo liangxiang ;; *"bash -s"*) cat >> "$LIANGXIANG_TEST_INPUT" ;; esac\n', { mode: 0o700 })
    const result = spawnSync('/bin/bash', ['scripts/deploy.sh'], { encoding: 'utf8', timeout: 5_000,
      env: { ...process.env, ...options, PATH: `${directory}:${process.env.PATH}`,
        LIANGXIANG_DEPLOY_MODE: 'standard', LIANGXIANG_DEPLOY_PREPARE_ONLY: '1',
        LIANGXIANG_DEPLOY_HEALTH_CONNECT_IP: '192.0.2.10', LIANGXIANG_TEST_CALLS: calls, LIANGXIANG_TEST_INPUT: input } })
    expect(result.status, result.stderr).toBe(0)
    expect(readFileSync(calls, 'utf8')).toContain('pnpm run build')
    expect(readFileSync(calls, 'utf8')).not.toContain('unexpected-health')
    expect(readFileSync(input, 'utf8')).toContain('backend.tar.gz')
    expect(readFileSync(input, 'utf8')).not.toMatch(/systemctl|\/etc\/systemd|ENV_FILE=/)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})


it.skipIf(process.platform === 'win32')('the actual remote installer accepts SSH dropping the optional empty TLS pin argument', () => {
  const source = readFileSync('scripts/deploy.sh', 'utf8')
  const remote = source.split("<<'REMOTE_SCRIPT'\n")[1]!.split('ENV_FILE=')[0]!
  const args = ['prefix', 'stage', 'sha', 'stamp', 'build', 'standby', 'liangxiang', 'proxy', 'health', '2.0.0']
  for (const pin of ['', 'api.example.test:443:192.0.2.10']) {
    const result = spawnSync('/bin/bash', ['-s', '--', ...args, ...(pin ? [pin] : [])], {
      input: remote + '\nprintf "%s" "$HEALTH_RESOLVE"\n', encoding: 'utf8',
    })
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toBe(pin)
  }
})
