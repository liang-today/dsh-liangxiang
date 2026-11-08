import { expect, test, type Page } from '@playwright/test'
import { FakeAuthoritativeLiangService } from '../../src/host/fake-service.ts'
import { isRequestId } from '../../src/domain/index.ts'
import { parseWireVoteResponse, WIRE_SCHEMA_VERSION, type LiangxiangWireState, type WireVoteRequest, type WireVoteResponse } from '../../src/shared/wire.ts'
import type { MarketPositionRequest, MarketState } from '../../src/shared/market-v1.ts'
import { bootInstalledLiangxiang, openPanel } from './helpers.ts'

// Route a reserved test hostname to the isolated loopback Host. This changes
// routing only: Chromium must still expose its real insecure-context API set.
const HTTP_HOST = 'liangxiang-http.test'
test.use({ launchOptions: { args: [`--host-resolver-rules=MAP ${HTTP_HOST} 127.0.0.1`, '--no-proxy-server'] } })

const DAY = Date.UTC(2026, 10, 6), HOUR = 3_600_000
function marketFixture(): MarketState {
  const schedule = [[7, 11, 12], [12, 16, 17], [17, 21, 22]] as const
  return {
    schema_version: 1, soft_trust: true, server_time: DAY + 13 * HOUR, candle_interval_ms: 60_000,
    wallet: { available_incense: 100, frozen_incense: 0, total_incense: 100, token_remainder: 0, token_per_incense: 50_000, version: 1 },
    current_point: { case_id: 'case-http-browser', at: DAY + 13 * HOUR, up_votes: 55, down_votes: 45, sequence: 1 },
    market: { id: 'market-http-browser', case_id: 'case-http-browser', business_date: '2026-11-06', timezone: 'UTC', rule_version: 'liangxiang-market-v3',
      opens_at: DAY + 7 * HOUR, closes_at: DAY + 24 * HOUR, status: 'open', close_point: null,
      batches: schedule.map(([open, lock, reference], index) => ({ batch: (index + 1) as 1 | 2 | 3,
        opens_at: DAY + open * HOUR, locks_at: DAY + lock * HOUR, reference_at: DAY + reference * HOUR,
        status: index === 0 ? 'live' : index === 1 ? 'open' : 'pending',
        reference: index === 0 ? { case_id: 'case-http-browser', at: DAY + 12 * HOUR, up_votes: 50, down_votes: 50, sequence: 1 } : null,
        long_incense: 0, short_incense: 0, position: null, result: null })) },
  }
}

async function bootHttp(page: Page): Promise<WireVoteRequest[]> {
  const base = new URL(process.env.LIANGXIANG_BROWSER_BASE_URL!)
  // Never send process auth to an external hostname or a personal Host.
  expect(['127.0.0.1', 'localhost']).toContain(base.hostname)
  const entry = new URL(process.env.LIANGXIANG_BROWSER_AUTH_URL ?? '/', base)
  expect(['127.0.0.1', 'localhost']).toContain(entry.hostname)
  expect(entry.port).toBe(base.port)
  entry.hostname = HTTP_HOST
  const service = new FakeAuthoritativeLiangService({ timezone: 'UTC', tokenPerIncense: 50_000, snapshotRefreshSeconds: 300,
    seed: 'demo', caseTitle: 'HTTP兼容回归' }, { now: () => DAY + 13 * HOUR }, () => undefined)
  service.markReadyMemoryOnly('http-browser')
  service.setAccountingAvailable(true)
  service.observeUsage('http-browser-session', { uncachedInputTokens: 400_000, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 },
    { kind: 'live', firstLiveSeq: 0 }, 'deepseek-v4-pro')
  const wire = (): LiangxiangWireState => ({ ...service.getWireState(), authorityMode: 'DEV_STAGING_ONLY', authorityAvailable: true })
  const votes: WireVoteRequest[] = []
  // State/vote and market responses in these cases are browser-local mocks;
  // neither the shared Hong Kong ledger nor the installed Host's ledger moves.
  await page.addInitScript(() => {
    const Native = window.EventSource
    window.EventSource = new Proxy(Native, { construct(target, args) {
      const path = new URL(String(args[0]), location.href).pathname
      if (path === '/liangxiang/api/events' || path === '/liangxiang/api/market/events') {
        return { onmessage: null, onerror: null, close() {} }
      }
      return Reflect.construct(target, args)
    } })
  })
  await page.route(/\/liangxiang\/api\/(?:state|refresh)(?:\?|$)/, route => route.fulfill({ json: wire() }))
  await page.route('**/liangxiang/api/vote', async route => {
    const intent = route.request().postDataJSON() as WireVoteRequest
    votes.push(intent)
    const outcome = service.vote(intent)
    const response: WireVoteResponse = { schemaVersion: WIRE_SCHEMA_VERSION, ...outcome, state: wire() }
    parseWireVoteResponse(response)
    await route.fulfill({ json: response })
  })
  await bootInstalledLiangxiang(page, { entryUrl: entry.href })
  expect(await page.evaluate(() => ({ secure: isSecureContext, uuid: typeof crypto.randomUUID, randomValues: typeof crypto.getRandomValues })))
    .toEqual({ secure: false, uuid: 'undefined', randomValues: 'function' })
  return votes
}

