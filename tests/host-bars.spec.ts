import { createServer } from 'node:http'
import { mkdtempSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FakeAuthoritativeLiangService, type LiangServiceConfig } from '../src/host/fake-service.ts'
import { BarsRecorder, createBarsRecorder } from '../src/host/bars.ts'
import { readBarsDay, barsDayPath, listBarsDayDates } from '../src/host/bars-store.ts'
import { createLiangxiangApi } from '../src/host/routes.ts'
import type { LiangHostService } from '../src/host/service.ts'
import type { LiangxiangWireState } from '../src/shared/wire.ts'

const CONFIG: LiangServiceConfig = {
  timezone: 'Asia/Shanghai',
  tokenPerIncense: 50_000,
  snapshotRefreshSeconds: 1,
  seed: 'empty',
  caseTitle: 'DeepSeek Harness 是夯还是拉',
}

const T0 = Date.UTC(2026, 10, 5, 1, 0, 0)

const roots: string[] = []
let closeHarness: (() => Promise<void>) | null = null

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'liangxiang-bars-'))
  roots.push(root)
  return root
}

function wire(now: number, upVotes: number, downVotes: number, caseId = 'case-a'): LiangxiangWireState {
  return {
    schemaVersion: 1,
    revision: 1,
    hostEpoch: 'epoch',
    authorityMode: 'LOCAL_FAKE_DEV',
    authorityAvailable: true,
    authorityReason: null,
    snapshotRefreshSeconds: 1,
    businessDate: '2026-11-05',
    archiveVersion: 0,
    activeCase: { id: caseId, businessDate: '2026-11-05', title: '今日梁案', status: 'active', createdAt: now, tokenPerIncense: 50_000 },
    global: { caseId, upVotes, downVotes, uniqueVoters: upVotes + downVotes > 0 ? 1 : 0, capturedAt: now, sequence: 1, lifetimeIncense: upVotes + downVotes, lifetimeVoters: 1 },
    personal: {},
    accounting: {},
    broadcast: null,
  } as unknown as LiangxiangWireState
}

function recorder(root: string, clock: { t: number }, state: () => LiangxiangWireState | null, warn: string[] = []): BarsRecorder {
  return new BarsRecorder({
    root,
    timezone: 'Asia/Shanghai',
    sampleMs: 1_000,
    flushMs: 30_000,
    now: () => clock.t,
    warn: message => warn.push(message),
    readState: state,
  })
}

afterEach(async () => {
  await closeHarness?.()
  closeHarness = null
})

describe('bars day files', () => {
  it('writes one atomically replaced file per business date and reads it back', () => {
    const root = tempRoot()
    const clock = { t: T0 }
    const rec = recorder(root, clock, () => wire(clock.t, 3, 1))
    rec.sampleOnce(wire(T0, 3, 1))
    rec.flush()
    const path = barsDayPath(root, '2026-11-05')
    expect(path).toContain(join('days', '2026-11-05.json'))
    expect(listBarsDayDates(root)).toEqual(['2026-11-05'])
    const day = readBarsDay(root, '2026-11-05', () => undefined)
    expect(day?.businessDate).toBe('2026-11-05')
    expect(day?.buckets.length).toBeGreaterThan(0)
    expect(day?.buckets[0]?.close).toBeCloseTo(0.75)
    // The temp file used for the atomic rename never survives a flush.
    expect(readdirSync(join(root, 'days'))).toEqual(['2026-11-05.json'])
    rec.dispose()
  })

  it('skips a corrupt day file instead of breaking the chart', () => {
    const root = tempRoot()
    mkdirSync(join(root, 'days'), { recursive: true })
    writeFileSync(barsDayPath(root, '2026-11-05'), '{"schemaVersion":99}')
    const warn: string[] = []
    expect(readBarsDay(root, '2026-11-05', message => warn.push(message))).toBeNull()
    expect(warn.length).toBe(1)
  })

  it('refuses to read a day file whose date does not match its name', () => {
    const root = tempRoot()
    mkdirSync(join(root, 'days'), { recursive: true })
    writeFileSync(barsDayPath(root, '2026-11-05'), JSON.stringify({
      businessDate: '2026-11-04',
      intervalMs: 300_000,
      buckets: [],
      gaps: [],
      cases: [],
      breaks: [],
      policyVersions: [],
      firstSampleAt: 0,
      lastSampleAt: 0,
      closedAt: null,
    }))
    const warn: string[] = []
    expect(readBarsDay(root, '2026-11-05', message => warn.push(message))).toBeNull()
    expect(warn.length).toBe(1)
  })
})

