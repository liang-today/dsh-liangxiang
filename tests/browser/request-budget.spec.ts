import { expect, test, type Page } from '@playwright/test'
import { BROWSER_REQUEST_TIMEOUT_MS } from '../../src/shared/request-budget.ts'
import { parseMarketState, type MarketPositionRequest, type MarketState } from '../../src/shared/market-v1.ts'
import type { LiangxiangWireState } from '../../src/shared/wire.ts'
import { bootInstalledLiangxiang, openPanel } from './helpers.ts'

declare global {
  interface Window {
    __liangxiangBudgetNativeFetch?: typeof fetch
    __liangxiangBudgetNativeEvents?: typeof EventSource
  }
}

const DAY = Date.UTC(2026, 10, 6), HOUR = 3_600_000, MINUTE = 60_000
const SCOPE = 'native-request-budget-fixture'
type Scenario = 'seven-second-read' | 'read-timeout' | 'order-timeout' | 'close-slow-read'

function fixture(): MarketState {
  const now = DAY + 13 * HOUR
  return { schema_version: 1, soft_trust: true, server_time: now, candle_interval_ms: MINUTE,
    wallet: { available_incense: 90, frozen_incense: 10, total_incense: 100, token_remainder: 0, token_per_incense: 50_000, version: 1 },
    current_point: { case_id: 'request-budget-case', at: now, up_votes: 55, down_votes: 45, sequence: 1 },
    current_candle: { at: now - MINUTE, open: .55, high: .55, low: .55, close: .55, up_votes: 55, down_votes: 45, volume: 0 },
    market: { id: 'request-budget-market', case_id: 'request-budget-case', business_date: '2026-11-06', timezone: 'UTC', rule_version: 'liangxiang-market-v3',
      opens_at: DAY + 7 * HOUR, closes_at: DAY + 24 * HOUR, status: 'open', close_point: null,
      batches: ([[7, 11, 12], [12, 16, 17], [17, 21, 22]] as const).map(([open, lock, reference], index) => ({
        batch: (index + 1) as 1 | 2 | 3, opens_at: DAY + open * HOUR, locks_at: DAY + lock * HOUR, reference_at: DAY + reference * HOUR,
        status: index === 0 ? 'live' : index === 1 ? 'open' : 'pending',
        reference: index === 0 ? { case_id: 'request-budget-case', at: DAY + reference * HOUR, up_votes: 50, down_votes: 50, sequence: 1 } : null,
        long_incense: index === 1 ? 30 : 0, short_incense: index === 1 ? 20 : 0,
        position: index === 1 ? { side: 'long', amount: 10, submitted_at: DAY + 12 * HOUR, payout: null } : null, result: null,
      })) },
  }
}

function laterVoterFrame(state: MarketState): MarketState {
  const at = state.server_time + MINUTE, ratio = 55 / 104
  return { ...state, server_time: at,
    current_point: { ...state.current_point!, at, up_votes: 55, down_votes: 49, sequence: 2 },
    current_candle: { at: at - MINUTE, open: .55, high: .55, low: ratio, close: ratio, up_votes: 55, down_votes: 49, volume: 4 } }
}

/** Only same-origin browser responses are controlled; the installed plugin,
 * native fetch/AbortController/EventSource and their wall clocks remain real.
 * The isolated DSH must be booted with LIANGXIANG_BACKEND_URL=local. */
