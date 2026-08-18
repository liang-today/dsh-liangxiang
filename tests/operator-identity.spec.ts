import { describe, expect, it } from 'vitest'
import { IdentityRateLimiter, IDENTITY_HIT_WINDOW_MS, IDENTITY_MISS_WINDOW_MS } from '../src/backend/identity-rate-limit.ts'
import { resolveHostRuntimeConfig } from '../src/host/config.ts'
import { STAGING_BACKEND_URL } from '../src/host/community-endpoint.ts'
import { LOCAL_CASE_TITLES, nextLocalCaseIndex } from '../src/host/local-cases.ts'
import { runOperatorCli } from '../src/backend/cli.ts'
import { PLUGIN_VERSION } from '../src/shared/index.ts'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('host runtime defaults to online', () => {
  it('uses the baked staging URL when LIANGXIANG_BACKEND_URL is unset', () => {
    const warnings: string[] = []
    const runtime = resolveHostRuntimeConfig({}, (message) => warnings.push(message))
    expect(runtime.backendUrl).toBe(STAGING_BACKEND_URL)
    expect(runtime.defaultAuthorityPreference).toBe('online')
    expect(warnings).toEqual([])
  })

  it('forces local mode when LIANGXIANG_BACKEND_URL=local', () => {
    const runtime = resolveHostRuntimeConfig({ LIANGXIANG_BACKEND_URL: 'local' }, () => undefined)
    expect(runtime.backendUrl).toBe(STAGING_BACKEND_URL)
    expect(runtime.defaultAuthorityPreference).toBe('local')
  })

  it('never turns an invalid online URL into local mode', () => {
    const warnings: string[] = []
    const runtime = resolveHostRuntimeConfig(
      { LIANGXIANG_BACKEND_URL: 'not a url' },
      (message) => warnings.push(message),
    )
    expect(runtime.backendUrl).toBe(STAGING_BACKEND_URL)
    expect(runtime.defaultAuthorityPreference).toBe('online')
    expect(warnings.join('\n')).toContain(`using ${STAGING_BACKEND_URL}`)
  })
})

describe('local case list', () => {
  it('cycles through the prepared titles', () => {
    expect(LOCAL_CASE_TITLES.length).toBeGreaterThanOrEqual(3)
    expect(nextLocalCaseIndex(0)).toBe(1)
    expect(nextLocalCaseIndex(LOCAL_CASE_TITLES.length - 1)).toBe(0)
  })
})

describe('identity mutation rate limit', () => {
  it('allows one hit per IP+key inside 10 minutes, then denies', () => {
    const limiter = new IdentityRateLimiter()
    const first = limiter.check(1_000, '1.1.1.1', 'lk_a', 'hit')
    expect(first.allowed).toBe(true)
    const second = limiter.check(1_000 + 60_000, '1.1.1.1', 'lk_a', 'hit')
    expect(second.allowed).toBe(false)
    expect(second.retryAfterMs).toBeGreaterThan(0)
    const later = limiter.check(1_000 + IDENTITY_HIT_WINDOW_MS, '1.1.1.1', 'lk_a', 'hit')
    expect(later.allowed).toBe(true)
  })

  it('treats a public-key miss as a 30-minute probe per IP', () => {
    const limiter = new IdentityRateLimiter()
    expect(limiter.check(0, '8.8.8.8', 'lk_unknown', 'miss').allowed).toBe(true)
    const denied = limiter.check(1_000, '8.8.8.8', 'lk_other', 'miss')
    expect(denied.allowed).toBe(false)
    expect(denied.retryAfterMs).toBeGreaterThan(IDENTITY_MISS_WINDOW_MS - 2_000)
  })
})

