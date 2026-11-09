import { expect, test, type Page } from '@playwright/test'
import type { MarketCandle, MarketState } from '../../src/shared/market-v1.ts'
import { bootInstalledLiangxiang, openPanel } from './helpers.ts'

declare global {
  interface Window { __liangxiangRecoveryNativeEventSource?: typeof EventSource }
}

const DAY = Date.UTC(2026, 10, 6), HOUR = 3_600_000, MINUTE = 60_000
const SCOPE = 'native-market-recovery-test'
function fixture(): MarketState {
  const time = DAY + 13 * HOUR
  return { schema_version: 1, soft_trust: true, server_time: time, candle_interval_ms: MINUTE,
    wallet: { available_incense: 90, frozen_incense: 10, total_incense: 100, token_remainder: 0, token_per_incense: 50_000, version: 1 },
    current_point: { case_id: 'native-recovery-case', at: time, up_votes: 55, down_votes: 45, sequence: 1 },
    current_candle: { at: time - MINUTE, open: .55, high: .55, low: .55, close: .55, up_votes: 55, down_votes: 45, volume: 0 },
    market: { id: 'native-recovery-market', case_id: 'native-recovery-case', business_date: '2026-11-06', timezone: 'UTC', rule_version: 'liangxiang-market-v3', opens_at: DAY + 7 * HOUR, closes_at: DAY + 24 * HOUR, status: 'open', close_point: null,
      batches: ([[7, 11, 12], [12, 16, 17], [17, 21, 22]] as const).map(([open, lock, reference], index) => ({
        batch: (index + 1) as 1 | 2 | 3, opens_at: DAY + open * HOUR, locks_at: DAY + lock * HOUR, reference_at: DAY + reference * HOUR,
        status: index === 0 ? 'live' : index === 1 ? 'open' : 'pending',
        reference: index === 0 ? { case_id: 'native-recovery-case', at: DAY + reference * HOUR, up_votes: 50, down_votes: 50, sequence: 1 } : null,
        long_incense: index === 1 ? 30 : 0, short_incense: index === 1 ? 20 : 0, position: index === 1 ? { side: 'long', amount: 10, submitted_at: DAY + 12 * HOUR, payout: null } : null, result: null,
      })) },
  }
}

function otherVoterFrame(): MarketState {
  const original = fixture(), ratio = 55 / 104, at = DAY + 13 * HOUR + MINUTE
  return { ...original, server_time: at + 15_000,
    current_point: { ...original.current_point!, at: at + 15_000, up_votes: 55, down_votes: 49, sequence: 2 },
    current_candle: { at, open: .55, high: .55, low: ratio, close: ratio, up_votes: 55, down_votes: 49, volume: 4 } }
}

interface Requests { state: number[], events: number[], mutations: string[] }
async function setup(page: Page, scenario: 'initial-get-failure' | 'closed-event-source' | 'dispose') {
  const calls: Requests = { state: [], events: [], mutations: [] }
  let current = fixture()
  const rows: MarketCandle[] = [current.current_candle!]
  // Observe the actual constructor without wrapping, replacing or mocking it.
  await page.addInitScript(() => { window.__liangxiangRecoveryNativeEventSource = window.EventSource })
  // The clean-Profile suite starts in local mode. Change presentation mode
  // only, preserving the real Host frame and all of its accounting fields.
  await page.route(/\/liangxiang\/api\/(?:state|refresh)(?:\?|$)/, async route => {
    const response = await route.fetch(), wire = await response.json() as Record<string, unknown>
    await route.fulfill({ response, json: { ...wire, authorityMode: 'DEV_STAGING_ONLY', authorityAvailable: true } })
  })
  // Keep the unrelated main-panel stream quiet. This is still a native
  // EventSource HTTP response; no fake EventSource object is installed.
  await page.route('**/liangxiang/api/events', route => route.fulfill({
    status: 200, contentType: 'text/event-stream', body: ': isolated panel fixture\n\n',
  }))
  await page.route('**/liangxiang/api/market', async route => {
    calls.state.push(Date.now())
    if (scenario === 'initial-get-failure' && calls.state.length === 1) {
      await route.fulfill({ status: 503, json: { error: 'temporary fixture outage' } })
    } else await route.fulfill({ json: current, headers: { 'x-liangxiang-cache-scope': SCOPE } })
  })
  await page.route('**/liangxiang/api/market/candles?*', route => route.fulfill({ json: {
    schema_version: 1, case_id: current.market!.case_id, business_date: current.market!.business_date,
    interval_ms: MINUTE, candles: rows, next_cursor: null,
  } }))
  await page.route('**/liangxiang/api/market/history?*', route => route.fulfill({
    json: { schema_version: 1, receipts: [], next_cursor: null }, headers: { 'x-liangxiang-cache-scope': SCOPE },
  }))
  await page.route('**/liangxiang/api/market/events*', async route => {
    if (new URL(route.request().url()).searchParams.has('native_closed_probe')) {
      await route.fulfill({ status: 503, json: { error: 'native CLOSED fixture' } })
      return
    }
    calls.events.push(Date.now())
    if (scenario === 'closed-event-source' && calls.events.length === 1) {
      await route.fulfill({ status: 503, json: { error: 'temporary fixture outage' } })
      return
    }
    if (scenario === 'closed-event-source') {
      current = otherVoterFrame()
      if (rows.length === 1) rows.push(current.current_candle!)
    }
    // Finite HTTP SSE bodies intentionally end after a real frame. That
    // exercises native EOF/CLOSED plus the client's bounded reconnect loop.
    await route.fulfill({ status: 200, contentType: 'text/event-stream',
      body: `data: ${JSON.stringify({ ...current, cache_scope: SCOPE })}\n\n` })
  })
  await page.route(/\/liangxiang\/api\/(?:market\/position|vote)(?:\?|$)/, async route => {
    calls.mutations.push(route.request().url())
    await route.fulfill({ status: 409, json: { error: 'observer tests never transact' } })
  })
  await bootInstalledLiangxiang(page)
  expect(await page.evaluate(() => window.EventSource === window.__liangxiangRecoveryNativeEventSource
    && EventSource.toString().includes('[native code]'))).toBe(true)
  const panel = await openPanel(page)
  await panel.locator('[data-liangxiang-market-entry]').click()
  const dialog = page.getByRole('dialog', { name: '梁股 · 香火市场', exact: true })
  await expect(dialog).toBeVisible()
  return { dialog, calls }
}

