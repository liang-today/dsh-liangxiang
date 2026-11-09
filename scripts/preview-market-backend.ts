/**
 * Disposable, loopback-only market demonstration. Never a deployment entry.
 * Run with the repository's Node/pnpm baseline:
 *   LIANGXIANG_LOCAL_PREVIEW=1 pnpm exec unrun scripts/preview-market-backend.ts
 * Connect an isolated DSH Profile to http://127.0.0.1:4199.
 * The first local installation receives synthetic funds and a P1 short order;
 * real service transactions then advance the simulated business clock to 13:00.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveBackendConfig } from '../src/backend/config.ts'
import { createBackendHttpApi } from '../src/backend/http.ts'
import { LiangxiangBackendService } from '../src/backend/service.ts'
import { openBackendStore } from '../src/backend/store.ts'
import { marketBusinessHour, compareMarketRatios } from '../src/domain/market.ts'
import { createBusinessDateProvider } from '../src/shared/business-date.ts'

if (process.env.LIANGXIANG_LOCAL_PREVIEW !== '1') {
  throw new Error('This disposable mock requires LIANGXIANG_LOCAL_PREVIEW=1; it never uses production configuration.')
}

const timezone = 'Asia/Shanghai'
const date = createBusinessDateProvider(timezone).businessDateOf(Date.now())
const at = (hour: number, minute = 0): number => marketBusinessHour(date, timezone, hour) + minute * 60_000
const directory = mkdtempSync(join(tmpdir(), 'liangxiang-market-preview-'))
const config = resolveBackendConfig({
  LIANGXIANG_BACKEND_DB: join(directory, 'preview.sqlite'),
  LIANGXIANG_BACKEND_HOST: '127.0.0.1', LIANGXIANG_BACKEND_PORT: '4199',
  LIANGXIANG_BUSINESS_TZ: timezone, LIANGXIANG_SNAPSHOT_SECONDS: '1',
  LIANGXIANG_ADMISSION_INVENTORY_TARGET: '10',
})
const store = openBackendStore(config.databasePath)
let simulated = at(0)
let runningSince: number | null = null
const clock = { now: (): number => simulated + (runningSince === null ? 0 : Date.now() - runningSince) }
const service = new LiangxiangBackendService({ store, config, clock })
const api = createBackendHttpApi({ service, store, allowUnsigned: false,
  voteRateLimitPerMinute: config.voteRateLimitPerMinute,
  voteRateLimitMaxKeys: config.voteRateLimitMaxKeys,
  admissionClaimRateLimitPerMinute: config.admissionClaimRateLimitPerMinute,
})

const maker = 'preview-market-maker'
const peerLong = 'preview-market-long'
const peerShort = 'preview-market-short'
let serial = 0
const fund = (id: string, incense: number): void => {
  service.dailyState(id)
  const claimed = store.incenseFor(id, date)?.claimed_effective_tokens ?? 0
  service.applyTokenClaim(id, { claim_business_date: date, claimed_effective_tokens: claimed + incense * config.tokenPerIncense })
}
const vote = (side: 'up' | 'down', count: number): void => {
  const response = service.vote(maker, { case_id: service.ensureActiveCase().id,
    vote_type: side, count, request_id: `preview-seed-${serial++}` })
  if (response.result.status !== 'accepted') throw new Error('preview vote seed was rejected')
}
const position = (id: string, batch: 1 | 2 | 3, side: 'long' | 'short', amount: number): void => {
  const market = service.marketState(id).market
  if (market === null) throw new Error('preview market missing')
  const response = service.setMarketPosition(id, { market_id: market.id, batch,
    side, amount, request_id: `preview-position-${serial++}` })
  if (!response.accepted) throw new Error(`preview position rejected: ${response.reason}`)
}

// A fresh disposable database must not reuse an old demo's chart-cache identity.
service.publishCase('本地演示 · 三批投入，午夜共同收盘')
fund(maker, 3_000)
fund(peerLong, 200)
fund(peerShort, 200)
vote('up', 200)
vote('down', 200)
// Initial seed votes warm up the disposable case before recorded history.
// Keep their accepted votes, then begin the demonstration at the first minute.
store.database.prepare('DELETE FROM liang_market_minute_candle WHERE case_id=? AND at=?')
  .run(service.ensureActiveCase().id, at(0))
for (let i = 1; i <= 600; i += 1) {
  simulated = at(0) + i * 60_000
  const up = 1 + Math.round(Math.sin(i / 25))
  if (up > 0) vote('up', up)
  if (up < 2) vote('down', 2 - up)
}
simulated = at(10)
position(peerLong, 1, 'long', 50)
position(peerShort, 1, 'short', 50)

let prepared = false
function prepareFirstInstallation(): void {
  if (prepared) return
  const forced = process.env.LIANGXIANG_PREVIEW_SEED_ID
  const identity = forced === undefined
    ? store.database.prepare('SELECT installation_id FROM community_identity ORDER BY created_at LIMIT 1').get() as { installation_id: string } | undefined
    : { installation_id: forced }
  if (identity === undefined) return
  prepared = true
  fund(identity.installation_id, 5_000)
  position(identity.installation_id, 1, 'short', 20)
  for (let i = 1; i <= 120; i += 1) {
    simulated = at(10) + i * 60_000
    vote('up', 2 + Math.round(Math.sin(i / 15)))
    vote('down', 1)
  }
  for (let i = 1; i <= 60; i += 1) {
    simulated = at(12) + i * 60_000
    vote('up', 1)
    vote('down', 2)
  }
  simulated = at(13)
  service.tick()
  position(peerLong, 2, 'long', 30)
  position(peerShort, 2, 'short', 30)
  const state = service.marketState(identity.installation_id)
  const reference = state.market?.batches[0]?.reference
  if (!reference || !state.current_point || compareMarketRatios(state.current_point, reference) >= 0) {
    throw new Error('preview should show an advantageous P1 short position')
  }
  runningSince = Date.now()
  // Advancing the demo clock can expire startup tickets; keep this disposable
  // environment joinable after its synthetic history has been prepared.
  service.replenishAdmissionInventory()
  console.log('[liangxiang-preview] Synthetic 5,000-incense funds and P1 short prepared; simulated clock is 13:00, P2 is open.')
}

const timer = setInterval(() => {
  try { prepareFirstInstallation(); service.tick() }
  catch (error) { console.error(`[liangxiang-preview] ${error instanceof Error ? error.message : String(error)}`) }
}, 500)
api.server.listen(4199, '127.0.0.1', () => {
  console.log('[liangxiang-preview] MOCK ONLY: isolated SQLite and accepted-vote fixtures on http://127.0.0.1:4199.')
  console.log('[liangxiang-preview] Waiting at simulated 10:00 for the first isolated DSH installation; no production service is contacted.')
})
let closed = false
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
  if (closed) return
  closed = true
  clearInterval(timer)
  api.reset()
  api.server.close(() => { store.close(); process.exit(0) })
})
