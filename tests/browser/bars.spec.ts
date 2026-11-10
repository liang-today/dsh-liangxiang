import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Locator } from '@playwright/test'
import type { MarketCandle, MarketState, MarketCandlesResponse } from '../../src/shared/market-v1.ts'
import { axeSummary, bootInstalledLiangxiang, openPanel } from './helpers.ts'

const DAY = Date.UTC(2026, 10, 6), HOUR = 3_600_000, MINUTE = 60_000

function chartFixture(): MarketState {
  const schedule = [[9, 11, 12], [12, 17, 18], [18, 20, 21]] as const
  return {
    schema_version: 1, soft_trust: true, server_time: DAY + 10 * HOUR, candle_interval_ms: MINUTE,
    wallet: { available_incense: 90, frozen_incense: 10, total_incense: 100, token_remainder: 12_000, token_per_incense: 50_000, version: 1 },
    current_point: { case_id: 'case-chart-browser', at: DAY + 10 * HOUR, up_votes: 55, down_votes: 45, sequence: 1 },
    market: {
      id: 'market-chart-browser', case_id: 'case-chart-browser', business_date: '2026-11-06', timezone: 'UTC',
      rule_version: 'liangxiang-market-v1', opens_at: DAY + 9 * HOUR, closes_at: DAY + 24 * HOUR,
      status: 'open', close_point: null,
      batches: schedule.map(([open, lock, reference], index) => ({
        batch: (index + 1) as 1 | 2 | 3, opens_at: DAY + open * HOUR, locks_at: DAY + lock * HOUR,
        reference_at: DAY + reference * HOUR, status: index === 0 ? 'open' : 'pending', reference: null,
        long_incense: index === 0 ? 30 : 0, short_incense: index === 0 ? 20 : 0,
        position: index === 0 ? { side: 'long', amount: 10, submitted_at: DAY + 9 * HOUR, payout: null } : null,
        result: null,
      })),
    },
  }
}

function chartCandles(intervalMs = MINUTE): MarketCandle[] {
  return Array.from({ length: 10 * HOUR / intervalMs }, (_, index) => {
    const phase = intervalMs / (5 * MINUTE)
    const open = .49 + Math.sin(index * phase / 8) * .035, close = .49 + Math.sin((index + 1) * phase / 8) * .035
    return { at: DAY + index * intervalMs, open, close, high: Math.max(open, close) + .004, low: Math.min(open, close) - .004, up_votes: 50 + index, down_votes: 50 + index, volume: 2 }
  })
}

function candlePage(url: string, data: MarketCandle[], intervalMs: 60_000 | 300_000 = MINUTE): MarketCandlesResponse {
  const query = new URL(url).searchParams, after = Number(query.get('cursor') ?? -1)
  const limit = Math.min(288, Number(query.get('limit') ?? 288))
  const remaining = data.filter(candle => candle.at > after), page = remaining.slice(0, limit)
  return { schema_version: 1, case_id: 'case-chart-browser', business_date: '2026-11-06', interval_ms: intervalMs,
    candles: page, next_cursor: remaining.length > page.length ? String(page.at(-1)!.at) : null }
}

async function openChart(page: Page) {
  const panel = await openPanel(page)
  await expect(panel.locator('[data-liangxiang-utility-action="bars"]')).toHaveCount(0)
  await panel.locator('[data-liangxiang-market-entry]').click()
  const dialog = page.getByRole('dialog', { name: '梁股 · 香火市场', exact: true })
  await expect(dialog).toBeVisible()
  const chart = dialog.locator('[data-liangxiang-market-chart-mode]')
  await expect(chart).toHaveAttribute('data-liangxiang-market-chart-mode', 'candles')
  await expect(chart.locator('[data-liangxiang-market-candle]').first()).toBeVisible()
  return { dialog, chart }
}

async function expectAlignedPriceColumn(chart: Locator): Promise<void> {
  await expect.poll(() => chart.evaluate(element => {
    const failures: string[] = []
    const svg = element.querySelector<SVGSVGElement>('svg[data-liangxiang-market-from]')!
    const labels = [...element.querySelectorAll<SVGTextElement>('[data-liangxiang-market-price-axis] text')]
    const legend = element.querySelector<SVGGElement>('[data-liangxiang-market-direction-legend]')!
    const frame = svg.getBoundingClientRect(), origin = legend.getScreenCTM()!
    const plotRight = element.querySelector('[data-liangxiang-market-price-axis] line')!.getBoundingClientRect().right
    for (const label of labels) {
      const bounds = label.getBoundingClientRect()
      if (label.getAttribute('text-anchor') !== 'middle' || Math.abs(bounds.left + bounds.width / 2 - origin.e) > 1) failures.push('price text shares the legend centerline')
      if (bounds.left <= plotRight || bounds.right > frame.right - 2) failures.push('price text stays inside its axis column')
    }
    const bounds = legend.getBoundingClientRect(), lowerPrice = labels.at(-1)!.getBoundingClientRect()
    if (bounds.left < plotRight + 2 || bounds.right > frame.right - 2 || bounds.top < lowerPrice.bottom + 1) failures.push('legend fits the clear area below the price labels')
    const words = [...legend.querySelectorAll('text')].map(node => node.getBoundingClientRect())
    const dots = [...legend.querySelectorAll('circle')].map(node => node.getBoundingClientRect())
    if (words.length !== 2 || dots.length !== 2) failures.push('both labeled direction swatches remain')
    else {
      if (Math.abs(words[0]!.width - words[1]!.width) > 1) failures.push('direction labels have equal width')
      if (Math.abs((words[0]!.left - dots[0]!.right) - (words[1]!.left - dots[1]!.right)) > 1) failures.push('direction swatches use equal spacing')
      if (words[0]!.right >= dots[1]!.left) failures.push('direction swatches do not overlap')
    }
    return failures
  }), { message: 'Price labels and equal-width direction swatches fit one centered right-axis column' }).toEqual([])
}

