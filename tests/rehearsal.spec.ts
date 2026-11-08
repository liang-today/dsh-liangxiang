import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRehearsalClock, parseRehearsalClock, rehearsalTickMs, startRehearsal, validateRehearsalEnvironment } from '../src/backend/rehearsal.ts'

const paths: string[] = []
function fixture() {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'liangxiang-rehearsal-'))
  paths.push(root)
  const directory = join(root, 'rehearsal'); mkdirSync(directory)
  const clockFile = join(directory, 'clock.json')
  const epoch = Date.parse('2026-11-09T00:00:00+08:00')
  writeFileSync(clockFile, JSON.stringify({ epoch_ms: epoch, anchor_wall_ms: 1000, rate: 0 }), { mode: 0o600 })
  const env = { LIANGXIANG_REHEARSAL: '1', LIANGXIANG_BACKEND_HOST: '127.0.0.1', LIANGXIANG_BACKEND_PORT: '4195',
    LIANGXIANG_BACKEND_DB: join(directory, 'liangxiang-rehearsal.sqlite'), LIANGXIANG_REHEARSAL_CLOCK_FILE: clockFile,
    LIANGXIANG_BUSINESS_TZ: 'Asia/Shanghai', LIANGXIANG_ADMISSION_INVENTORY_TARGET: '20' }
  return { root, clockFile, epoch, env }
}
afterEach(() => { vi.useRealTimers(); for (const path of paths.splice(0)) rmSync(path, { force: true, recursive: true }) })

describe('private rehearsal boundaries', () => {
  it('defaults to the previous cadence and bounds private high-frequency sampling before creating a database', () => {
    expect(rehearsalTickMs(undefined)).toBe(200)
    for (const interval of [20, 40, 200, 1_000]) expect(rehearsalTickMs(String(interval))).toBe(interval)
    const f = fixture()
    for (const value of ['', '0', '19', '1001', '-20', '40.5', 'NaN', 'Infinity', '1e2', ' 40', '40ms']) {
      expect(() => startRehearsal({ ...f.env, LIANGXIANG_REHEARSAL_TICK_MS: value })).toThrow(/Rehearsal tick/)
      expect(existsSync(f.env.LIANGXIANG_BACKEND_DB)).toBe(false)
    }
  })
  it.each([
    { interval: 40, expected: [0, 1, 2, 3, 4, 5] },
    { interval: 200, expected: [2, 4] },
  ])('samples actual minute buckets at 720x with $interval ms ticks without filling missing history', async ({ interval, expected }) => {
    const f = fixture()
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(1_000)
    writeFileSync(f.clockFile, JSON.stringify({ epoch_ms: f.epoch, anchor_wall_ms: 1_000, rate: 720 }))
    const runtime = startRehearsal({ ...f.env, LIANGXIANG_REHEARSAL_TICK_MS: String(interval) })
    try {
      await vi.advanceTimersByTimeAsync(480)
      const db = new DatabaseSync(f.env.LIANGXIANG_BACKEND_DB, { readOnly: true })
      try {
        const rows = db.prepare('SELECT at,volume,up_votes,down_votes FROM liang_market_minute_candle ORDER BY at').all() as { at: number; volume: number; up_votes: number; down_votes: number }[]
        expect(rows.map(row => (row.at - f.epoch) / 60_000)).toEqual(expected)
        expect(rows.every(row => row.volume === 0 && row.up_votes === 0 && row.down_votes === 0)).toBe(true)
        expect(db.prepare('SELECT COUNT(*) AS count FROM incense_wallet_entry').get()?.count).toBe(0)
      } finally { db.close() }
    } finally { await runtime.close() }
  })
  it('advances only the injected business clock, clamps backwards controls and retains elapsed time after restart', () => {
    const f = fixture(); let wall = 1000
    const clock = createRehearsalClock(f.clockFile, () => wall)
    expect(clock.now()).toBe(f.epoch)
    writeFileSync(f.clockFile, JSON.stringify({ epoch_ms: f.epoch, anchor_wall_ms: 1000, rate: 120 }))
    wall = 2000
    expect(clock.now()).toBe(f.epoch + 120_000)
    expect(createRehearsalClock(f.clockFile, () => wall).now()).toBe(f.epoch + 120_000)
    wall = 1500; expect(clock.now()).toBe(f.epoch + 120_000)
    expect(Date.now()).toBeGreaterThan(1000)
  })
  it.each([null, {}, { epoch_ms: 0, anchor_wall_ms: 1000, rate: 0 }, { epoch_ms: Date.now(), anchor_wall_ms: 1, rate: -1 }, { epoch_ms: Date.now(), anchor_wall_ms: 1, rate: Infinity }])('rejects invalid controls: %j', value => {
    expect(() => parseRehearsalClock(value)).toThrow()
  })
  it('rejects ordinary database, unsigned authentication, public bind, wrong port and symlinks before opening SQLite', () => {
    const f = fixture()
    expect(validateRehearsalEnvironment(f.env).clockFile).toBe(f.clockFile)
    for (const changes of [{ LIANGXIANG_REHEARSAL: '0' }, { LIANGXIANG_ALLOW_UNSIGNED: '1' }, { LIANGXIANG_BACKEND_HOST: '0.0.0.0' }, { LIANGXIANG_BACKEND_PORT: '4180' }, { LIANGXIANG_BACKEND_DB: '/var/lib/liangxiang/data/liangxiang.sqlite' }]) {
      expect(() => validateRehearsalEnvironment({ ...f.env, ...changes })).toThrow()
    }
    const other = join(f.root, 'other.json'); writeFileSync(other, readFileSync(f.clockFile)); rmSync(f.clockFile); symlinkSync(other, f.clockFile)
    expect(() => validateRehearsalEnvironment(f.env)).toThrow()
  })
  it('runs real signed-only HTTP with a separate date and no clock-control route', async () => {
    const f = fixture(), runtime = startRehearsal(f.env)
    try {
      const response = await fetch('http://127.0.0.1:4195/v1/snapshot')
      expect(response.status).toBe(200)
      expect((await response.json()).server_time).toBe(f.epoch)
      expect((await fetch('http://127.0.0.1:4195/v1/bootstrap', { headers: { 'x-liangxiang-installation': 'fake' } })).status).toBe(401)
      expect((await fetch('http://127.0.0.1:4195/v1/rehearsal/clock', { method: 'POST', body: '{}' })).status).toBe(404)
    } finally {
      const first = runtime.close(), second = runtime.close()
      expect(first).toBe(second)
      await Promise.all([first, second])
    }
  })
})
