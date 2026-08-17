import { describe, expect, it } from 'vitest'
import { IdentityRateLimiter, IDENTITY_HIT_WINDOW_MS, IDENTITY_MISS_WINDOW_MS } from '../src/backend/identity-rate-limit.ts'
import { resolveHostRuntimeConfig } from '../src/host/config.ts'
import { STAGING_BACKEND_URL } from '../src/host/community-endpoint.ts'
import { LOCAL_CASE_TITLES, nextLocalCaseIndex } from '../src/host/local-cases.ts'
import { runOperatorCli } from '../src/backend/cli.ts'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('host runtime defaults to online', () => {
  it('uses the baked staging URL when LIANGXIANG_BACKEND_URL is unset', () => {
    const warnings: string[] = []
    const runtime = resolveHostRuntimeConfig({}, (message) => warnings.push(message))
    expect(runtime.backendUrl).toBe(STAGING_BACKEND_URL)
    expect(warnings).toEqual([])
  })

  it('forces local mode when LIANGXIANG_BACKEND_URL=local', () => {
    const runtime = resolveHostRuntimeConfig({ LIANGXIANG_BACKEND_URL: 'local' }, () => undefined)
    expect(runtime.backendUrl).toBeNull()
  })

  it('never turns an invalid online URL into local mode', () => {
    const warnings: string[] = []
    const runtime = resolveHostRuntimeConfig(
      { LIANGXIANG_BACKEND_URL: 'not a url' },
      (message) => warnings.push(message),
    )
    expect(runtime.backendUrl).toBe(STAGING_BACKEND_URL)
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
      ['case', 'queue', 'seed', '--start', '2026-08-19', '--limit', '3', bank],
      env,
      io,
    )).toBe(0)
    expect(logs.join('\n')).toContain('2026-08-19')
    expect(logs.join('\n')).toContain('2026-08-21')
    const collision: string[] = []
    expect(runOperatorCli(
      ['case', 'queue', 'add', '--on', '2026-08-20', '冲突题是夯还是拉'],
      env,
      { log: (line) => collision.push(line), error: (line) => collision.push(line) },
    )).toBe(1)
    expect(collision.join('\n')).toContain('already exists')
    rmSync(dir, { recursive: true, force: true })
  })
})