test.beforeEach(async ({ page }) => {
  // Exercise the real packed UI with deterministic official candle fixtures.
  // Presentation tests never submit a position or contact a community node.
  await page.addInitScript(() => {
    const Native = window.EventSource
    window.EventSource = new Proxy(Native, {
      construct(target, args) {
        const path = new URL(String(args[0]), location.href).pathname
        if (path !== '/liangxiang/api/events' && path !== '/liangxiang/api/market/events') return Reflect.construct(target, args)
        return { onmessage: null, onerror: null, close() {} }
      },
    })
  })
  await page.route(/\/liangxiang\/api\/(?:state|refresh)(?:\?|$)/, async route => {
    const response = await route.fetch(), wire = await response.json() as Record<string, unknown>
    await route.fulfill({ response, json: { ...wire, authorityMode: 'DEV_STAGING_ONLY', authorityAvailable: true } })
  })
  const state = chartFixture()
  await page.route('**/liangxiang/api/market', route => route.fulfill({ json: state, headers: { 'x-liangxiang-cache-scope': 'browser-chart-scope' } }))
  await page.route('**/liangxiang/api/market/candles?*', route => route.fulfill({ json: candlePage(route.request().url(), chartCandles()) }))
  await page.route('**/liangxiang/api/market/history?*', route => route.fulfill({ json: { schema_version: 1, receipts: [], next_cursor: null }, headers: { 'x-liangxiang-cache-scope': 'browser-chart-scope' } }))
  await bootInstalledLiangxiang(page)
})