async function setup(page: Page, scenario: Scenario) {
  const calls = { reads: [] as number[], events: [] as number[], positions: [] as MarketPositionRequest[],
    failed: [] as Array<{ path: string, at: number }>, votes: 0 }
  let current = fixture(), releaseRead!: () => void, releaseStream!: () => void
  const heldRead = new Promise<void>(resolve => { releaseRead = resolve })
  const heldStream = new Promise<void>(resolve => { releaseStream = resolve })
  await page.addInitScript(() => {
    window.__liangxiangBudgetNativeFetch = window.fetch
    window.__liangxiangBudgetNativeEvents = window.EventSource
  })
  page.on('requestfailed', request => {
    const path = new URL(request.url()).pathname
    if (path === '/liangxiang/api/market' || path === '/liangxiang/api/market/position') calls.failed.push({ path, at: Date.now() })
  })
  await page.route(/\/liangxiang\/api\/(?:state|refresh)(?:\?|$)/, async route => {
    const response = await route.fetch(), wire = await response.json() as Record<string, unknown>
    await route.fulfill({ response, json: { ...wire, authorityMode: 'DEV_STAGING_ONLY', authorityAvailable: true } })
  })
  await page.route('**/liangxiang/api/events', route => route.fulfill({
    status: 200, contentType: 'text/event-stream', body: ': isolated main panel\n\n',
  }))
  await page.route('**/liangxiang/api/market', async route => {
    calls.reads.push(Date.now())
    const original = structuredClone(current)
    if (calls.reads.length === 1) {
      if (scenario === 'seven-second-read') await new Promise(resolve => setTimeout(resolve, 7_000))
      if (scenario === 'read-timeout' || scenario === 'close-slow-read') await heldRead
    }
    // An aborted browser may no longer accept a deliberately held response.
    await route.fulfill({ json: original, headers: { 'x-liangxiang-cache-scope': SCOPE } }).catch(() => undefined)
  })
  await page.route('**/liangxiang/api/market/candles?*', route => route.fulfill({ json: {
    schema_version: 1, case_id: current.market!.case_id, business_date: current.market!.business_date,
    interval_ms: MINUTE, candles: [current.current_candle!], next_cursor: null,
  } }))
  await page.route('**/liangxiang/api/market/history?*', route => route.fulfill({
    json: { schema_version: 1, receipts: [], next_cursor: null }, headers: { 'x-liangxiang-cache-scope': SCOPE },
  }))
  await page.route('**/liangxiang/api/market/events', async route => {
    calls.events.push(Date.now())
    if (scenario === 'read-timeout') {
      current = laterVoterFrame(current)
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: `data: ${JSON.stringify({ ...current, cache_scope: SCOPE })}\n\n` })
    } else {
      // Keep native streams pending instead of using a finite response whose
      // intentional EOF would add unrelated reconnects to the request counts.
      await heldStream
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': test finished\n\n' }).catch(() => undefined)
    }
  })
  await page.route('**/liangxiang/api/market/position', async route => {
    const intent = route.request().postDataJSON() as MarketPositionRequest
    calls.positions.push(intent)
    if (scenario !== 'order-timeout') {
      await route.fulfill({ status: 409, json: { error: 'read-only browser fixture' } })
      return
    }
    if (calls.positions.length === 1) {
      const batch = current.market!.batches[intent.batch - 1]!, old = batch.position!
      const delta = intent.amount - old.amount
      current = { ...current, server_time: current.server_time + 1,
        wallet: { ...current.wallet, available_incense: current.wallet.available_incense - delta,
          frozen_incense: current.wallet.frozen_incense + delta, version: current.wallet.version + 1 },
        market: { ...current.market!, batches: current.market!.batches.map(row => row.batch !== intent.batch ? row : {
          ...row, long_incense: row.long_incense + delta,
          position: { side: 'long', amount: intent.amount, submitted_at: current.server_time + 1, payout: null },
        }) } }
      // Simulate accepted accounting with a lost response, never a real write.
      await heldRead
    }
    await route.fulfill({ json: { accepted: true, reason: null, request_id: intent.request_id, state: current },
      headers: { 'x-liangxiang-cache-scope': SCOPE } }).catch(() => undefined)
  })
  await page.route('**/liangxiang/api/vote', async route => {
    calls.votes++
    await route.fulfill({ status: 409, json: { error: 'browser recovery must not vote' } })
  })
  await bootInstalledLiangxiang(page)
  expect(await page.evaluate(() => window.fetch === window.__liangxiangBudgetNativeFetch
    && window.EventSource === window.__liangxiangBudgetNativeEvents
    && fetch.toString().includes('[native code]') && EventSource.toString().includes('[native code]'))).toBe(true)
  const panel = await openPanel(page)
  await panel.locator('[data-liangxiang-market-entry]').click()
  const dialog = page.getByRole('dialog', { name: '梁股 · 香火市场', exact: true })
  await expect(dialog).toBeVisible()
  return { dialog, panel, calls, releaseRead, release() { releaseRead(); releaseStream() },
    setCurrent(state: MarketState) { current = state } }
}

test('native market GET may take seven seconds and completes its first request', async ({ page }) => {
  test.setTimeout(30_000)
  const f = await setup(page, 'seven-second-read')
  try {
    await expect(f.dialog.locator('[data-liangxiang-market-available]')).toHaveText('90', { timeout: 10_000 })
    expect(Date.now() - f.calls.reads[0]!).toBeGreaterThanOrEqual(7_000)
    expect(f.calls.reads).toHaveLength(1)
    expect(f.calls.failed).toEqual([])
    await expect(f.dialog).not.toContainText(/AbortError|signal is aborted|aborted without reason/i)
    expect(f.calls.positions).toEqual([])
    expect(f.calls.votes).toBe(0)
  } finally { f.release() }
})

