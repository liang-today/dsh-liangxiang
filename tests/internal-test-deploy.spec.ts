import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const temporary: string[] = []
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }) })

function refused(overrides: Record<string, string>, message: string) {
  const directory = mkdtempSync(join(tmpdir(), 'liangxiang-internal-deploy-'))
  temporary.push(directory)
  const marker = join(directory, 'ssh-called')
  writeFileSync(join(directory, 'ssh'), '#!/bin/sh\n: > "$LIANGXIANG_TEST_SSH_MARKER"\nexit 99\n', { mode: 0o700 })
  const result = spawnSync('/bin/bash', ['scripts/deploy-internal-test.sh', 'check'], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 5_000,
    env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, LIANGXIANG_TEST_SSH_MARKER: marker,
      LIANGXIANG_DEPLOY_SSH: 'ops@server.invalid', LIANGXIANG_DEPLOY_SSH_PORT: '18800',
      LIANGXIANG_DEPLOY_ROLE: 'standby', LIANGXIANG_DEPLOY_EXPECTED_HOSTNAME: 'liangxiang-standby-test',
      LIANGXIANG_DEPLOY_HEALTH_URL: 'https://server.invalid/v1/health', ...overrides },
  })
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain(message)
  expect(existsSync(marker)).toBe(false)
}

// These exercise the Linux deployment script through /bin/bash, not a Node-only API.
it.skipIf(process.platform === 'win32')('refuses the production role before making an SSH connection', () => {
  refused({ LIANGXIANG_DEPLOY_ROLE: 'production', LIANGXIANG_DEPLOY_EXPECTED_HOSTNAME: 'liangxiang-prod-test' },
    'standby target required')
})

it.skipIf(process.platform === 'win32')('refuses an ordinary-service destination before making an SSH connection', () => {
  refused({ LIANGXIANG_PREFIX: '/opt/liangxiang' }, 'fixed isolated destinations required')
})