test('unified K line has numeric axes, separate OHLC, keyboard reading and reversible zoom', async ({ page }, testInfo) => {
  const { dialog, chart } = await openChart(page)
  const svg = chart.locator('svg[data-liangxiang-market-from]')
  await expect(svg).toHaveAttribute('data-liangxiang-market-from', String(DAY))
  await expect(svg).toHaveAttribute('data-liangxiang-market-until', String(DAY + 24 * HOUR))
  const priceAxis = chart.locator('[data-liangxiang-market-price-axis]')
  await expect(priceAxis.first()).toBeVisible()
  const axisLabels = await priceAxis.locator('text').evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect()
    return { label: node.textContent ?? '', top: rect.top, bottom: rect.bottom }
  }))
  expect(axisLabels.length).toBeGreaterThanOrEqual(3)
  expect(axisLabels.length).toBeLessThanOrEqual(5)
  for (const item of axisLabels) expect(item.label).toMatch(/^\d+\.\d+%$/)
  for (let index = 1; index < axisLabels.length; index++) {
    expect(Number.parseFloat(axisLabels[index]!.label)).toBeLessThan(Number.parseFloat(axisLabels[index - 1]!.label))
    expect(axisLabels[index]!.top).toBeGreaterThanOrEqual(axisLabels[index - 1]!.bottom)
  }
  await expectAlignedPriceColumn(chart)

  const toolbar = chart.locator('.liangxiang-market-chart-toolbar')
  const controls = toolbar.locator('button')
  const controlBounds = await controls.evaluateAll(nodes => nodes.map(node => {
    const { x, y, width, height } = node.getBoundingClientRect()
    return { x, y, width, height }
  }))
  const chartFit = await chart.evaluate(element => {
    const bounds = element.getBoundingClientRect()
    return [...element.children].map(child => ({ name: child.className, overflow: child.getBoundingClientRect().bottom - bounds.bottom,
      parentHeight: bounds.height, top: child.getBoundingClientRect().top - bounds.top, height: child.getBoundingClientRect().height,
    }))
  })
  for (const child of chartFit) expect(child.overflow, JSON.stringify(chartFit)).toBeLessThanOrEqual(1)
  const expectStableControls = async (): Promise<void> => {
    const next = await controls.evaluateAll(nodes => nodes.map(node => {
      const { x, y, width, height } = node.getBoundingClientRect()
      return { x, y, width, height }
    }))
    expect(next).toHaveLength(controlBounds.length)
    for (let i = 0; i < next.length; i++) for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(next[i]![key] - controlBounds[i]![key]), JSON.stringify({ control: i, key, before: controlBounds[i], after: next[i], scrollTop: await dialog.evaluate(element => element.scrollTop) })).toBeLessThanOrEqual(1)
    }
  }
  const range = toolbar.locator('.liangxiang-market-chart-window')
  await expect(range).toHaveText('今日')
  expect(await range.evaluate(element => element.tagName)).toBe('OUTPUT')
  expect(await range.evaluate(element => element.tabIndex)).toBe(-1)
  expect(await range.evaluate(element => {
    const previous = element.parentElement!.previousElementSibling
    return previous?.classList.contains('liangxiang-market-chart-zoom')
      && getComputedStyle(element.parentElement!).position !== 'absolute'
      && !['absolute', 'fixed'].includes(getComputedStyle(element).position)
  })).toBe(true)
  await expect(toolbar.getByRole('button', { name: /复位走势时间范围/ })).toHaveCount(0)
  await expect(toolbar.getByRole('combobox')).toHaveCount(0)
  await expect(toolbar.getByRole('button', { name: '近4时', exact: true })).toHaveCount(0)
  // The minute source is fetched in bounded pages; finer display never splits
  // a five-minute bar into invented prices.
  await expect(svg).toHaveAttribute('data-liangxiang-market-source-interval', String(MINUTE))
  const eightTick = (await chart.locator('.liangxiang-market-time-tick text').filter({ hasText: /^08:00$/ }).boundingBox())!
  const beforeOpenChart = (await svg.boundingBox())!
  await page.mouse.move(eightTick.x + eightTick.width / 2 + 1, beforeOpenChart.y + 50)
  await expect(chart.locator('[data-liangxiang-market-point-detail]')).toContainText('08:')
  for (const [hours, label] of [[12, '近12时'], [6, '近6时'], [3, '近3时'], [1, '近1时'], [.5, '近30分']] as const) {
    await chart.getByRole('button', { name: '放大走势', exact: true }).click()
    await expect(range).toHaveText(label)
    const actual = Number(await svg.getAttribute('data-liangxiang-market-until')) - Number(await svg.getAttribute('data-liangxiang-market-from'))
    expect(actual).toBe(hours * HOUR)
    await expectStableControls()
  }
  await expect(svg).toHaveAttribute('data-liangxiang-market-interval', String(MINUTE))
  await expect(chart.getByRole('button', { name: '放大走势', exact: true })).toBeDisabled()
  await svg.focus()
  await page.keyboard.press('0')
  await expect(range).toHaveText('今日')
  await expect(svg).toHaveAttribute('data-liangxiang-market-from', String(DAY))
  await expect(svg).toHaveAttribute('data-liangxiang-market-until', String(DAY + 24 * HOUR))
  await expectStableControls()
  await expect(chart.locator('[data-liangxiang-market-phase="before"]')).toHaveCount(1)
  await expect(chart.locator('[data-liangxiang-market-phase="open"]')).toHaveCount(3)
  await expect(chart.locator('[data-liangxiang-market-phase="locked"]')).toHaveCount(3)
  await expect(chart.locator('[data-liangxiang-market-phase="closing"]')).toHaveCount(1)
  await expect(chart.locator('[data-liangxiang-market-future]')).toContainText('待开梁')
  const wicks = chart.locator('[data-liangxiang-market-wick]')
  expect(await wicks.count()).toBeGreaterThan(0)
  expect(await wicks.evaluateAll(nodes => nodes.every(node =>
    Number(node.getAttribute('y2')) > Number(node.getAttribute('y1'))
      && Number(node.getAttribute('stroke-width')) >= 1.5
      && node.getAttribute('vector-effect') === 'non-scaling-stroke'))).toBe(true)
  await expect(chart.locator('figcaption')).toHaveCount(0)
  await expect(chart).not.toContainText('量带高度看总量')

  const quoteBounds = []
  for (const key of ['open', 'high', 'low', 'close']) {
    const quote = chart.locator(`[data-liangxiang-market-quote="${key}"]`)
    await expect(quote).toContainText('%')
    quoteBounds.push((await quote.boundingBox())!)
  }
  for (let i = 1; i < quoteBounds.length; i++) {
    expect(quoteBounds[i]!.x).toBeGreaterThanOrEqual(quoteBounds[i - 1]!.x + quoteBounds[i - 1]!.width)
  }
  const readout = dialog.locator('.liangxiang-market-position')
  const initialReadout = (await readout.textContent())!
  const initialDetails = await svg.getAttribute('aria-label')
  await svg.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(readout).toHaveText(initialReadout)
  await expect(svg).not.toHaveAttribute('aria-label', initialDetails!)
  await expect(chart.locator('[data-liangxiang-market-point-detail]')).toBeVisible()
  await expect(svg).toBeFocused()
  const priceBox = (await svg.boundingBox())!
  await svg.click({ position: { x: priceBox.width * .25, y: 50 } })
  await expect(svg).toHaveAttribute('data-liangxiang-market-pinned', 'true')
  await page.keyboard.press('Escape')
  await expect(svg).toHaveAttribute('data-liangxiang-market-pinned', 'false')
  await expect(dialog).toBeVisible()

  const domainSpan = async (): Promise<number> => Number(await svg.getAttribute('data-liangxiang-market-until')) - Number(await svg.getAttribute('data-liangxiang-market-from'))
  const fullDay = await domainSpan()
  await chart.getByRole('button', { name: '放大走势', exact: true }).click()
  const zoomed = await domainSpan()
  expect(zoomed).toBeLessThan(fullDay)
  await chart.getByRole('button', { name: '缩小走势', exact: true }).click()
  expect(await domainSpan()).toBeGreaterThan(zoomed)

  await expect(dialog).toHaveAttribute('data-fullscreen', 'false')
  const floatingBounds = (await dialog.boundingBox())!
  expect(floatingBounds.width).toBeLessThanOrEqual(800)
  if (page.viewportSize()!.width >= 824) expect(floatingBounds.width).toBeCloseTo(800, 0)
  expect(floatingBounds.height).toBeLessThanOrEqual(testInfo.project.name === 'chromium-narrow' ? 700 : 650)
  await dialog.getByRole('button', { name: '全屏香火交易', exact: true }).click()
  await expect(dialog).toHaveAttribute('data-fullscreen', 'true')
  const fullBounds = (await dialog.boundingBox())!
  expect(fullBounds.width).toBeGreaterThanOrEqual(floatingBounds.width)
  expect(fullBounds.height).toBeGreaterThanOrEqual(floatingBounds.height)
  expect(await chart.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await dialog.getByRole('button', { name: '退出全屏香火交易', exact: true }).click()
  await expect(dialog).toHaveAttribute('data-fullscreen', 'false')
  expect(Math.abs((await dialog.boundingBox())!.height - floatingBounds.height)).toBeLessThanOrEqual(1)
  expect(Math.abs((await dialog.boundingBox())!.width - floatingBounds.width)).toBeLessThanOrEqual(1)

  expect(await dialog.evaluate(element => {
    const rect = element.getBoundingClientRect()
    return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight
      && element.scrollWidth <= element.clientWidth
  })).toBe(true)

  if (testInfo.project.name === 'chromium-narrow') {
    const previousViewport = page.viewportSize()!
    try {
      await page.setViewportSize({ width: 320, height: 800 })
      await expect.poll(() => chart.locator('svg[data-liangxiang-market-from]').evaluate(element => element.getBoundingClientRect().width)).toBeLessThan(320)
      await expectAlignedPriceColumn(chart)
      const edgeChecks = await dialog.evaluate(element => {
        const bounds = element.getBoundingClientRect()
        return [...element.querySelectorAll<HTMLElement>('.liangxiang-market-window-controls button,.liangxiang-market-wallet,.liangxiang-market-header-copy,.liangxiang-market-chart-toolbar button,[data-liangxiang-market-quote],[data-liangxiang-market-main-whale]')].map(node => {
          const rect = node.getBoundingClientRect()
          return { label: node.getAttribute('aria-label') ?? node.textContent ?? node.tagName, fits: rect.left >= bounds.left && rect.right <= bounds.right + 1 }
        })
      })
      expect(edgeChecks.filter(check => !check.fits)).toEqual([])
      const fish = (await dialog.locator('[data-liangxiang-market-main-whale]').boundingBox())!
      const caption = (await dialog.locator('.liangxiang-market-header-copy').boundingBox())!
      const speech = (await dialog.locator('.liangxiang-market-companion-speech').boundingBox())!
      expect(fish.x >= caption.x + caption.width || caption.x >= fish.x + fish.width
        || fish.y >= caption.y + caption.height || caption.y >= fish.y + fish.height).toBe(true)
      expect(fish.x >= speech.x + speech.width || speech.x >= fish.x + fish.width
        || fish.y >= speech.y + speech.height || speech.y >= fish.y + fish.height).toBe(true)
      const controls = await dialog.locator('.liangxiang-market-window-controls button,.liangxiang-market-wallet,.liangxiang-market-header-copy').evaluateAll(nodes => nodes.map(node => {
        const { x, y, width, height } = node.getBoundingClientRect()
        return { x, y, width, height }
      }))
      for (const control of controls) expect(fish.x >= control.x + control.width || control.x >= fish.x + fish.width
        || fish.y >= control.y + control.height || control.y >= fish.y + fish.height).toBe(true)
      const overflow = await dialog.evaluate(element => [element,
        ...element.querySelectorAll('.liangxiang-market-chart-toolbar,.liangxiang-market-chart-scroll,.liangxiang-market-stage:not([hidden])')]
        .map(node => ({ name: node.className, overflows: node.scrollWidth > node.clientWidth + 1 })))
      expect(overflow.filter(item => item.overflows)).toEqual([])
      await dialog.getByRole('button', { name: '梁股玩法', exact: true }).click()
      const rules = dialog.locator('[data-liangxiang-market-popover="rules"]')
      await expect(rules).toBeVisible()
      expect(await rules.evaluate(element => {
        const rect = element.getBoundingClientRect(), parent = element.closest('[data-liangxiang-market-dialog]')!.getBoundingClientRect()
        return element.scrollWidth <= element.clientWidth + 1 && rect.left >= parent.left && rect.right <= parent.right + 1
      })).toBe(true)
      await page.keyboard.press('Escape')
      await expect(dialog).toBeVisible()
    } finally {
      await page.setViewportSize(previousViewport)
    }
  }
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  // Both entry clicks are pointer actions; Escape clears their focus and hint.
  const trigger = page.locator('[data-liangxiang-market-entry]')
  await expect(trigger).not.toBeFocused()
  await expect(trigger).toHaveAttribute('data-liangxiang-ritual-resting', 'pointer')
  await expect.poll(() => trigger.locator('[data-liangxiang-hint]').evaluate(element => getComputedStyle(element).opacity)).toBe('0')
})

