import { expect, test, type Locator } from '@playwright/test'
import type { MarketState } from '../../src/shared/market-v1.ts'
import { bootInstalledLiangxiang, openPanel } from './helpers.ts'

const DAY = Date.UTC(2026, 10, 6), HOUR = 3_600_000

function fixture(): MarketState {
  const now = DAY + 13 * HOUR
  return { schema_version: 1, soft_trust: true, server_time: now,
    wallet: { available_incense: 90, frozen_incense: 10, total_incense: 100,
      token_remainder: 0, token_per_incense: 50_000, version: 1 },
    current_point: { case_id: 'loading-case', at: now, up_votes: 55, down_votes: 45, sequence: 1 },
    market: { id: 'loading-market', case_id: 'loading-case', business_date: '2026-11-06', timezone: 'UTC',
      rule_version: 'liangxiang-market-v3', opens_at: DAY + 7 * HOUR, closes_at: DAY + 24 * HOUR,
      status: 'open', close_point: null,
      batches: ([[7, 11, 12], [12, 16, 17], [17, 21, 22]] as const).map(([open, lock, reference], index) => ({
        batch: (index + 1) as 1 | 2 | 3, opens_at: DAY + open * HOUR, locks_at: DAY + lock * HOUR,
        reference_at: DAY + reference * HOUR, status: index === 0 ? 'live' : index === 1 ? 'open' : 'pending',
        reference: index === 0 ? { case_id: 'loading-case', at: DAY + reference * HOUR, up_votes: 50, down_votes: 50, sequence: 1 } : null,
        long_incense: index === 1 ? 30 : 0, short_incense: index === 1 ? 20 : 0,
        position: index === 1 ? { side: 'long', amount: 10, submitted_at: DAY + 12 * HOUR, payout: null } : null,
        result: null,
      })) },
  }
}

async function visibleLoading(dialog: Locator): Promise<void> {
  const copy = dialog.getByText('正在读取行情', { exact: true })
  await expect(copy).toBeVisible()
  const presentation = await copy.evaluate(element => {
    const rect = element.getBoundingClientRect()
    return { clipPath: getComputedStyle(element).clipPath, width: rect.width, height: rect.height }
  })
  // A 1px clipped screen-reader span can pass a simple visibility check.
  // Check what a sighted user can actually see while the request is pending.
  expect(presentation.clipPath).toBe('none')
  expect(presentation.width).toBeGreaterThan(50)
  expect(presentation.height).toBeGreaterThan(12)
  await expect(dialog.getByRole('button', { name: '确认调整', exact: true })).toHaveCount(0)
}

test('cold and reopened market requests keep visible loading without replaying the fishing entrance', async ({ page }) => {
  test.setTimeout(40_000)
  const state = fixture(), releases: Array<() => void> = []
  const calls = { reads: 0, history: 0, mutations: 0 }
  let releaseEvents!: () => void
  const heldEvents = new Promise<void>(resolve => { releaseEvents = resolve })
  await page.route(/\/liangxiang\/api\/(?:state|refresh)(?:\?|$)/, async route => {
    const response = await route.fetch(), wire = await response.json() as Record<string, unknown>
    await route.fulfill({ response, json: { ...wire, authorityMode: 'DEV_STAGING_ONLY', authorityAvailable: true } })
  })
  await page.route('**/liangxiang/api/events', route => route.fulfill({
    status: 200, contentType: 'text/event-stream', body: ': isolated loading test\n\n',
  }))
  await page.route('**/liangxiang/api/market', async route => {
    calls.reads++
    await new Promise<void>(resolve => { releases.push(resolve) })
    await route.fulfill({ json: state, headers: { 'x-liangxiang-cache-scope': 'loading-fixture' } }).catch(() => undefined)
  })
  await page.route('**/liangxiang/api/market/events', async route => {
    await heldEvents
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': test finished\n\n' }).catch(() => undefined)
  })
  await page.route('**/liangxiang/api/market/candles?*', route => route.fulfill({ json: {
    schema_version: 1, case_id: state.market!.case_id, business_date: state.market!.business_date,
    interval_ms: 60_000, candles: [], next_cursor: null,
  } }))
  await page.route('**/liangxiang/api/market/history?*', route => {
    calls.history++
    return calls.history === 2
      ? route.fulfill({ status: 503, json: { error: 'temporary history outage' } })
      : route.fulfill({ json: { schema_version: 1, receipts: [], next_cursor: null } })
  })
  await page.route(/\/liangxiang\/api\/(?:vote|market\/position|mode|reconcile)(?:\?|$)/, async route => {
    calls.mutations++
    await route.fulfill({ status: 409, json: { error: 'loading test is read-only' } })
  })
  await bootInstalledLiangxiang(page)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const panel = await openPanel(page)
  const open = async (): Promise<Locator> => {
    await panel.locator('[data-liangxiang-market-entry]').click()
    const dialog = page.getByRole('dialog', { name: '梁股 · 香火市场', exact: true })
    await expect(dialog).toBeVisible()
    return dialog
  }
  try {
    const first = await open()
    await expect.poll(() => calls.reads).toBe(1)
    await visibleLoading(first)
    await expect(first.locator('.liangxiang-market-companion')).toHaveAttribute('data-loading-phase', /fishing|waiting/)
    releases[0]!()
    await expect(first.locator('[data-liangxiang-market-available]')).toHaveText('90')
    await expect.poll(() => calls.history).toBe(1)
    await expect(first.locator('.liangxiang-market-companion')).toHaveAttribute('data-loading-phase', 'idle')
    await first.getByRole('button', { name: '关闭香火交易', exact: true }).click()
    await expect(first).toBeHidden()

    const second = await open()
    await expect.poll(() => calls.reads).toBe(2)
    await visibleLoading(second)
    await expect(second.locator('.liangxiang-market-companion')).toHaveAttribute('data-loading-phase', 'idle')
    await expect(second.locator('[data-liangxiang-market-available]')).not.toHaveText('90')
    releases[1]!()
    await expect(second.locator('[data-liangxiang-market-available]')).toHaveText('90')
    await expect(second.locator('.liangxiang-market-companion')).toHaveAttribute('data-loading-phase', 'idle')
    const historyNotice = second.getByText('历史回执暂未更新，已确认的钱包不受影响。', { exact: true })
    await expect(historyNotice).toBeVisible()
    // Keep native SSE pending: an unrelated frame or reconnect must not hide
    // this error. Only the bounded history reread proves that it recovered.
    await expect.poll(() => calls.history, { timeout: 10_000 }).toBe(3)
    await expect(historyNotice).toHaveCount(0)
    await expect(second.locator('[data-liangxiang-market-available]')).toHaveText('90')
    expect(calls.reads).toBe(2)
    expect(calls.mutations).toBe(0)
  } finally { for (const release of releases) release(); releaseEvents() }
})
