import { afterEach, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startBackend } from '../src/backend/main.ts'

vi.mock('../src/backend/ntp.ts', () => ({ warnIfClockSkewed: async () => undefined }))

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

it('records every quiet minute with hour-long snapshots without publishing extra snapshots', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'liangxiang-minute-cadence-'))
  const filename = join(directory, 'cadence.sqlite')
  const start = Date.UTC(2026, 7, 16)
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  vi.setSystemTime(start)
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  const backend = startBackend({ LIANGXIANG_BACKEND_DB: filename, LIANGXIANG_BACKEND_PORT: '0',
    LIANGXIANG_BUSINESS_TZ: 'UTC', LIANGXIANG_SNAPSHOT_SECONDS: '3600', LIANGXIANG_ADMISSION_INVENTORY_TARGET: '0' })
  let db: DatabaseSync | undefined
  try {
    await new Promise<void>(resolve => setImmediate(resolve))
    db = new DatabaseSync(filename, { readOnly: true })
    vi.advanceTimersByTime(3 * 60_000 + 1_000)
    const rows = db.prepare('SELECT at,volume FROM liang_market_minute_candle ORDER BY at').all()
    expect(rows).toEqual(Array.from({ length: 4 }, (_, i) => ({ at: start + i * 60_000, volume: 0 })))
    expect(db.prepare('SELECT COUNT(*) AS n FROM public_liang_snapshot').get()?.n).toBe(1)
    vi.advanceTimersByTime(30_000)
    expect(db.prepare('SELECT COUNT(*) AS n FROM liang_market_minute_candle').get()?.n).toBe(4)
  } finally {
    db?.close(); backend.close()
    await new Promise<void>(resolve => setImmediate(resolve))
    rmSync(directory, { recursive: true, force: true })
  }
})