test('dragging either plot past its time labels pans without selecting text and leaves ordinary copy selectable', async ({ page }) => {
  const { dialog, chart } = await openChart(page)
  const svg = chart.locator('svg[data-liangxiang-market-from]')
  for (const mode of ['K 线', '潮汐']) {
    await chart.getByRole('button', { name: mode, exact: true }).click()
    await svg.focus()
    await page.keyboard.press('0')
    await chart.getByRole('button', { name: '放大走势', exact: true }).click()
    const before = Number(await svg.getAttribute('data-liangxiang-market-from'))
    const tick = (await chart.locator('.liangxiang-market-time-tick text').nth(1).boundingBox())!
    const bounds = (await svg.boundingBox())!
    await page.evaluate(() => window.getSelection()?.removeAllRanges())
    await page.mouse.move(tick.x + tick.width / 2, tick.y + tick.height / 2)
    await page.mouse.down()
    await page.mouse.move(tick.x + tick.width / 2 - 45, bounds.y + bounds.height + 20, { steps: 10 })
    await page.mouse.up()
    await expect.poll(async () => Number(await svg.getAttribute('data-liangxiang-market-from'))).toBeGreaterThan(before)
    expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('')
    await expect(svg).toHaveAttribute('data-liangxiang-market-pinned', 'false')
    await expect(svg).toBeFocused()
    // Releasing capture must finish the gesture, even outside the SVG.
    const after = await svg.getAttribute('data-liangxiang-market-from')
    await page.mouse.move(bounds.x + bounds.width * .75, bounds.y + 30)
    expect(await svg.getAttribute('data-liangxiang-market-from')).toBe(after)
    await svg.focus()
    await page.keyboard.press('ArrowLeft')
    await expect(svg).toBeFocused()
  }
  // Selection prevention is local to the plot, not a blanket page rule.
  const copy = (await dialog.locator('.liangxiang-market-wallet-label').first().boundingBox())!
  await page.mouse.move(copy.x + 1, copy.y + copy.height / 2)
  await page.mouse.down()
  await page.mouse.move(copy.x + copy.width - 1, copy.y + copy.height / 2, { steps: 10 })
  await page.mouse.up()
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toContain('个人可用')
  await page.evaluate(() => window.getSelection()?.removeAllRanges())
})