function expectBoundedRetries(times: number[]): void {
  expect(times.length).toBeGreaterThanOrEqual(2)
  expect(times.length).toBeLessThanOrEqual(5)
  for (let index = 1; index < times.length; index++) expect(times[index]! - times[index - 1]!).toBeGreaterThanOrEqual(500)
}

test('native browser recovers an initial market GET failure without a click or transaction', async ({ page }) => {
  const { dialog, calls } = await setup(page, 'initial-get-failure')
  await expect.poll(() => calls.state.length).toBeGreaterThanOrEqual(2)
  await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('90')
  await expect(dialog.locator('[data-liangxiang-market-current-point]')).toHaveAttribute('data-source', 'candle')
  expectBoundedRetries(calls.state)
  expect(calls.mutations).toEqual([])
})

test('native EventSource CLOSED after HTTP 503 is rebuilt and receives another voter candle', async ({ page }) => {
  const { dialog, calls } = await setup(page, 'closed-event-source')
  // Independently establish the browser's real failure semantics: a non-200
  // response closes this native object permanently, so recovery needs a NEW one.
  const readyState = await page.evaluate(async () => new Promise<number>(resolve => {
    const source = new EventSource('/liangxiang/api/market/events?native_closed_probe=1')
    source.onerror = () => { const state = source.readyState; source.close(); resolve(state) }
  }))
  expect(readyState).toBe(2)
  const currentPoint = dialog.locator('[data-liangxiang-market-current-point]')
  await expect(currentPoint).toHaveAttribute('data-ratio', String(55 / 104))
  await expect(currentPoint).toHaveAttribute('data-source', 'candle')
  await expect(dialog.locator('[data-liangxiang-market-volume]').last()).toHaveAttribute('aria-label', /本段上香 4 炷/)
  await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('90')
  await expect(dialog.locator('[data-liangxiang-market-frozen]')).toHaveText('10')
  expectBoundedRetries(calls.events)
  expect(calls.mutations).toEqual([])
})

test('closing the market cancels a queued native reconnect and never sends a transaction', async ({ page }) => {
  const { dialog, calls } = await setup(page, 'dispose')
  await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('90')
  await expect(dialog.getByRole('status').first()).toContainText('自动重连')
  await dialog.getByRole('button', { name: '关闭香火交易' }).click()
  await expect(dialog).toBeHidden()
  const stateRequests = calls.state.length, eventRequests = calls.events.length
  // The last valid frame resets retry delay to one second. Wait past that
  // already-queued deadline; disposal must cancel it rather than simply hide UI.
  await page.waitForTimeout(1_500)
  expect(calls.state).toHaveLength(stateRequests)
  expect(calls.events).toHaveLength(eventRequests)
  expect(calls.mutations).toEqual([])
})