test('native GET timeout is Chinese and recovers automatically to a new real SSE frame', async ({ page }) => {
  test.setTimeout(45_000)
  const f = await setup(page, 'read-timeout')
  try {
    const status = f.dialog.getByRole('status').first()
    await expect(status).toContainText(/网络/, { timeout: BROWSER_REQUEST_TIMEOUT_MS + 3_000 })
    await expect(status).toContainText(/稍后|自动|重连/)
    await expect(status).not.toContainText(/AbortError|signal is aborted|aborted without reason/i)
    await expect.poll(() => f.calls.failed.some(row => row.path === '/liangxiang/api/market')).toBe(true)
    const failed = f.calls.failed.find(row => row.path === '/liangxiang/api/market')!
    expect(failed.at - f.calls.reads[0]!).toBeGreaterThanOrEqual(BROWSER_REQUEST_TIMEOUT_MS - 200)
    await expect(f.dialog.locator('[data-liangxiang-market-available]')).toHaveText('90')
    await expect(f.dialog.locator('[data-liangxiang-market-current-point]')).toHaveAttribute('data-ratio', String(55 / 104))
    await expect(f.dialog.locator('[data-liangxiang-market-volume]').last()).toHaveAttribute('aria-label', /本段上香 4 炷/)
    expect(f.calls.reads.length).toBeGreaterThanOrEqual(2)
    expect(f.calls.positions).toEqual([])
    expect(f.calls.votes).toBe(0)
  } finally { f.release() }
})

test('native position timeout preserves uncertainty; read recovery never resends the order', async ({ page }) => {
  test.setTimeout(50_000)
  const f = await setup(page, 'order-timeout')
  try {
    await expect(f.dialog.locator('[data-liangxiang-market-available]')).toHaveText('90')
    await f.dialog.getByRole('spinbutton', { name: '午盘总投入香火' }).fill('15')
    await f.dialog.getByRole('button', { name: '确认调整', exact: true }).click()
    await expect.poll(() => f.calls.positions.length).toBe(1)
    const first = structuredClone(f.calls.positions[0]!)
    expect(first.request_id).not.toBe('')
    const retry = f.dialog.getByRole('button', { name: '核对上一笔', exact: true })
    await expect(retry).toBeVisible({ timeout: BROWSER_REQUEST_TIMEOUT_MS + 3_000 })
    await expect(f.dialog.getByRole('status').first()).toContainText(/尚未确认|核对原请求/)
    await expect(f.dialog).not.toContainText(/AbortError|signal is aborted|aborted without reason/i)
    await expect.poll(() => f.calls.reads.length).toBeGreaterThanOrEqual(2)
    await expect(f.dialog.locator('[data-liangxiang-market-available]')).toHaveText('85')
    await expect(f.dialog.locator('[data-liangxiang-market-frozen]')).toHaveText('15')
    await expect(retry).toBeEnabled()
    await expect(f.dialog.locator('[data-liangxiang-market-batch="2"] button[type="submit"]')).toBeDisabled()
    expect(f.calls.positions).toEqual([first])
    await retry.click()
    await expect(retry).toBeHidden()
    expect(f.calls.positions).toEqual([first, first])
    await expect(f.dialog.locator('[data-liangxiang-market-available]')).toHaveText('85')
    await expect(f.dialog.locator('[data-liangxiang-market-frozen]')).toHaveText('15')
    expect(f.calls.votes).toBe(0)
  } finally { f.release() }
})

test('closing a native slow read cannot overwrite the reopened market with its old reply', async ({ page }) => {
  test.setTimeout(25_000)
  const f = await setup(page, 'close-slow-read')
  try {
    await expect.poll(() => f.calls.reads.length).toBe(1)
    await f.dialog.getByRole('button', { name: '关闭香火交易' }).click()
    await expect(f.dialog).toBeHidden()
    const next = fixture()
    next.wallet = { ...next.wallet, available_incense: 77, total_incense: 87 }
    next.market = { ...next.market!, id: 'reopened-budget-market', case_id: 'reopened-budget-case',
      batches: next.market!.batches.map(batch => ({ ...batch,
        reference: batch.reference ? { ...batch.reference, case_id: 'reopened-budget-case' } : null })) }
    next.current_point = { ...next.current_point!, case_id: 'reopened-budget-case' }
    f.setCurrent(parseMarketState(next))
    await f.panel.locator('[data-liangxiang-market-entry]').click()
    await expect(f.dialog).toBeVisible()
    await expect(f.dialog.locator('[data-liangxiang-market-available]')).toHaveText('77')
    f.releaseRead()
    await page.waitForTimeout(1_200)
    await expect(f.dialog.locator('[data-liangxiang-market-available]')).toHaveText('77')
    expect(f.calls.reads).toHaveLength(2)
    expect(f.calls.positions).toEqual([])
    expect(f.calls.votes).toBe(0)
  } finally { f.release() }
})