test('point tooltip follows inspection inside plot edges while footer facts and the right-axis legend stay fixed', async ({ page }) => {
  const data = chartCandles().filter(candle => candle.at < DAY + 4.25 * HOUR || candle.at >= DAY + 5.25 * HOUR)
    .map(candle => candle.at === DAY + 6 * HOUR ? { ...candle, volume: 9_999_999 } : candle)
  await page.route('**/liangxiang/api/market/candles?*', route => route.fulfill({ json: candlePage(route.request().url(), data) }))
  const { dialog, chart } = await openChart(page)
  const svg = chart.locator('svg[data-liangxiang-market-from]')
  const readout = dialog.locator('.liangxiang-market-footer-metrics')
  const slots = readout.locator(':scope > button')
  await expect(slots).toHaveCount(3)
  await expect(slots.nth(0)).toHaveClass(/market-position/)
  await expect(slots.nth(1)).toHaveClass(/market-pool/)
  await expect(slots.nth(1)).toContainText('今日香池')
  await expect(slots.nth(2)).toHaveClass(/market-pool/)
  await expect(slots.nth(2)).toContainText('早盘香池')
  await expect(chart.locator('[data-liangxiang-market-direction-legend]')).toBeVisible()
  await expectAlignedPriceColumn(chart)
  await expect(readout).not.toContainText('上香')
  const tip = chart.locator('[data-liangxiang-market-point-detail]')
  await expect(tip).toHaveCount(0)
  const positions = async () => slots.evaluateAll(nodes => nodes.map(node => {
    const { x, y, width, height } = node.getBoundingClientRect()
    return { x, y, width, height, align: getComputedStyle(node).textAlign }
  }))
  const original = await positions()
  expect(original.every(slot => slot.align === 'left')).toBe(true)
  expect(original[0]!.x).toBeCloseTo((await readout.boundingBox())!.x)
  expect(original[1]!.x).toBeGreaterThan(original[0]!.x + original[0]!.width)
  expect(original[2]!.x).toBeGreaterThan(original[1]!.x + original[1]!.width)
  const inspect = async (hour: number, y = 40): Promise<void> => {
    const location = await svg.evaluate((element, hour) => {
      const svg = element as SVGSVGElement, bounds = svg.getBoundingClientRect(), width = svg.viewBox.baseVal.width
      return { x: bounds.left + (12 + (width - 76) * hour / 24) / width * bounds.width, y: bounds.top }
    }, hour)
    await page.mouse.move(location.x, location.y + y)
    await expect(tip).toBeVisible()
    const panel = (await chart.locator('.liangxiang-market-chart-scroll').boundingBox())!, detail = (await tip.boundingBox())!
    expect(detail.x).toBeGreaterThanOrEqual(panel.x)
    expect(detail.y).toBeGreaterThanOrEqual(panel.y)
    expect(detail.x + detail.width).toBeLessThanOrEqual(panel.x + panel.width)
    expect(detail.y + detail.height).toBeLessThanOrEqual(panel.y + panel.height)
  }
  const stable = async (): Promise<void> => {
    const next = await positions()
    for (let index = 0; index < next.length; index++) for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(next[index]![key] - original[index]![key])).toBeLessThanOrEqual(1)
    }
  }
  await inspect(8)
  await expect(tip).toContainText('本段上香')
  expect(await tip.evaluate(element => getComputedStyle(element).pointerEvents)).toBe('none')
  const paint = await tip.evaluate(element => ({ foreground: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor }))
  expect(paint.foreground).not.toBe(paint.background)
  expect(paint.background).not.toBe('rgba(0, 0, 0, 0)')
  await stable()
  await inspect(4.75)
  await expect(tip).toContainText('这段未记录')
  await expect(tip).not.toContainText('上香')
  await stable()
  await inspect(6.1)
  await expect(tip).toContainText('方向明细缺失')
  await expect(tip).toContainText('万')
  await expect(tip).toHaveAttribute('aria-label', /\d{1,3},\d{3},\d{3}/)
  await stable()
  expect(await readout.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await inspect(.01)
  await inspect(23.9, (await svg.boundingBox())!.height - 3)
  await page.mouse.move(0, 0)
  await expect(tip).toHaveCount(0)
  await svg.focus()
  await page.keyboard.press('Home')
  await expect(tip).toContainText('00:00')
  await expect(svg).toHaveAttribute('aria-label', /00:00/)
  await expect(chart.locator('[aria-live="polite"]')).toContainText('本段上香')
  await svg.click({ position: { x: (await svg.boundingBox())!.width * .25, y: 40 } })
  await expect(svg).toHaveAttribute('data-liangxiang-market-pinned', 'true')
  await expect(tip).toBeVisible()
  await page.mouse.move(0, 0)
  await expect(tip).toHaveCount(0)
  await expect(svg).toHaveAttribute('data-liangxiang-market-pinned', 'true')
  await page.keyboard.press('Escape')
  await expect(svg).toHaveAttribute('data-liangxiang-market-pinned', 'false')
})