describe('bars recorder', () => {
  it('marks the outage a restart leaves behind instead of pretending continuity', () => {
    const root = tempRoot()
    const clock = { t: T0 }
    const first = recorder(root, clock, () => wire(clock.t, 2, 0))
    first.sampleOnce(wire(T0, 2, 0))
    first.flush()
    first.dispose()

    // Host comes back two hours later, same business date.
    clock.t = T0 + 2 * 60 * 60_000
    const warn: string[] = []
    const second = recorder(root, clock, () => wire(clock.t, 5, 1), warn)
    second.sampleOnce(wire(clock.t, 5, 1))
    const payload = second.read({ from: null, to: null, interval: '5m' })
    const day = payload.days[0]
    expect(day?.gaps.length).toBe(1)
    expect(day?.gaps[0]?.reason).toBe('host-down')
    expect(day?.buckets.some(candle => candle.gap)).toBe(true)
    expect(payload.days[0]?.buckets.at(-1)?.close).toBeCloseTo(5 / 6)
    expect(warn).toEqual([])
    second.dispose()
  })

  it('keeps one series per business date and seals yesterday on rollover', () => {
    const root = tempRoot()
    const clock = { t: T0 }
    let state = wire(T0, 1, 0)
    const rec = recorder(root, clock, () => state)
    rec.sampleOnce(state)
    clock.t = T0 + 24 * 60 * 60_000
    state = { ...wire(clock.t, 2, 0), businessDate: '2026-11-06' }
    rec.sampleOnce(state)
    rec.flush()
    expect(listBarsDayDates(root)).toContain('2026-11-05')
    rec.dispose()
  })

  it('is switched off by LIANGXIANG_BARS=0', () => {
    const root = tempRoot()
    expect(createBarsRecorder({
      getWireState: () => wire(T0, 1, 0),
      timezone: 'Asia/Shanghai',
      warn: () => undefined,
      env: { LIANGXIANG_BARS: '0', LIANGXIANG_BARS_DIR: root } as NodeJS.ProcessEnv,
      home: root,
    })).toBeNull()
  })
})

async function startRoutes(options: { bars?: BarsRecorder, ready?: boolean } = {}): Promise<{ baseUrl: string }> {
  const service = new FakeAuthoritativeLiangService(CONFIG, { now: () => T0 }, () => undefined)
  if (options.ready !== false) service.markReadyMemoryOnly('bars-route-test')
  const api = createLiangxiangApi(service as LiangHostService, () => undefined, {
    ...(options.bars === undefined ? {} : { bars: options.bars }),
    selectAuthorityMode: () => undefined,
    isAuthorityModeChanging: () => false,
  })
  const server = createServer((req, res) => {
    void api.handler(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('route test server did not bind')
  closeHarness = async () => {
    api.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
  return { baseUrl: `http://127.0.0.1:${address.port}` }
}

describe('bars routes', () => {
  function seedRecorder(): BarsRecorder {
    const root = tempRoot()
    const clock = { t: T0 }
    const rec = recorder(root, clock, () => wire(clock.t, 3, 1))
    rec.sampleOnce(wire(T0, 3, 1))
    clock.t = T0 + 5 * 60_000
    rec.sampleOnce(wire(clock.t, 4, 1))
    rec.flush()
    return rec
  }

  it('serves the raw series as JSON', async () => {
    const rec = seedRecorder()
    const { baseUrl } = await startRoutes({ bars: rec })
    const response = await fetch(`${baseUrl}/liangxiang/api/bars?interval=5m`)
    expect(response.status).toBe(200)
    const payload = await response.json() as { channel: string, days: { buckets: unknown[] }[], meta: { intervals: string[] } }
    expect(payload.channel).toBe('host-observation')
    expect(payload.meta.intervals).toContain('1h')
    expect(payload.days[0]?.buckets.length).toBe(2)
    rec.dispose()
  })

  it('serves the rendered SVG with a content hash, a CSP and no script', async () => {
    const rec = seedRecorder()
    const { baseUrl } = await startRoutes({ bars: rec })
    const response = await fetch(`${baseUrl}/liangxiang/api/bars.svg?interval=5m&theme=light&w=640&h=240`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('image/svg+xml')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'")
    const etag = response.headers.get('etag')
    expect(etag).toMatch(/^"[A-Za-z0-9_-]{27}"$/)
    // A live window must never be cached; a sealed one may be.
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.text()
    expect(body).not.toMatch(/<script/i)
    rec.dispose()
  })

  it('rejects an unknown parameter instead of guessing', async () => {
    const rec = seedRecorder()
    const { baseUrl } = await startRoutes({ bars: rec })
    const response = await fetch(`${baseUrl}/liangxiang/api/bars?interval=7m`)
    expect(response.status).toBe(400)
    rec.dispose()
  })

  it('answers meta and keeps working while the Host is not ready yet', async () => {
    const rec = seedRecorder()
    const { baseUrl } = await startRoutes({ bars: rec, ready: false })
    const meta = await fetch(`${baseUrl}/liangxiang/api/bars/meta`)
    expect(meta.status).toBe(200)
    const body = await meta.json() as { days: string[] }
    expect(body.days).toContain('2026-11-05')
    rec.dispose()
  })

  it('degrades to 503 when the recorder is switched off', async () => {
    const { baseUrl } = await startRoutes()
    const response = await fetch(`${baseUrl}/liangxiang/api/bars.svg`)
    expect(response.status).toBe(503)
  })
})