test('main panel backs off three native CLOSED streams before recovering without manual refresh', async ({ page }) => {
  test.setTimeout(30_000)
  const calls = { state: [] as number[], events: [] as number[], mutations: [] as string[] }
  let wire: LiangxiangWireState | undefined
  await page.addInitScript(() => {
    window.__liangxiangBudgetNativeFetch = window.fetch
    window.__liangxiangBudgetNativeEvents = window.EventSource
  })
  await page.route('**/liangxiang/api/state', async route => {
    calls.state.push(Date.now())
    const response = await route.fetch()
    wire = await response.json() as LiangxiangWireState
    expect(wire.authorityMode).toBe('LOCAL_FAKE_DEV')
    await route.fulfill({ response, json: wire })
  })
  await page.route(/\/liangxiang\/api\/events(?:\?|$)/, async route => {
    if (new URL(route.request().url()).searchParams.has('native_closed_probe')) {
      await route.fulfill({ status: 503, body: 'independent native CLOSED control' })
      return
    }
    calls.events.push(Date.now())
    if (calls.events.length <= 3) {
      await route.fulfill({ status: 503, body: 'temporary main stream failure' })
      return
    }
    if (!wire) throw new Error('Main EventSource must follow the real local Host state')
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: `data: ${JSON.stringify(wire)}\n\n` })
  })
  await page.route(/\/liangxiang\/api\/(?:vote|market\/position|mode|reconcile)(?:\?|$)/, async route => {
    calls.mutations.push(route.request().url())
    await route.fulfill({ status: 409, json: { error: 'main reconnect must not mutate authority' } })
  })
  await bootInstalledLiangxiang(page)
  expect(await page.evaluate(() => window.fetch === window.__liangxiangBudgetNativeFetch
    && window.EventSource === window.__liangxiangBudgetNativeEvents
    && EventSource.toString().includes('[native code]'))).toBe(true)
  // These counts must recover before opening the panel: panel-open can request
  // a refresh, which must not be allowed to conceal a stuck first connection.
  await expect.poll(() => calls.state.length).toBeGreaterThanOrEqual(4)
  await expect.poll(() => calls.events.length).toBeGreaterThanOrEqual(4)
  for (const [label, timestamps] of Object.entries({ state: calls.state, events: calls.events })) {
    for (const [index, delay] of [1_000, 2_000, 4_000].entries()) {
      const elapsed = timestamps[index + 1]! - timestamps[index]!
      // Native requests use real clocks. Allow scheduling overhead, but never
      // let a successful GET conceal a permanently CLOSED stream by resetting
      // every retry to one second. Both HTTP boundaries must show the backoff.
      expect(elapsed, `${label} reconnect ${index + 1} waits ${delay}ms`).toBeGreaterThanOrEqual(delay * .8)
      expect(elapsed, `${label} reconnect ${index + 1} remains bounded`).toBeLessThanOrEqual(delay + 3_000)
    }
  }
  // Independently measure the actual browser semantics instead of assuming a
  // CLOSED source will emit five errors or retry itself. No constructor mock.
  const closed = await page.evaluate(async () => new Promise<{ state: number, errors: number }>((resolve, reject) => {
    const source = new EventSource('/liangxiang/api/events?native_closed_probe=1')
    let errors = 0
    const guard = setTimeout(() => { source.close(); reject(new Error('Native CLOSED control did not fail')) }, 2_000)
    source.onerror = () => {
      errors++
      if (errors !== 1) return
      setTimeout(() => {
        const state = source.readyState
        clearTimeout(guard); source.close(); resolve({ state, errors })
      }, 200)
    }
  }))
  expect(closed).toEqual({ state: 2, errors: 1 })
  const panel = await openPanel(page)
  await expect(panel).toContainText('今日梁案')
  await expect(panel.locator('[data-liangxiang-vote-feedback]')).not.toContainText('无法连接天庭')
  await expect(panel.locator('[data-liangxiang-vote="up"]')).toBeEnabled()
  expect(calls.mutations).toEqual([])
})