test.describe('touch point inspection', () => {
  test.use({ hasTouch: true })
  test('a tap reads an exact point and a second tap releases the original pin', async ({ page }) => {
    const { chart } = await openChart(page)
    const svg = chart.locator('svg[data-liangxiang-market-from]'), bounds = (await svg.boundingBox())!
    await page.touchscreen.tap(bounds.x + bounds.width / 4, bounds.y + 45)
    await expect(svg).toHaveAttribute('data-liangxiang-market-pinned', 'true')
    const detail = chart.locator('[data-liangxiang-market-point-detail]')
    await expect(detail).toBeVisible()
    await expect(detail).toHaveAttribute('aria-label', /本段上香.*夯.*拉/)
    await page.touchscreen.tap(bounds.x + bounds.width / 4, bounds.y + 45)
    await expect(svg).toHaveAttribute('data-liangxiang-market-pinned', 'false')
  })
})

test('the latest marker stays on the true forming-minute endpoint in tide and aggregated K line views', async ({ page }) => {
  const state = chartFixture(), observed = DAY + 13 * HOUR + 26 * MINUTE + 20_000
  state.server_time = observed
  state.current_point = { ...state.current_point!, at: DAY + 13 * HOUR }
  const raw = Array.from({ length: 13 * 60 + 27 }, (_, index) => {
    const close = .5 + Math.sin(index / 30) * .02
    return { at: DAY + index * MINUTE, open: .5, close, high: Math.max(.5, close), low: Math.min(.5, close), up_votes: 50 + index, down_votes: 50 + index, volume: 2 }
  })
  await page.route('**/liangxiang/api/market', route => route.fulfill({ json: state, headers: { 'x-liangxiang-cache-scope': 'browser-chart-scope' } }))
  await page.route('**/liangxiang/api/market/candles?*', route => route.fulfill({ json: candlePage(route.request().url(), raw) }))
  const { chart } = await openChart(page)
  const marker = chart.locator('[data-liangxiang-market-current-point]')
  await expect(marker).toHaveAttribute('data-at', String(observed))
  await expect(marker).toHaveAttribute('data-source', 'candle')
  await chart.getByRole('button', { name: '潮汐', exact: true }).click()
  const end = chart.locator('[data-liangxiang-market-tide-end]').last()
  await expect(end).toHaveAttribute('data-at', String(observed))
  expect(Number(await marker.getAttribute('cx'))).toBeCloseTo(Number(await end.getAttribute('cx')), 5)
  expect(Number(await marker.getAttribute('cy'))).toBeCloseTo(Number(await end.getAttribute('cy')), 5)
  const svg = chart.locator('svg[data-liangxiang-market-from]')
  await svg.focus()
  await page.keyboard.press('Home')
  await expect(marker).toHaveAttribute('data-at', String(observed))
  await chart.getByRole('button', { name: 'K 线', exact: true }).click()
  await expect(marker).toHaveAttribute('data-at', String(observed))
  const displayCenter = Number(await chart.locator('[data-liangxiang-market-candle]').last().getAttribute('data-liangxiang-market-candle-x'))
  expect(Number(await marker.getAttribute('cx'))).toBeGreaterThan(displayCenter)
})