describe('operator CLI', () => {
  it('reports the package version without opening the database', () => {
    const logs: string[] = []
    expect(runOperatorCli(
      ['version'],
      {},
      { log: (line) => logs.push(line), error: (line) => logs.push(line) },
    )).toBe(0)
    expect(logs.join('\n')).toContain(`"package_version": "${PLUGIN_VERSION}"`)
    expect(logs.join('\n')).toContain(`[liangxiang-ops] version ${PLUGIN_VERSION}`)
  })

  it('issues tickets and reports the remaining admission inventory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'liangxiang-cli-tickets-'))
    const db = join(dir, 'liangxiang.sqlite')
    const env = { LIANGXIANG_BACKEND_DB: db }
    const logs: string[] = []
    const io = { log: (line: string) => logs.push(line), error: (line: string) => logs.push(line) }
    expect(runOperatorCli(['admission', 'issue', '3', '--claims', '2', '--ttl-hours', '48'], env, io)).toBe(0)
    expect(runOperatorCli(['admission', 'status'], env, io)).toBe(0)
    expect(logs.join('\n')).toContain('issued=3')
    expect(logs.join('\n')).toContain('remaining=6')
    rmSync(dir, { recursive: true, force: true })
  })

  it('accepts Rocky Linux node-22 argv prefixes', () => {
    const logs: string[] = []
    expect(runOperatorCli(
      ['/usr/bin/node-22', '/opt/liangxiang/lib/backend-cli.js', 'status'],
      { LIANGXIANG_BACKEND_DB: ':memory:' },
      { log: (line) => logs.push(line), error: (line) => logs.push(line) },
    )).toBe(0)
    expect(logs.join('\n')).toContain('[liangxiang-ops] status')
  })

  it('publishes a case against sqlite without HTTP', () => {
    const dir = mkdtempSync(join(tmpdir(), 'liangxiang-cli-'))
    const db = join(dir, 'liangxiang.sqlite')
    const logs: string[] = []
    const code = runOperatorCli(
      ['case', 'publish', 'CLI 发布是夯还是拉'],
      {
        LIANGXIANG_BACKEND_DB: db,
        LIANGXIANG_SNAPSHOT_SECONDS: '1',
        LIANGXIANG_MAX_TOKENS_PER_MINUTE: '0',
      },
      { log: (line) => logs.push(line), error: (line) => logs.push(line) },
    )
    expect(code).toBe(0)
    expect(logs.join('\n')).toContain('CLI 发布是夯还是拉')
    expect(logs.join('\n')).toContain('[liangxiang-ops] publish')
    rmSync(dir, { recursive: true, force: true })
  })

  it('seeds a dated, queryable case schedule and refuses date collisions', () => {
    const dir = mkdtempSync(join(tmpdir(), 'liangxiang-cli-seed-'))
    const db = join(dir, 'liangxiang.sqlite')
    const bank = join(dir, 'bank.txt')
    writeFileSync(bank, '# comment\n第一题是夯还是拉\n第二题是夯还是拉\n第三题是夯还是拉\n')
    const env = { LIANGXIANG_BACKEND_DB: db }
    const logs: string[] = []
    const io = { log: (line: string) => logs.push(line), error: (line: string) => logs.push(line) }
    expect(runOperatorCli(
      ['case', 'queue', 'seed', '--start', '2026-08-20', '--limit', '3', bank],
      env,
      io,
    )).toBe(0)
    expect(logs.join('\n')).toContain('2026-08-20')
    expect(logs.join('\n')).toContain('2026-08-22')
    const collision: string[] = []
    expect(runOperatorCli(
      ['case', 'queue', 'add', '--on', '2026-08-21', '冲突题是夯还是拉'],
      env,
      { log: (line) => collision.push(line), error: (line) => collision.push(line) },
    )).toBe(1)
    expect(collision.join('\n')).toContain('already exists')
    rmSync(dir, { recursive: true, force: true })
  })

  it('replaces an existing schedule from the case bank in one command', () => {
    const dir = mkdtempSync(join(tmpdir(), 'liangxiang-cli-replace-'))
    const db = join(dir, 'liangxiang.sqlite')
    const bank = join(dir, 'bank.txt')
    writeFileSync(bank, '# 发布顺序\n今天明天同题是夯还是拉\n后天新题是夯还是拉\n')
    const env = { LIANGXIANG_BACKEND_DB: db }
    const logs: string[] = []
    const io = { log: (line: string) => logs.push(line), error: (line: string) => logs.push(line) }

    expect(runOperatorCli(
      ['case', 'queue', 'add', '--on', '2026-08-19', '待清除旧题是夯还是拉'],
      env,
      io,
    )).toBe(0)
    expect(runOperatorCli(
      ['case', 'queue', 'replace', '--start', '2026-08-20', bank],
      env,
      io,
    )).toBe(0)
    const listLogs: string[] = []
    expect(runOperatorCli(
      ['case', 'queue', 'list'],
      env,
      { log: (line) => listLogs.push(line), error: (line) => listLogs.push(line) },
    )).toBe(0)

    const output = logs.join('\n')
    expect(output).toContain('queue replaced cleared=1 added=2')
    expect(output).toContain('2026-08-20')
    expect(output).toContain('2026-08-21')
    expect(output).toContain('今天明天同题是夯还是拉')
    expect(listLogs.join('\n')).not.toContain('"title": "待清除旧题是夯还是拉"')
    rmSync(dir, { recursive: true, force: true })
  })

  it('refuses archive clear without --yes, then wipes history with it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'liangxiang-cli-archive-'))
    const db = join(dir, 'liangxiang.sqlite')
    const env = { LIANGXIANG_BACKEND_DB: db }
    const refused: string[] = []
    expect(runOperatorCli(
      ['archive', 'clear'],
      env,
      { log: (line) => refused.push(line), error: (line) => refused.push(line) },
    )).toBe(2)
    expect(refused.join('\n')).toContain('--yes')

    const logs: string[] = []
    expect(runOperatorCli(
      ['archive', 'clear', '--yes'],
      env,
      { log: (line) => logs.push(line), error: (line) => logs.push(line) },
    )).toBe(0)
    expect(logs.join('\n')).toContain('archive cleared')
    rmSync(dir, { recursive: true, force: true })
  })

  it('resets today and replaces the admission inventory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'liangxiang-cli-reset-'))
    const db = join(dir, 'liangxiang.sqlite')
    const env = { LIANGXIANG_BACKEND_DB: db }
    const logs: string[] = []
    const io = { log: (line: string) => logs.push(line), error: (line: string) => logs.push(line) }
    expect(runOperatorCli(['status'], env, io)).toBe(0)
    expect(runOperatorCli(['admission', 'issue', '2', '--claims', '9'], env, io)).toBe(0)
    expect(runOperatorCli(['case', 'reset', '--yes'], env, io)).toBe(0)
    expect(runOperatorCli(
      ['admission', 'replace', '--yes', '--count', '3', '--claims', '1', '--ttl-hours', '48'],
      env,
      io,
    )).toBe(0)
    const output = logs.join('\n')
    expect(output).toContain('case reset')
    expect(output).toContain('入梁券 replaced revoked=2 issued=3')
    expect(output).toContain('remaining=3')
    rmSync(dir, { recursive: true, force: true })
  })

  it('replenishes remaining claims up to the inventory target', () => {
    const dir = mkdtempSync(join(tmpdir(), 'liangxiang-cli-replenish-'))
    const db = join(dir, 'liangxiang.sqlite')
    const env = {
      LIANGXIANG_BACKEND_DB: db,
      LIANGXIANG_ADMISSION_INVENTORY_TARGET: '4',
    }
    const logs: string[] = []
    const io = { log: (line: string) => logs.push(line), error: (line: string) => logs.push(line) }
    expect(runOperatorCli(['admission', 'issue', '1'], env, io)).toBe(0)
    expect(runOperatorCli(['admission', 'replenish'], env, io)).toBe(0)
    expect(logs.join('\n')).toContain('replenished issued=3 remaining=4 target=4')
    rmSync(dir, { recursive: true, force: true })
  })
})
