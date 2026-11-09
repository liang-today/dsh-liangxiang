import { expect, it } from 'vitest'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { rehearsalPoolOracle, runMarketRehearsal } from '../scripts/rehearse-market.ts'
import { resolveBackendConfig } from '../src/backend/config.ts'
import { createBackendHttpApi } from '../src/backend/http.ts'
import { LiangxiangBackendService } from '../src/backend/service.ts'
import { openBackendStore } from '../src/backend/store.ts'
import { INSTALLATION_HEADER, SIGNATURE_HEADER, TIMESTAMP_HEADER } from '../src/shared/backend-v1.ts'

it('uses a separate whole-stick oracle with stable entry-order remainders and refunds', () => {
  const positions = [
    { client: 0, batch: 1 as const, side: 'long' as const, amount: 10, order: 0 },
    { client: 1, batch: 1 as const, side: 'long' as const, amount: 10, order: 1 },
    { client: 2, batch: 1 as const, side: 'long' as const, amount: 10, order: 2 },
    { client: 3, batch: 1 as const, side: 'short' as const, amount: 20, order: 3 },
  ]
  expect([...rehearsalPoolOracle(positions, 'long').values()]).toEqual([17, 17, 16, 0])
  expect([...rehearsalPoolOracle(positions, null).values()]).toEqual([10, 10, 10, 20])
})

it('rejects remote targets before making requests or writing private state', async () => {
  const report = await runMarketRehearsal({ url: 'https://example.invalid', stateDir: '/unused-private-rehearsal', clockFile: '/unused-clock', mode: 'all' })
  expect(report.status).toBe('failed')
  expect(report.failure).toBe('dedicated_loopback_url_required')
})

it.each([true, false])('drives 12 real signed clients through all pools and midnight (real restart: %s)', async restart => {
  const directory = mkdtempSync(join(tmpdir(), 'liangxiang-signed-rehearsal-'))
  const stateDir = join(directory, 'private'), filename = join(directory, 'ledger.sqlite')
  mkdirSync(stateDir, { mode: 0o700 })
  const clockFile = join(restart ? directory : stateDir, 'clock.json')
  writeFileSync(clockFile, JSON.stringify({ epoch_ms: Date.UTC(2026, 10, 8, 16), anchor_wall_ms: Date.now(), rate: 0 }), { mode: 0o600 })
  chmodSync(directory, 0o700)
  const config = resolveBackendConfig({ LIANGXIANG_BACKEND_DB: filename, LIANGXIANG_ADMISSION_INVENTORY_TARGET: '20', LIANGXIANG_ALLOW_UNSIGNED: '0' })
  let port = 0
  const identities = new Set<string>(), signedAt: number[] = []
  const start = async () => {
    const store = openBackendStore(filename)
    const clock = { now: (): number => {
      const value = JSON.parse(readFileSync(clockFile, 'utf8')) as { epoch_ms: number, anchor_wall_ms: number, rate: number }
      return value.epoch_ms + (Date.now() - value.anchor_wall_ms) * value.rate
    } }
    const service = new LiangxiangBackendService({ store, config, clock, warn: () => undefined })
    service.tick()
    const api = createBackendHttpApi({ service, store, allowUnsigned: false, voteRateLimitPerMinute: 500, voteClock: clock, log: () => undefined })
    api.server.on('request', req => {
      if (req.method === 'POST') {
        expect(req.headers[SIGNATURE_HEADER]).toBeTruthy()
        identities.add(String(req.headers[INSTALLATION_HEADER]))
        signedAt.push(Number(req.headers[TIMESTAMP_HEADER]))
      }
    })
    await new Promise<void>(resolve => api.server.listen(port, '127.0.0.1', resolve))
    const address = api.server.address()
    if (!address || typeof address === 'string') throw new Error('local test listener missing')
    port = address.port
    const interval = setInterval(() => service.tick(), 20)
    return { store, async close() { clearInterval(interval); api.reset(); await new Promise<void>(resolve => api.server.close(() => resolve())); store.close() } }
  }
  let backend = await start()
  try {
    const options = { url: `http://127.0.0.1:${port}`, stateDir, clockFile, timeoutMs: 5_000 }
    const prepared = await runMarketRehearsal({ ...options, mode: restart ? 'prepare' : 'all' })
    expect(prepared.failure).toBeUndefined()
    expect(prepared.status).toBe('passed')
    expect(prepared.restart_verified).toBe(false)
    expect(identities.size).toBe(12)
    // Windows mode bits do not express POSIX access permissions. Its signed
    // clients, restart, private files and money checks still run below.
    if (process.platform !== 'win32') {
      expect(statSync(join(stateDir, 'state.json')).mode & 0o777).toBe(0o600)
      expect(statSync(stateDir).mode & 0o777).toBe(0o700)
    }
    expect(readFileSync(join(stateDir, '.gitignore'), 'utf8')).toBe('*\n')
    if (restart) { await backend.close(); backend = await start() }
    const finished = restart ? await runMarketRehearsal({ ...options, mode: 'finish' }) : prepared
    expect(finished.failure).toBeUndefined()
    expect(finished.status).toBe('passed')
    expect(finished.restart_verified).toBe(restart)
    expect(finished.totals.expected_returned).toBe(finished.totals.invested)
    expect(finished.totals.later_gifts_and_mints).toBe(12 * 11)
    expect(finished.checks.some(row => row.name === 'twelve_wallets_integer_conservation' && row.passed)).toBe(true)
    expect(backend.store.database.prepare('PRAGMA integrity_check').get()?.integrity_check).toBe('ok')
    const before = backend.store.database.prepare('SELECT installation_id,available,frozen FROM incense_wallet ORDER BY installation_id').all()
    const verified = await runMarketRehearsal({ ...options, mode: 'verify' })
    expect(verified.failure).toBeUndefined()
    expect(verified.status).toBe('passed')
    expect(backend.store.database.prepare('SELECT installation_id,available,frozen FROM incense_wallet ORDER BY installation_id').all()).toEqual(before)
    const output = JSON.stringify(finished)
    expect(output).not.toContain('PRIVATE KEY')
    expect(output).not.toContain('lk_')
    expect(output).not.toContain(directory)
    expect(output).not.toContain(options.url)
    expect(signedAt.every(timestamp => Math.abs(timestamp - Date.now()) < 90_000)).toBe(true)
  } finally { await backend.close(); rmSync(directory, { recursive: true, force: true }) }
}, 20_000)