test('both plot styles split future grey time at the actual business clock with a left-aligned label and quiet phase strips', async ({ page }, testInfo) => {
  const state = chartFixture(), now = DAY + 13 * HOUR + 26 * MINUTE
  state.server_time = now
  state.current_point = { ...state.current_point!, at: DAY + 10 * HOUR }
  const data = [...chartCandles(), { at: DAY + 18 * HOUR, open: .5, close: .5, high: .5, low: .5, up_votes: 700, down_votes: 700, volume: 2 }]
  await page.route('**/liangxiang/api/market', route => route.fulfill({ json: state, headers: { 'x-liangxiang-cache-scope': 'browser-chart-scope' } }))
  await page.route('**/liangxiang/api/market/candles?*', route => route.fulfill({ json: candlePage(route.request().url(), data) }))
  const { dialog, chart } = await openChart(page)
  const svg = chart.locator('svg[data-liangxiang-market-from]')
  const future = chart.locator('[data-liangxiang-market-future]')
  const boundary = chart.locator('[data-liangxiang-market-current-time]')
  for (const mode of ['K 线', '潮汐']) {
    await chart.getByRole('button', { name: mode, exact: true }).click()
    await expect(boundary).toHaveAttribute('data-at', String(now))
    await expect(future).toHaveAttribute('data-at', String(now))
    await expect(future).toContainText('待开梁')
    expect(await boundary.getAttribute('stroke-dasharray')).toBeNull()
    const expectBoundary = async (): Promise<void> => {
      const from = Number(await svg.getAttribute('data-liangxiang-market-from')), until = Number(await svg.getAttribute('data-liangxiang-market-until'))
      const width = await svg.evaluate(element => (element as SVGSVGElement).viewBox.baseVal.width)
      const expected = 12 + (now - from) / (until - from) * (width - 76)
      expect(Number(await future.locator('rect').getAttribute('x'))).toBeCloseTo(expected, 4)
      expect(Number(await boundary.getAttribute('x1'))).toBeCloseTo(expected, 4)
      expect(Number(await boundary.getAttribute('x2'))).toBeCloseTo(expected, 4)
      expect(Number(await future.locator('text').getAttribute('x'))).toBeCloseTo(expected + 8, 4)
      await expect(future.locator('text')).toHaveAttribute('text-anchor', 'start')
    }
    await expectBoundary()
    const paint = await future.locator('rect').evaluate(element => ({ fill: getComputedStyle(element).fill, paper: getComputedStyle(element.closest('[data-liangxiang-market-dialog]')!).backgroundColor }))
    expect(paint.fill).not.toBe(paint.paper)
    expect(paint.fill).not.toBe('none')
    expect(await chart.locator('[data-liangxiang-market-phase]').evaluateAll(nodes => nodes.every(node => Number(node.getAttribute('height')) <= 3))).toBe(true)
    await expect(chart.locator('[data-liangxiang-market-reference] > line')).toHaveCount(3)
    const livePoint = chart.locator('[data-liangxiang-market-current-point]')
    await expect(livePoint).toHaveAttribute('data-at', String(DAY + 10 * HOUR))
    const futureX = Number(await boundary.getAttribute('x1'))
    expect(Number(await livePoint.getAttribute('cx'))).toBeLessThan(futureX)
    const visiblePoints = mode === '潮汐' ? chart.locator('[data-liangxiang-market-tide-end]') : chart.locator('[data-liangxiang-market-candle]')
    expect(await visiblePoints.evaluateAll((nodes, end) => nodes.every(node => Number(node.getAttribute('cx') ?? node.getAttribute('data-liangxiang-market-candle-x')) <= end), futureX)).toBe(true)
    await future.hover()
    await expect(chart.locator('[data-liangxiang-market-point-detail]')).toContainText('待开梁')
    await chart.getByRole('button', { name: '放大走势', exact: true }).click()
    await expectBoundary()
    await svg.focus()
    await page.keyboard.press('0')
    await expectBoundary()
  }
  await testInfo.attach('future-business-time-split', { body: await dialog.screenshot(), contentType: 'image/png' })
})