test('real HTTP context sends two distinct vote intents and releases the vote lock', async ({ page }) => {
  const votes = await bootHttp(page), panel = await openPanel(page)
  await panel.locator('[data-liangxiang-vote="up"]').click()
  await expect.poll(() => votes.length).toBe(1)
  await expect(panel.locator('[data-liangxiang-vote-feedback]')).toContainText('已上香')
  await panel.locator('[data-liangxiang-vote="down"]').click()
  await expect.poll(() => votes.length).toBe(2)
  expect(votes.map(vote => vote.voteType)).toEqual(['up', 'down'])
  expect(votes.every(vote => isRequestId(vote.requestId))).toBe(true)
  expect(votes[0]!.requestId).not.toBe(votes[1]!.requestId)
})

test('real HTTP context submits a market position with the shared request-id fallback', async ({ page }) => {
  let current = marketFixture()
  const intents: MarketPositionRequest[] = []
  const headers = { 'x-liangxiang-cache-scope': 'http-browser-market' }
  await page.route('**/liangxiang/api/market', route => route.fulfill({ json: current, headers }))
  await page.route('**/liangxiang/api/market/history?*', route => route.fulfill({ json: { schema_version: 1, receipts: [], next_cursor: null }, headers }))
  await page.route('**/liangxiang/api/market/candles?*', route => route.fulfill({ json: { schema_version: 1, case_id: 'case-http-browser', business_date: '2026-11-06', interval_ms: 60_000, candles: [], next_cursor: null }, headers }))
  await page.route('**/liangxiang/api/market/position', async route => {
    const intent = route.request().postDataJSON() as MarketPositionRequest
    intents.push(intent)
    current = { ...current, server_time: current.server_time + 1,
      wallet: { ...current.wallet, available_incense: 95, frozen_incense: 5, version: 2 },
      market: { ...current.market!, batches: current.market!.batches.map(batch => batch.batch !== 2 ? batch : {
        ...batch, long_incense: 5, position: { side: 'long', amount: 5, submitted_at: current.server_time, payout: null },
      }) } }
    await route.fulfill({ json: { accepted: true, reason: null, request_id: intent.request_id, state: current }, headers })
  })
  await bootHttp(page)
  const panel = await openPanel(page)
  await panel.locator('[data-liangxiang-market-entry]').click()
  const dialog = page.getByRole('dialog', { name: '梁股 · 香火市场', exact: true })
  await expect(dialog).toBeVisible()
  const ticket = dialog.locator('[data-liangxiang-market-batch="2"]')
  await ticket.getByRole('button', { name: '↗ 做多' }).click()
  await ticket.getByRole('spinbutton', { name: '午盘总投入香火' }).fill('5')
  await ticket.getByRole('button', { name: '确认投入' }).click()
  await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('95')
  await expect(dialog.locator('[data-liangxiang-market-frozen]')).toHaveText('5')
  expect(intents).toHaveLength(1)
  expect(intents[0]).toMatchObject({ batch: 2, side: 'long', amount: 5 })
  expect(isRequestId(intents[0]!.request_id)).toBe(true)
})