test('wheel zoom is continuous and cumulative around the pointer while the range stays a passive display', async ({ page }) => {
  const { chart } = await openChart(page)
  const svg = chart.locator('svg[data-liangxiang-market-from]')
  const range = chart.locator('.liangxiang-market-chart-window')
  const domain = async () => ({
    from: Number(await svg.getAttribute('data-liangxiang-market-from')),
    until: Number(await svg.getAttribute('data-liangxiang-market-until')),
  })
  const expectStableAnchor = async (view: { from: number, until: number }): Promise<void> => {
    const plotCssWidth = await svg.evaluate(element => {
      const svg = element as SVGSVGElement
      return svg.getBoundingClientRect().width * (svg.viewBox.baseVal.width - 76) / svg.viewBox.baseVal.width
    })
    const span = view.until - view.from
    // Browser input coordinates and fractional SVG bounds have CSS-pixel
    // precision. Verify visible drift, rather than requiring sub-ms precision
    // across a 24-hour domain; the pure projection tests retain exact anchors.
    const driftCssPixels = Math.abs(view.from + span * .35 - (DAY + 24 * HOUR * .35)) / span * plotCssWidth
    expect(driftCssPixels).toBeLessThanOrEqual(1)
  }
  const wheel = async (deltaY: number, count = 1): Promise<void> => {
    await svg.evaluate((element, values) => {
      const svg = element as SVGSVGElement, bounds = svg.getBoundingClientRect(), width = svg.viewBox.baseVal.width
      const clientX = bounds.left + (12 + (width - 76) * .35) / width * bounds.width
      for (let index = 0; index < values.count; index++) element.dispatchEvent(new WheelEvent('wheel', {
        deltaY: values.deltaY, deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        clientX, clientY: bounds.top + 50, bubbles: true, cancelable: true,
      }))
    }, { deltaY, count })
  }
  await wheel(-12)
  await expect.poll(async () => { const view = await domain(); return view.until - view.from }).toBeLessThan(24 * HOUR)
  const first = await domain(), firstSpan = first.until - first.from
  expect(firstSpan).toBeGreaterThan(23 * HOUR)
  expect(firstSpan).toBeCloseTo(24 * HOUR * Math.exp(-12 * .0015), 1)
  await expectStableAnchor(first)
  const minutes = Math.floor((firstSpan + 1) / MINUTE)
  await expect(range).toHaveText(`近${Math.floor(minutes / 60)}时${minutes % 60}分`)

  // A burst before the next animation frame must retain every delta, rather
  // than repeatedly using the previous React render's viewport.
  await wheel(-12, 3)
  await expect.poll(async () => { const view = await domain(); return view.until - view.from }).toBeLessThan(firstSpan)
  const accumulated = await domain()
  expect(accumulated.until - accumulated.from).toBeCloseTo(24 * HOUR * Math.exp(-48 * .0015), 1)
  await expectStableAnchor(accumulated)
  expect(await range.evaluate(element => element.tabIndex)).toBe(-1)

  await wheel(48)
  await expect(svg).toHaveAttribute('data-liangxiang-market-from', String(DAY))
  await expect(svg).toHaveAttribute('data-liangxiang-market-until', String(DAY + 24 * HOUR))
  await chart.getByRole('button', { name: '放大走势', exact: true }).click()
  await expect(range).toHaveText('近12时')
  const beforeRangeClick = await domain()
  await range.click()
  expect(await domain()).toEqual(beforeRangeClick)
  await svg.focus()
  await page.keyboard.press('0')
  await expect(range).toHaveText('今日')
})

test('legacy five-minute history remains five-minute data and cannot offer invented one-minute bars', async ({ page }) => {
  const legacy = chartFixture()
  delete legacy.candle_interval_ms
  await page.route('**/liangxiang/api/market', route => route.fulfill({ json: legacy, headers: { 'x-liangxiang-cache-scope': 'browser-chart-scope' } }))
  await page.route('**/liangxiang/api/market/candles?*', route => route.fulfill({ json: candlePage(route.request().url(), chartCandles(300_000), 300_000) }))
  const { chart } = await openChart(page)
  const svg = chart.locator('svg[data-liangxiang-market-from]')
  await expect(svg).toHaveAttribute('data-liangxiang-market-source-interval', '300000')
  for (let index = 0; index < 4; index++) await chart.getByRole('button', { name: '放大走势', exact: true }).click()
  await expect(svg).toHaveAttribute('data-liangxiang-market-interval', '300000')
  await expect(chart.locator('.liangxiang-market-chart-window')).toHaveText('近1时')
  await expect(chart.locator('[data-liangxiang-market-candle]')).toHaveCount(6)
  expect(await chart.locator('[data-liangxiang-market-candle]').evaluateAll(nodes => nodes.map(node => Number(node.getAttribute('data-liangxiang-market-candle-x'))))
    .then(xs => new Set(xs).size === xs.length)).toBe(true)
})

test('unified chart and wallet have no WCAG A/AA axe violations', async ({ page }) => {
  await openChart(page)
  const results = await new AxeBuilder({ page })
    .include('[data-liangxiang-market-dialog]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(results.violations, axeSummary(results.violations)).toEqual([])
})

test('legacy full-screen preferences cannot restore a second chart on reload', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('liangxiang:bars:v1', JSON.stringify({ slot: 'full', range: 'today', x: null, y: null }))
  })
  await page.reload()
  await expect(page.locator('[data-liangxiang-bars-window]')).toHaveCount(0)
  const onboarding = page.getByRole('dialog', { name: /^(?:Get started|Add an API key to get started)$/ })
  const appeared = await onboarding.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true, () => false)
  if (appeared) {
    await onboarding.getByRole('button', { name: /^(?:Close|Configure later)$/ }).click()
    await expect(onboarding).toBeHidden()
  }
  const { dialog } = await openChart(page)
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  // Both entry clicks are pointer actions; Escape clears their focus and hint.
  const trigger = page.locator('[data-liangxiang-market-entry]')
  await expect(trigger).not.toBeFocused()
  await expect(trigger).toHaveAttribute('data-liangxiang-ritual-resting', 'pointer')
  await expect.poll(() => trigger.locator('[data-liangxiang-hint]').evaluate(element => getComputedStyle(element).opacity)).toBe('0')
})
