import { expect, test, type Locator } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { MarketState, MarketPositionRequest, MarketCandle, MarketCandlesResponse, MarketReceipt } from '../../src/shared/market-v1.ts'
import { MARKET_CACHE_MAX_BYTES } from '../../src/shared/market-v1.ts'
import { bootInstalledLiangxiang, openPanel } from './helpers.ts'

declare global {
  interface Window {
    __liangxiangMarketFrame?: (state: MarketState) => void
    __liangxiangMarketStreamsClosed?: number
    __liangxiangMarketTones?: number[]
  }
}

const DAY = Date.UTC(2026, 10, 6), HOUR = 3_600_000, MINUTE = 60_000
function fixture(): MarketState {
  const schedule = [[9, 11, 12], [12, 16, 17], [17, 21, 22]] as const
  return { schema_version: 1, soft_trust: true, server_time: DAY + 13 * HOUR, candle_interval_ms: MINUTE,
    wallet: { available_incense: 90, frozen_incense: 10, total_incense: 100, token_remainder: 12_000, token_per_incense: 50_000, version: 1 },
    current_point: { case_id: 'case-market-browser', at: DAY + 13 * HOUR, up_votes: 55, down_votes: 45, sequence: 1 },
    market: { id: 'market-browser', case_id: 'case-market-browser', business_date: '2026-11-06', timezone: 'UTC', rule_version: 'liangxiang-market-v2', opens_at: DAY + 9 * HOUR, closes_at: DAY + 24 * HOUR, status: 'open', close_point: null,
      batches: schedule.map(([open, lock, reference], index) => ({ batch: (index + 1) as 1 | 2 | 3, opens_at: DAY + open * HOUR, locks_at: DAY + lock * HOUR, reference_at: DAY + reference * HOUR, status: index === 0 ? 'live' : index === 1 ? 'open' : 'pending', reference: index === 0 ? { case_id: 'case-market-browser', at: DAY + 12 * HOUR, up_votes: 50, down_votes: 50, sequence: 1 } : null, long_incense: index === 1 ? 30 : 0, short_incense: index === 1 ? 20 : 0, position: index === 1 ? { side: 'long', amount: 10, submitted_at: DAY + 12 * HOUR, payout: null } : null, result: null })) }
  }
}

function candles(): MarketCandle[] {
  return Array.from({ length: 780 }, (_, index) => {
    const open = .49 + Math.sin(index / 40) * .035, close = .49 + Math.sin((index + 1) / 40) * .035
    return { at: DAY + index * MINUTE, open, close, high: Math.max(open, close) + .004, low: Math.min(open, close) - .004, up_votes: 50 + index, down_votes: 50 + index, volume: 2 }
  })
}

function candlePage(url: string, data: MarketCandle[]): MarketCandlesResponse {
  const query = new URL(url).searchParams, after = Number(query.get('cursor') ?? -1)
  const limit = Math.min(288, Number(query.get('limit') ?? 288))
  const remaining = data.filter(candle => candle.at > after), page = remaining.slice(0, limit)
  return { schema_version: 1, case_id: 'case-market-browser', business_date: '2026-11-06', interval_ms: MINUTE,
    candles: page, next_cursor: remaining.length > page.length ? String(page.at(-1)!.at) : null }
}

test.beforeEach(async ({ page }) => {
  // UI-only mock in the real installed DSH shell. No fake wallet or position is sent to a live community.
  await page.addInitScript(() => {
    const Native = window.EventSource
    const sources = new Set<{ onmessage: ((event: MessageEvent) => void) | null }>()
    window.__liangxiangMarketStreamsClosed = 0
    window.EventSource = new Proxy(Native, {
      construct(target, args) {
        const path = new URL(String(args[0]), location.href).pathname
        if (path !== '/liangxiang/api/events' && path !== '/liangxiang/api/market/events') return Reflect.construct(target, args)
        const source = { onmessage: null as ((event: MessageEvent) => void) | null, onerror: null,
          close() { sources.delete(source); if (path.endsWith('/market/events')) window.__liangxiangMarketStreamsClosed = (window.__liangxiangMarketStreamsClosed ?? 0) + 1 } }
        if (path.endsWith('/market/events')) sources.add(source)
        return source
      },
    })
    window.__liangxiangMarketFrame = state => {
      for (const source of sources) source.onmessage?.(new MessageEvent('message', { data: JSON.stringify({ ...state, cache_scope: 'browser-market-scope' }) }))
    }
  })
  await page.route(/\/liangxiang\/api\/(?:state|refresh)(?:\?|$)/, async route => {
    const response = await route.fetch(), wire = await response.json() as Record<string, unknown>
    await route.fulfill({ response, json: { ...wire, authorityMode: 'DEV_STAGING_ONLY', authorityAvailable: true } })
  })
  let current = fixture()
  await page.route('**/liangxiang/api/market', route => route.fulfill({ json: current, headers: { 'x-liangxiang-cache-scope': 'browser-market-scope' } }))
  await page.route('**/liangxiang/api/market/candles?*', route => route.fulfill({ json: candlePage(route.request().url(), candles()) }))
  await page.route('**/liangxiang/api/market/history?*', route => route.fulfill({ json: { schema_version: 1, receipts: [], next_cursor: null }, headers: { 'x-liangxiang-cache-scope': 'browser-market-scope' } }))
  await page.route('**/liangxiang/api/market/position', async route => {
    const intent = route.request().postDataJSON() as MarketPositionRequest
    const batch = current.market!.batches[intent.batch - 1]!, old = batch.position
    const delta = intent.amount - (old?.amount ?? 0)
    if (old) { if (old.side === 'long') batch.long_incense -= old.amount; else batch.short_incense -= old.amount }
    if (intent.side === 'long') batch.long_incense += intent.amount
    else if (intent.side === 'short') batch.short_incense += intent.amount
    batch.position = intent.side ? { side: intent.side, amount: intent.amount, submitted_at: current.server_time, payout: null } : null
    current = { ...current, server_time: current.server_time + 1, wallet: { ...current.wallet, available_incense: current.wallet.available_incense - delta, frozen_incense: current.wallet.frozen_incense + delta, version: current.wallet.version + 1 } }
    await route.fulfill({ json: { accepted: true, reason: null, request_id: intent.request_id, state: current }, headers: { 'x-liangxiang-cache-scope': 'browser-market-scope' } })
  })
  await bootInstalledLiangxiang(page)
})

async function openMarket(page: Parameters<typeof openPanel>[0]) {
  const panel = await openPanel(page)
  await panel.locator('[data-liangxiang-market-entry]').click()
  const dialog = page.getByRole('dialog', { name: '梁股 · 香火市场', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('90')
  return dialog
}

async function expectReadableMarketLayout(dialog: Locator): Promise<void> {
  await expect.poll(() => dialog.evaluate(element => {
    const failures: string[] = []
    const box = (node: Element) => node.getBoundingClientRect()
    const textBox = (node: Element) => {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT), rects: DOMRect[] = []
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        const parent = text.parentElement
        if (!text.textContent?.trim() || !parent || parent.closest('[aria-hidden="true"]')) continue
        const style = getComputedStyle(parent)
        if (style.visibility === 'hidden' || style.display === 'none') continue
        const range = document.createRange()
        range.selectNodeContents(text)
        rects.push(...[...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0))
      }
      if (!rects.length) return null
      return { left: Math.min(...rects.map(rect => rect.left)), right: Math.max(...rects.map(rect => rect.right)),
        top: Math.min(...rects.map(rect => rect.top)), bottom: Math.max(...rects.map(rect => rect.bottom)) }
    }
    const labels = [...element.querySelectorAll('.liangxiang-market-wallet-label')]
    if (labels.length !== 2) failures.push('wallet has two captions')
    else {
      const first = box(labels[0]!), second = box(labels[1]!)
      if (second.top <= first.bottom || Math.abs(first.left - second.left) > 1) failures.push('wallet captions stack and align')
    }
    const available = element.querySelector('[data-liangxiang-market-available]')!, frozen = element.querySelector('[data-liangxiang-market-frozen]')!, total = element.querySelector('[data-liangxiang-market-total]')!
    const units = [...element.querySelectorAll('.liangxiang-market-wallet > small')]
    if (Math.abs(box(available).right - box(frozen).right) > 1 || units.length !== 2 || Math.abs(box(units[0]!).left - box(units[1]!).left) > 1) failures.push('wallet numbers and incense units align vertically')
    if (getComputedStyle(frozen).fontSize !== getComputedStyle(available).fontSize || getComputedStyle(frozen).color !== getComputedStyle(available).color) failures.push('wallet amounts share size and colour')
    const wallet = box(element.querySelector('.liangxiang-market-wallet')!), toolbar = box(element.querySelector('.liangxiang-market-chart-toolbar')!)
    if (toolbar.top - wallet.bottom < 4) failures.push('toolbar clears both wallet rows')
    if (Math.abs(toolbar.left - wallet.left) > 1 || Math.abs(toolbar.right - wallet.right) > 1) failures.push('toolbar and wallet share both edges')
    if (toolbar.width > 201 || Math.abs(box(units[0]!).right - wallet.right) > 1) failures.push('compact toolbar and wallet use their shared width')
    if (box(element).width > 600) {
      const fish = box(element.querySelector('[data-liangxiang-market-main-whale]')!), speech = box(element.querySelector('.liangxiang-market-companion-speech')!)
      const breathingRoom = fish.left - wallet.right
      if (breathingRoom < 24 || breathingRoom > 57 || speech.width < 160) failures.push('fish keeps breathing room from wallet without crowding speech')
    }
    const clock = element.querySelector('[data-liangxiang-market-clock]')!, controls = box(element.querySelector('.liangxiang-market-window-controls')!)
    const clockText = textBox(clock)
    if (!clockText || clockText.left < controls.left - 1 || clockText.right > controls.right + 1) failures.push('clock fits the fish-mode column')
    if (Number.parseFloat(getComputedStyle(clock).fontSize) <= 9) failures.push('clock is more readable than the previous nine-pixel caption')
    const tabs = [...element.querySelectorAll('.liangxiang-market-stage-tabs > button')]
    tabs.forEach((tab, index) => {
      const bounds = box(tab)
      if (index && bounds.left - box(tabs[index - 1]!).right < 4) failures.push(`stage ${index + 1} has its own gutter`)
      const rows = [...tab.querySelectorAll('.liangxiang-market-button-face > strong,.liangxiang-market-button-face > small')]
      const ink = rows.map(textBox)
      ink.forEach((row, line) => {
        if (!row) failures.push(`stage ${index + 1} line ${line + 1} exists`)
        else {
          if (row.left < bounds.left + 2 || row.right > bounds.right - 2 || row.top < bounds.top || row.bottom > bounds.bottom + 1) failures.push(`stage ${index + 1} line ${line + 1} stays inside its button`)
          // The top row also contains a decorative icon; center the whole row,
          // including that icon, rather than just its unequal text fragments.
          const icon = line === 0 ? rows[line]!.querySelector('svg') : null
          const iconBox = icon && getComputedStyle(icon).display !== 'none' ? box(icon) : null
          const left = iconBox ? Math.min(row.left, iconBox.left) : row.left
          const right = iconBox ? Math.max(row.right, iconBox.right) : row.right
          if (Math.abs((left + right) / 2 - (bounds.left + bounds.right) / 2) > 2) failures.push(`stage ${index + 1} line ${line + 1} is centered`)
        }
      })
      if (ink[0] && ink[1] && ink[1].top < ink[0].bottom - 1) failures.push(`stage ${index + 1} has separate text lines`)
    })
    const metrics = element.querySelector('.liangxiang-market-footer-metrics')!, actions = element.querySelector('.liangxiang-market-footer-actions')!
    const metricsBox = box(metrics), actionsBox = box(actions), fraction = metricsBox.width / (metricsBox.width + actionsBox.width)
    if (box(element).width > 600 && (fraction < .62 || fraction > .71 || metricsBox.right > actionsBox.left)) failures.push('footer reserves two thirds for facts and one third for actions')
    const cells = [...metrics.querySelectorAll(':scope > button')]
    if (cells.length !== 3 || !cells[1]?.contains(total)) failures.push('daily pool is between position and selected pool')
    cells.forEach((cell, index) => {
      const bounds = box(cell), ink = textBox(cell)
      if (!ink || ink.left < bounds.left - 1 || ink.right > bounds.right + 1) failures.push(`footer fact ${index + 1} text fits`)
      if (index && bounds.left - box(cells[index - 1]!).right < 4) failures.push('footer facts have a clear gutter')
      if (index && Math.abs(box(cell.querySelector(':scope > strong')!).top - box(cells[0]!.querySelector(':scope > strong')!).top) > 1) failures.push('footer values share a baseline')
    })
    const pool = element.querySelector('[data-liangxiang-market-pool]')!, amount = pool.querySelector('strong [title]')!, unit = pool.querySelector('strong small')!
    const label = pool.querySelector('.liangxiang-market-metric-label')!, reveal = pool.querySelector('.liangxiang-market-connection')!
    const caption = document.createRange(); caption.setStart(label.firstChild!, 0); caption.setEndBefore(reveal)
    const captionBox = caption.getBoundingClientRect(), revealBox = box(reveal)
    if (Math.abs(captionBox.top - revealBox.top) < 8 && revealBox.left - captionBox.right > 7) failures.push('midnight hint stays beside its pool caption')
    const distance = box(unit).left - box(amount).right
    if (distance < 0 || distance > 6) failures.push('pool amount and incense unit stay together')
    const frame = box(element)
    for (const line of element.querySelectorAll<HTMLElement>('[data-liangxiang-market-danmaku]')) {
      const bounds = box(line)
      if (bounds.left < frame.left || bounds.right > frame.right - 3 || line.scrollWidth > line.clientWidth + 1) failures.push('fish speech wraps inside the window')
    }
    for (const control of element.querySelectorAll('.liangxiang-market-footer-actions > button')) {
      const ink = textBox(control), bounds = box(control)
      if (!ink || ink.left < bounds.left - 1 || ink.right > bounds.right + 1 || bounds.right > frame.right) failures.push('footer action label fits')
    }
    return failures
  }), { message: 'Actual market text has hierarchy, centered stages and room between neighboring groups' }).toEqual([])
}

test('market keeps the four-region panel, on-demand artwork, trapped focus and clean stream disposal', async ({ page }, testInfo) => {
  const artwork = page.waitForResponse(response => new URL(response.url()).pathname === '/liangxiang/api/market/art.webp')
  const dialog = await openMarket(page)
  await expect(dialog).toBeFocused()
  await expect(dialog.locator('.liangxiang-market-header')).not.toContainText(/本地演示|三批投入|午夜共同收盘/)
  await expect(dialog.getByRole('combobox', { name: '烛线间隔' })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: '近4时', exact: true })).toHaveCount(0)
  const range = dialog.getByRole('group', { name: '走势时间范围' })
  await expect(range.getByRole('button')).toHaveCount(0)
  expect(await range.locator('output').evaluate(element => element.tabIndex)).toBe(-1)
  await expect(dialog.locator('[data-liangxiang-market-main-whale]')).toHaveCount(1)
  const fishBounds = (await dialog.locator('[data-liangxiang-market-main-whale]').boundingBox())!
  const headerBounds = (await dialog.locator('.liangxiang-market-header').boundingBox())!
  const chartBounds = (await dialog.locator('[data-liangxiang-market-chart-mode]').boundingBox())!
  expect(fishBounds.x).toBeGreaterThanOrEqual(headerBounds.x)
  expect(fishBounds.x + fishBounds.width).toBeLessThanOrEqual(headerBounds.x + headerBounds.width + 1)
  expect(fishBounds.y).toBeGreaterThanOrEqual(headerBounds.y)
  expect(fishBounds.y + fishBounds.height).toBeLessThanOrEqual(chartBounds.y + 40)
  expect((await artwork).status()).toBe(200)
  const resolution = await dialog.locator('[data-liangxiang-market-whale-art]').evaluate(async element => {
    const image = new Image()
    image.src = element.getAttribute('href')!
    await image.decode()
    return [image.naturalWidth, image.naturalHeight]
  })
  expect(resolution).toEqual([493, 512])
  const checkHeader = async (): Promise<void> => {
    const groups = await dialog.locator('.liangxiang-market-window-actions,.liangxiang-market-motion').evaluateAll(nodes => nodes.map(node => {
      const { width, right, top, bottom } = node.getBoundingClientRect()
      return { width, right, top, bottom }
    }))
    expect(groups).toHaveLength(2)
    for (const group of groups) expect(group.width).toBeCloseTo(64, 0)
    expect(groups[0]!.right).toBeCloseTo(groups[1]!.right, 0)
    expect(groups[1]!.top - groups[0]!.bottom).toBeCloseTo(10, 0)
    for (const group of groups) expect(group.bottom - group.top).toBeCloseTo(28, 0)
    const title = (await dialog.locator('.liangxiang-market-header h2').boundingBox())!
    expect(title.y).toBeCloseTo(groups[0]!.top, 0)
    const halves = await dialog.locator('.liangxiang-market-window-actions button').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().width))
    expect(halves).toHaveLength(2)
    for (const width of halves) expect(width).toBeCloseTo(28, 0)
    const controlGap = await dialog.locator('.liangxiang-market-window-actions').evaluate(element => {
      const [first, second] = [...element.children].map(child => child.getBoundingClientRect())
      return second!.left - first!.right
    })
    expect(controlGap).toBeCloseTo(8, 0)
    const rangeBounds = (await range.boundingBox())!, zoomBounds = (await dialog.locator('.liangxiang-market-chart-zoom').boundingBox())!
    expect(rangeBounds.x).toBeGreaterThanOrEqual(zoomBounds.x + zoomBounds.width)
    expect(Math.abs(rangeBounds.y + rangeBounds.height / 2 - zoomBounds.y - zoomBounds.height / 2)).toBeLessThanOrEqual(1)
    await expect(range.locator('output')).toHaveCSS('border-top-width', '0px')
    await expect(range.locator('output')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expect(dialog.locator('.liangxiang-market-chart-quotes')).toHaveCSS('text-align', 'center')
    await expect(dialog.locator('.liangxiang-market-chart-readout')).toHaveCount(0)
    await expect(dialog.locator('.liangxiang-market-position')).toHaveCSS('text-align', 'left')
    await expect(dialog.locator('[data-liangxiang-market-direction-legend]')).toBeVisible()
    await expect(dialog.locator('.liangxiang-market-companion-speech')).toHaveCSS('font-size', '11px')
    await expect(dialog.locator('.liangxiang-market-companion-speech')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    const fish = (await dialog.locator('[data-liangxiang-market-main-whale]').boundingBox())!
    expect(fish.width).toBeGreaterThanOrEqual((page.viewportSize()?.width ?? 1440) <= 600 ? 83 : 95)
    expect(fish.height).toBeGreaterThanOrEqual((page.viewportSize()?.width ?? 1440) <= 600 ? 87 : 99)
    expect(await dialog.evaluate(element => {
      const bounds = element.getBoundingClientRect()
      return element.scrollWidth <= element.clientWidth + 1 && [...element.querySelectorAll('.liangxiang-market-header-copy,.liangxiang-market-companion-trigger,.liangxiang-market-window-controls,.liangxiang-market-chart-window')].every(node => {
        const rect = node.getBoundingClientRect()
        return rect.left >= bounds.left && rect.right <= bounds.right + 1
      })
    })).toBe(true)
  }
  await checkHeader()
  await dialog.getByRole('button', { name: '大肥鱼：播报本盘香池与时间', exact: true }).hover()
  await expect(dialog.locator('.liangxiang-market-companion-trigger')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  const motion = dialog.getByRole('switch', { name: '交易动画' })
  await motion.hover()
  await expect(motion).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(motion).toHaveCSS('border-top-width', '0px')
  const viewport = page.viewportSize()!
  try {
    for (const width of [360, 662]) { await page.setViewportSize({ width, height: 820 }); await checkHeader() }
  } finally { await page.setViewportSize(viewport) }
  expect(await page.locator('[data-liangxiang-region]').count()).toBe(4)
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
  }
  await dialog.screenshot({ path: testInfo.outputPath('market-independent.png') })
  const axe = await new AxeBuilder({ page }).include('[data-liangxiang-market-dialog]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(axe.violations).toEqual([])
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.locator('[data-liangxiang-market-entry]')).not.toBeFocused()
  await expect.poll(() => page.evaluate(() => window.__liangxiangMarketStreamsClosed)).toBe(1)
})

test('market follows the DSH appearance choice when it overrides the operating system theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  expect(await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(false)
  let positionRequests = 0
  page.on('request', request => { if (new URL(request.url()).pathname === '/liangxiang/api/market/position') positionRequests++ })
  const chooseAppearance = async (dark: boolean): Promise<void> => {
    await page.getByRole('button', { name: 'Account menu', exact: true }).click()
    await page.getByRole('menuitem', { name: /^(Settings|设置)/ }).click()
    const settings = page.getByRole('dialog', { name: /^(Settings|设置)$/ })
    await settings.getByRole('button', { name: dark ? /^(Dark|深色)$/ : /^(Light|浅色)$/ }).click()
    await settings.getByRole('button', { name: /^(Close|关闭)$/ }).click()
    await expect(page.locator('html')).toHaveCSS('color-scheme', dark ? 'dark' : 'light')
  }
  for (const dark of [true, false]) {
    await chooseAppearance(dark)
    const dialog = await openMarket(page)
    await expect(dialog).toHaveCSS('color-scheme', dark ? 'dark' : 'light')
    const channels = await dialog.evaluate(element => (getComputedStyle(element).backgroundColor.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number))
    expect(channels).toHaveLength(3)
    // Check the actual resolved paint as well as the inherited color-scheme:
    // a locally declared `light dark` used to leave this window white under Dark.
    if (dark) expect(Math.max(...channels)).toBeLessThan(100)
    else expect(Math.min(...channels)).toBeGreaterThan(200)
    await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('90')
    await expect(dialog.locator('[data-liangxiang-market-frozen]')).toHaveText('10')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  }
  expect(positionRequests).toBe(0)
})

test('server clock, batch cutoffs, persistent holdings and selected pool stay readable with large amounts on narrow screens', async ({ page }, testInfo) => {
  let writes = 0
  page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/liangxiang/api/market/position') writes++ })
  const dialog = await openMarket(page), pool = dialog.locator('[data-liangxiang-market-pool]')
  const available = dialog.locator('[data-liangxiang-market-available]')
  await expect(dialog.locator('.liangxiang-market-wallet')).toContainText('个人可用')
  await expect(dialog.locator('.liangxiang-market-wallet-label')).toHaveText(['个人可用', '冻结香火'])
  await expect(dialog.locator('.liangxiang-market-footer-metrics > button .liangxiang-market-metric-label')).toHaveText([/梁位/, '今日香池', /午盘香池.*午夜揭晓/])
  const dailyPool = dialog.locator('[data-liangxiang-market-total] [title]')
  await expect(dailyPool).toHaveText('50')
  await expect(dialog.locator('[data-liangxiang-market-clock]')).toHaveText('11/06 13:00')
  await expect(dialog.locator('[data-liangxiang-market-clock]')).toHaveAttribute('title', /UTC.*服务器业务时间/)
  await expect(dialog.getByRole('tab')).toHaveCount(3)
  for (const [name, lock, reference] of [['早盘', '11点', '12:00'], ['午盘', '16点', '17:00'], ['晚盘', '21点', '22:00']] as const) {
    const tab = dialog.getByRole('tab', { name: new RegExp(name) })
    await expect(tab.locator('time')).toHaveText(`${lock}封盘`)
    await expect(tab).toHaveAttribute('aria-description', new RegExp(`${reference}定梁`))
  }
  const early = dialog.getByRole('tab', { name: /早盘/ }), noon = dialog.getByRole('tab', { name: /午盘/ })
  await expect(noon).toContainText('多10炷')
  await expect(noon).toContainText('可投入')
  await expect(dialog.locator('.liangxiang-market-stage-tabs')).not.toContainText('未投入')
  await expect(early.locator('small')).toHaveText('已定梁')
  const poolValue = pool.locator('strong [title]')
  const expectPool = async (name: string, amount: string): Promise<void> => {
    await expect(pool.locator('.liangxiang-market-metric-label')).toContainText(`${name}香池`)
    await expect(poolValue).toHaveText(amount)
  }
  await expectPool('午盘', '50')
  await expect(pool.locator('.liangxiang-market-connection')).toHaveText('午夜揭晓')
  await expect(pool.locator('.liangxiang-market-connection')).toHaveAttribute('title', '早、午、晚三盘均在24:00后统一揭晓')
  await expectReadableMarketLayout(dialog)
  const initial = (await dialog.boundingBox())!
  await early.click()
  await expectPool('早盘', '0')
  await expect(dailyPool).toHaveText('50')
  await expect(noon).toContainText('多10炷')
  await expect(dialog.getByRole('spinbutton')).toBeDisabled()
  expect((await dialog.boundingBox())!.height).toBeCloseTo(initial.height, 0)
  await noon.click()
  await expectPool('午盘', '50')
  await expect(dialog.getByRole('spinbutton', { name: '午盘总投入香火' })).toHaveValue('10')

  const large = fixture(), maximum = Number.MAX_SAFE_INTEGER
  large.server_time += 1
  large.wallet = { ...large.wallet, available_incense: maximum - 10, frozen_incense: 10, total_incense: maximum, version: 2 }
  large.market!.batches[1] = { ...large.market!.batches[1]!, long_incense: maximum, short_incense: maximum }
  large.market!.batches[0] = { ...large.market!.batches[0]!, long_incense: 12, short_incense: 8 }
  large.market!.batches[2] = { ...large.market!.batches[2]!, long_incense: 14, short_incense: 16 }
  await page.evaluate(state => window.__liangxiangMarketFrame?.(state), large)
  await expect(available).toHaveText('9007万亿')
  expect(await available.locator('[title]').evaluate((element, count) => {
    const exact = count.toLocaleString()
    return element.getAttribute('title') === exact && element.getAttribute('aria-label') === exact
  }, maximum - 10)).toBe(true)
  await expect(poolValue).toHaveText('1.801亿亿')
  await expect(dailyPool).toHaveText('1.801亿亿')
  await expect(dailyPool).toHaveAttribute('title', (2n * BigInt(maximum) + 50n).toLocaleString())
  expect(await poolValue.evaluate((element, count) => {
    const exact = BigInt(count).toLocaleString()
    return element.getAttribute('title') === exact && element.getAttribute('aria-label') === exact
  }, String(2n * BigInt(maximum)))).toBe(true)
  await expect(noon).toContainText('多10炷')
  expect((await dialog.boundingBox())!.height).toBeCloseTo(initial.height, 0)
  const viewport = page.viewportSize()!
  try {
    for (const width of [800, 662, 480, 360, 320]) {
      await page.setViewportSize({ width, height: 900 })
      const frame = (await dialog.boundingBox())!
      expect(frame.width).toBeLessThanOrEqual(width)
      expect(frame.height).toBeLessThanOrEqual(640)
      await expect.poll(() => dialog.evaluate(element => {
        const frame = element.getBoundingClientRect()
        const nodes = [...element.querySelectorAll<HTMLElement>('.liangxiang-market-header-copy,.liangxiang-market-wallet,.liangxiang-market-clock,.liangxiang-market-stage-tabs button,.liangxiang-market-pool')]
        const failures = nodes.flatMap(node => {
          const bounds = node.getBoundingClientRect()
          return bounds.left >= frame.left && bounds.right <= frame.right + 1 && node.scrollWidth <= node.clientWidth + 1 ? []
            : [{ node: node.className, text: node.textContent, left: bounds.left - frame.left, right: bounds.right - frame.right, scroll: node.scrollWidth, client: node.clientWidth }]
        })
        if (element.scrollWidth > element.clientWidth + 1) failures.push({ node: 'dialog', text: '', left: 0, right: 0, scroll: element.scrollWidth, client: element.clientWidth })
        return failures
      }), { message: `No clipped or overflowing market copy at ${width}px` }).toEqual([])
      await expectReadableMarketLayout(dialog)
      for (const mode of ['潮汐', 'K 线']) {
        await dialog.getByRole('button', { name: mode, exact: true }).click()
        await expectReadableMarketLayout(dialog)
      }
      await early.click()
      await expectPool('早盘', '20')
      await expect(dailyPool).toHaveAttribute('title', (2n * BigInt(maximum) + 50n).toLocaleString())
      await expect(noon).toContainText('多10炷')
      expect((await dialog.boundingBox())!.height).toBeCloseTo(frame.height, 0)
      await noon.click()
      await expect(poolValue).toHaveText('1.801亿亿')
      await expectReadableMarketLayout(dialog)
      expect((await dialog.boundingBox())!.height).toBeCloseTo(frame.height, 0)
    }
    await dialog.screenshot({ path: testInfo.outputPath('market-compact-large-amounts.png') })
  } finally { await page.setViewportSize(viewport) }
  const nonIntegralCutoff = structuredClone(large)
  nonIntegralCutoff.server_time += 1
  nonIntegralCutoff.market!.batches[2]!.locks_at += 30 * MINUTE
  await page.evaluate(state => window.__liangxiangMarketFrame?.(state), nonIntegralCutoff)
  await expect(dialog.getByRole('tab', { name: /晚盘/ }).locator('time')).toHaveText('21:30封盘')
  expect(writes).toBe(0)
})

test('whole-position changes freeze only the difference and a short position follows the confirmed direction', async ({ page }) => {
  const dialog = await openMarket(page), ticket = dialog.locator('[data-liangxiang-market-batch="2"]')
  const intents: MarketPositionRequest[] = []
  page.on('request', request => { if (new URL(request.url()).pathname === '/liangxiang/api/market/position') intents.push(request.postDataJSON() as MarketPositionRequest) })
  await ticket.getByRole('button', { name: '↘ 做空' }).click()
  await ticket.getByRole('spinbutton', { name: '午盘总投入香火' }).fill('20')
  await ticket.getByRole('button', { name: '确认调整' }).click()
  await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('80')
  await expect(dialog.locator('[data-liangxiang-market-frozen]')).toHaveText('20')
  expect(intents).toHaveLength(1)
  expect(intents[0]).toMatchObject({ batch: 2, side: 'short', amount: 20 })
  await expect(dialog.locator('.liangxiang-market-companion-speech')).toContainText('已确认空20炷')
  const live = fixture()
  live.server_time = DAY + 18 * HOUR
  live.current_point = { ...live.current_point!, at: live.server_time }
  live.market!.batches[1] = { ...live.market!.batches[1]!, status: 'live', reference: { ...live.current_point!, at: DAY + 17 * HOUR, up_votes: 50, down_votes: 50 }, position: { side: 'short', amount: 20, submitted_at: DAY + 13 * HOUR, payout: null }, long_incense: 20, short_incense: 40 }
  live.market!.batches[2] = { ...live.market!.batches[2]!, status: 'open' }
  live.wallet = { ...live.wallet, available_incense: 80, frozen_incense: 20, version: 2 }
  await page.evaluate(state => window.__liangxiangMarketFrame?.(state), live)
  const companion = dialog.locator('.liangxiang-market-companion')
  await expect(companion).toHaveAttribute('data-pose', 'dive')
  await page.evaluate(state => window.__liangxiangMarketFrame?.(state), { ...live, server_time: live.server_time + 1, current_point: { ...live.current_point!, up_votes: 45, down_votes: 55, sequence: 2 } })
  await expect(companion).toHaveAttribute('data-pose', 'surface')
  await expect(ticket.getByRole('spinbutton')).toBeDisabled()
  await expect(ticket.getByRole('button', { name: '撤回', exact: true })).toBeDisabled()
  await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('80')
  await expect(dialog.locator('[data-liangxiang-market-frozen]')).toHaveText('20')
})

test('motion uses distinct local gestures without replaying ordinary frames, hidden actions or a wheel burst', async ({ page }, testInfo) => {
  const dialog = await openMarket(page), toggle = dialog.getByRole('switch', { name: '交易动画' })
  await expect(dialog).toHaveAttribute('data-animated', 'false')
  await expect(toggle).toContainText('大鱼干')
  await expect(toggle).toHaveAttribute('title', /系统.*减少动态/)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await toggle.click()
  await expect(dialog).toHaveAttribute('data-animated', 'true')
  await expect(toggle).toContainText('大肥鱼')
  const face = dialog.locator('[data-liangxiang-market-steady-face]')
  await expect(face).toHaveCount(1)
  expect(await face.evaluate(element => {
    let swims = false
    for (let node: Element | null = element; node && !node.hasAttribute('data-liangxiang-market-dialog'); node = node.parentElement) {
      if (node.hasAttribute('mask') || getComputedStyle(node).filter.includes('blur(')) return false
      for (const animation of node.getAnimations()) {
        if (animation.effect?.getTiming().iterations !== Infinity) continue
        swims = true
        if ((animation.effect as KeyframeEffect).getKeyframes().some(frame => String(frame.transform).includes('scale'))) return false
      }
    }
    return swims
  })).toBe(true)
  const frameTiming = await page.evaluate(async () => {
    const times: number[] = []
    await new Promise<void>(resolve => {
      const sample = (at: number): void => { times.push(at); if (times.length < 61) requestAnimationFrame(sample); else resolve() }
      requestAnimationFrame(sample)
    })
    const spans = times.slice(1).map((at, i) => at - times[i]!).sort((a, b) => a - b)
    return { samples: spans.length, median_ms: spans[Math.floor(spans.length * .5)], p95_ms: spans[Math.floor(spans.length * .95)], gaps_over_50ms: spans.filter(span => span > 50).length }
  })
  await testInfo.attach('market-frame-timing', { body: JSON.stringify(frameTiming), contentType: 'application/json' })
  await dialog.getByRole('button', { name: '潮汐', exact: true }).click()
  const companion = dialog.locator('.liangxiang-market-companion')
  const speech = companion.locator('.liangxiang-market-companion-speech')
  const actor = companion.locator('.liangxiang-market-companion-actor')
  await expect(speech).toHaveAttribute('data-fish-action', 'mode-tide')
  await expect(companion).toHaveAttribute('data-motion', 'true')
  const actorNode = await actor.elementHandle()
  // Observe the actual one-shot WAAPI keyframes without replacing their execution.
  await actor.evaluate(element => {
    const animate = element.animate.bind(element)
    element.setAttribute('data-test-action-plays', '0')
    element.animate = (frames, options) => {
      element.setAttribute('data-test-action-plays', String(Number(element.getAttribute('data-test-action-plays')) + 1))
      element.setAttribute('data-test-action-frames', JSON.stringify(frames))
      return animate(frames, options)
    }
  })
  await dialog.getByRole('button', { name: '↘ 做空', exact: true }).click()
  await expect(speech).toHaveAttribute('data-fish-action', 'short')
  await expect(speech).not.toBeEmpty()
  await expect(actor).toHaveAttribute('data-test-action-plays', '1')
  const shortFrames = await actor.getAttribute('data-test-action-frames')
  const reaction = await companion.getAttribute('data-reaction-id')
  const point = dialog.locator('[data-liangxiang-market-current-point]'), initialX = await point.getAttribute('cx')
  const ordinaryFrame = fixture()
  ordinaryFrame.server_time += 1_000
  ordinaryFrame.current_point = { ...ordinaryFrame.current_point!, at: ordinaryFrame.server_time, sequence: 2 }
  await page.evaluate(state => window.__liangxiangMarketFrame?.(state), ordinaryFrame)
  // A newer snapshot alone must not move the latest raw-candle endpoint.
  await expect(point).toHaveAttribute('data-source', 'candle')
  await expect(point).toHaveAttribute('cx', initialX!)
  expect(await actorNode!.evaluate(element => element.isConnected)).toBe(true)
  await expect(companion).toHaveAttribute('data-reaction-id', reaction!)
  await expect(actor).toHaveAttribute('data-test-action-plays', '1')
  const setHidden = async (hidden: boolean): Promise<void> => {
    await page.evaluate(value => {
      Object.defineProperty(document, 'hidden', { configurable: true, value })
      document.dispatchEvent(new Event('visibilitychange'))
    }, hidden)
    await expect(companion).toHaveAttribute('data-motion', String(!hidden))
  }
  const settleMotion = async (): Promise<void> => {
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  }
  try {
    await setHidden(true)
    await setHidden(false)
    await settleMotion()
    await expect(companion).toHaveAttribute('data-reaction-id', reaction!)
    await expect(actor).toHaveAttribute('data-test-action-plays', '1')
    await setHidden(true)
    await dialog.getByRole('button', { name: '↗ 做多', exact: true }).click()
    await expect(speech).toHaveAttribute('data-fish-action', 'long')
    await setHidden(false)
    await settleMotion()
    await expect(actor).toHaveAttribute('data-test-action-plays', '1')
  } finally {
    await page.evaluate(() => { Reflect.deleteProperty(document, 'hidden'); document.dispatchEvent(new Event('visibilitychange')) })
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(companion).toHaveAttribute('data-motion', 'false')
  await dialog.getByRole('button', { name: '↘ 做空', exact: true }).click()
  await expect(speech).toHaveAttribute('data-fish-action', 'short')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(companion).toHaveAttribute('data-motion', 'true')
  await settleMotion()
  await expect(actor).toHaveAttribute('data-test-action-plays', '1')
  // Changing a direction is a draft; neither wallet nor confirmed water pose changes.
  await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('90')
  await expect(dialog.locator('[data-liangxiang-market-frozen]')).toHaveText('10')
  await expect(companion).toHaveAttribute('data-pose', 'surface')
  await dialog.getByRole('button', { name: '↗ 做多', exact: true }).click()
  await expect(speech).toHaveAttribute('data-fish-action', 'long')
  await expect(actor).toHaveAttribute('data-test-action-plays', '2')
  expect(await actor.getAttribute('data-test-action-frames')).not.toBe(shortFrames)
  await dialog.getByRole('tab', { name: /早盘/ }).click()
  await expect(speech).toHaveAttribute('data-fish-action', 'batch1')
  await dialog.getByRole('tab', { name: /午盘/ }).click()
  await expect(speech).toHaveAttribute('data-fish-action', 'batch2')
  const svg = dialog.locator('.liangxiang-market-chart-scroll > svg')
  await dialog.getByRole('button', { name: '放大走势', exact: true }).click()
  await expect(speech).toHaveAttribute('data-fish-action', 'zoom-in')
  await dialog.getByRole('button', { name: '缩小走势', exact: true }).click()
  await expect(speech).toHaveAttribute('data-fish-action', 'zoom-out')
  const initialFrom = await svg.getAttribute('data-liangxiang-market-from')
  const initialUntil = await svg.getAttribute('data-liangxiang-market-until')
  await svg.hover()
  await page.mouse.wheel(0, -120)
  await expect(speech).toHaveAttribute('data-fish-action', 'zoom-in')
  const wheelReaction = await companion.getAttribute('data-reaction-id')
  const wheelText = await speech.textContent()
  const wheelPlays = await actor.getAttribute('data-test-action-plays')
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -25)
  await expect(companion).toHaveAttribute('data-reaction-id', wheelReaction!)
  await expect(speech).toHaveText(wheelText!)
  await expect(actor).toHaveAttribute('data-test-action-plays', wheelPlays!)
  expect(Number(await svg.getAttribute('data-liangxiang-market-until')) - Number(await svg.getAttribute('data-liangxiang-market-from'))).toBeLessThan(Number(initialUntil) - Number(initialFrom))
  await svg.focus()
  await page.keyboard.press('0')
  await expect(dialog.getByRole('button', { name: '缩小走势', exact: true })).toBeDisabled()
  await dialog.getByRole('button', { name: 'K 线', exact: true }).click()
  await expect(speech).toHaveAttribute('data-fish-action', 'mode-candles')
  const live = fixture()
  live.server_time = DAY + 18 * HOUR
  live.current_point = { ...live.current_point!, at: live.server_time }
  live.market!.batches[1] = { ...live.market!.batches[1]!, status: 'live', reference: { ...live.current_point!, at: DAY + 17 * HOUR, up_votes: 50, down_votes: 50 } }
  live.market!.batches[2] = { ...live.market!.batches[2]!, status: 'open' }
  await page.evaluate(state => window.__liangxiangMarketFrame?.(state), live)
  const figure = dialog.locator('[data-liangxiang-market-whale-figure]')
  await expect(figure).toHaveAttribute('data-pose', 'surface')
  const parts = figure.locator('.liangxiang-market-whale-tail,.liangxiang-market-whale-hair,.liangxiang-market-whale-breath')
  await expect.poll(() => parts.evaluateAll(nodes => nodes.every(node => node.getAnimations().some(animation => animation.playState === 'running')))).toBe(true)
  const tail = parts.first(), initial = await tail.evaluate(element => getComputedStyle(element).transform)
  await expect.poll(() => tail.evaluate(element => getComputedStyle(element).transform)).not.toBe(initial)
  expect(await figure.evaluate(element => getComputedStyle(element).animationName)).toBe('none')
  await dialog.getByRole('button', { name: '潮汐', exact: true }).click()
  const water = dialog.locator('.liangxiang-market-water-motion .liangxiang-market-water-back').first()
  await expect.poll(() => water.evaluate(element => element.getAnimations().some(animation => animation.playState === 'running'))).toBe(true)
  const pose = await companion.getAttribute('data-pose')
  await dialog.getByRole('button', { name: '大肥鱼：播报本盘香池与时间', exact: true }).click()
  await expect(speech).toHaveAttribute('data-fish-action', 'report')
  await expect(actor).toHaveAttribute('data-test-action-frames', /translate\(0px,-8px\)/)
  await expect.poll(() => actor.evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).m42)).toBeLessThan(-4)
  await expect(companion.locator('[data-accent="bubbles"] circle')).toHaveCount(3)
  expect(await companion.getAttribute('data-pose')).toBe(pose)
  await dialog.screenshot({ path: testInfo.outputPath('market-surface-motion.png') })
  await toggle.click()
  await expect(dialog).toHaveAttribute('data-animated', 'false')
  await expect(toggle).toContainText('大鱼干')
  await expect(companion).toHaveAttribute('data-motion', 'false')
  // React consumes/cancels the previous WAAPI gesture in a passive effect after
  // rendering its static attributes; allow that cleanup, never a lasting loop.
  await expect.poll(() => dialog.evaluate(element => element.getAnimations({ subtree: true }).length), { timeout: 500, intervals: [0, 16, 32, 64] }).toBe(0)
  await dialog.getByRole('button', { name: 'K 线', exact: true }).click()
  await expect(speech).toHaveAttribute('data-fish-action', 'mode-candles')
  await expect.poll(() => dialog.evaluate(element => element.getAnimations({ subtree: true }).length), { timeout: 500, intervals: [0, 16, 32, 64] }).toBe(0)
  await page.evaluate(state => window.__liangxiangMarketFrame?.(state), { ...live, server_time: live.server_time + 1, current_point: { ...live.current_point!, up_votes: 45, down_votes: 55, sequence: 2 } })
  await expect(figure).toHaveAttribute('data-pose', 'dive')
  await expect(figure.locator('[data-liangxiang-market-water-occlusion]')).toHaveAttribute('data-liangxiang-market-water-occlusion', 'dive')
  await expect(figure.locator('[data-liangxiang-market-dive-bubbles] circle')).toHaveCount(3)
  await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('90')
  await dialog.screenshot({ path: testInfo.outputPath('market-dive-static.png') })
  await page.keyboard.press('Escape')
  const reopened = await openMarket(page)
  await expect(reopened).toHaveAttribute('data-animated', 'false')
  const bytes = await page.evaluate(() => {
    const cache = localStorage.getItem('liangxiang.market.cache.v1') ?? ''
    const pending = localStorage.getItem('liangxiang.market.pending.v1') ?? ''
    return { bytes: (cache.length + pending.length) * 2, hasWallet: cache.includes('available_incense') }
  })
  expect(bytes.bytes).toBeLessThan(MARKET_CACHE_MAX_BYTES)
  expect(bytes.hasWallet).toBe(false)
})

test('compact order keeps withdrawal in the order bar, clamps excessive input and preserves stage drafts', async ({ page }, testInfo) => {
  const dialog = await openMarket(page)
  const initialBounds = (await dialog.boundingBox())!
  const chart = dialog.locator('[data-liangxiang-market-chart-mode]')
  const initialChartBounds = (await chart.boundingBox())!
  const expectStableFrame = async (): Promise<void> => {
    const bounds = (await dialog.boundingBox())!, chartBounds = (await chart.boundingBox())!
    expect(Math.abs(bounds.height - initialBounds.height)).toBeLessThanOrEqual(1)
    expect(Math.abs(bounds.y - initialBounds.y)).toBeLessThanOrEqual(1)
    expect(Math.abs(chartBounds.height - initialChartBounds.height)).toBeLessThanOrEqual(1)
    expect(Math.abs(chartBounds.y - initialChartBounds.y)).toBeLessThanOrEqual(1)
  }
  const amount = dialog.getByRole('spinbutton', { name: '午盘总投入香火' })
  const ticket = dialog.locator('[data-liangxiang-market-batch="2"]')
  const controls = ticket.locator('.liangxiang-market-direction,.liangxiang-market-amount,.liangxiang-market-primary,.liangxiang-market-withdraw')
  const expectCompactOrder = async (): Promise<void> => {
    const boxes = await controls.evaluateAll(nodes => nodes.map(node => {
      const { top, bottom, left, right } = node.getBoundingClientRect()
      return { top, bottom, left, right }
    }))
    expect(boxes).toHaveLength(4)
    const order = (await ticket.locator('.liangxiang-market-order').boundingBox())!
    for (const box of boxes) {
      expect(box.left).toBeGreaterThanOrEqual(order.x - 1)
      expect(box.right).toBeLessThanOrEqual(order.x + order.width + 1)
      expect(box.bottom - box.top).toBeGreaterThanOrEqual(30)
    }
    // Confirm and withdrawal stay side by side at every width.
    expect(Math.max(boxes[2]!.top, boxes[3]!.top)).toBeLessThan(Math.min(boxes[2]!.bottom, boxes[3]!.bottom))
    expect(boxes[3]!.left).toBeGreaterThanOrEqual(boxes[2]!.right)
    if (page.viewportSize()!.width > 520) {
      expect(Math.max(...boxes.map(item => item.top))).toBeLessThan(Math.min(...boxes.map(item => item.bottom)))
      expect(boxes[1]!.left).toBeGreaterThanOrEqual(boxes[0]!.right)
      expect(boxes[2]!.left).toBeGreaterThanOrEqual(boxes[1]!.right)
    } else {
      expect(Math.max(boxes[0]!.top, boxes[1]!.top)).toBeLessThan(Math.min(boxes[0]!.bottom, boxes[1]!.bottom))
      expect(boxes[2]!.top).toBeGreaterThanOrEqual(Math.max(boxes[0]!.bottom, boxes[1]!.bottom))
    }
  }
  await expectCompactOrder()
  if (testInfo.project.name === 'chromium-desktop') {
    const viewport = page.viewportSize()!
    try { await page.setViewportSize({ width: 662, height: 820 }); await expectCompactOrder() }
    finally { await page.setViewportSize(viewport) }
  }
  await amount.fill('999999999')
  await expect(amount).toHaveValue('100')
  await amount.press('Tab')
  await expect(ticket.locator('[aria-invalid="true"], [role="alert"]')).toHaveCount(0)
  await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('90')
  await amount.fill('17')
  await expect(dialog.getByRole('tabpanel')).toHaveCount(1)
  await dialog.getByRole('tab', { name: /早盘/ }).click()
  await expect(dialog.getByRole('tabpanel')).toHaveCount(1)
  await expect(dialog.getByRole('spinbutton')).toBeDisabled()
  await expect(dialog.getByRole('button', { name: '撤回', exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '撤回', exact: true })).toBeDisabled()
  await expectStableFrame()
  await dialog.getByRole('tab', { name: /午盘/ }).click()
  await expect(amount).toHaveValue('17')
  await expect(ticket.getByRole('button', { name: '撤回', exact: true })).toBeEnabled()
  await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('90')
  await page.keyboard.press('End')
  await expect(dialog.getByRole('tab', { name: /晚盘/ })).toHaveAttribute('aria-selected', 'true')
  await expectStableFrame()
  await page.keyboard.press('Home')
  await expect(dialog.getByRole('tab', { name: /早盘/ })).toHaveAttribute('aria-selected', 'true')
  await expectStableFrame()
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await dialog.getByRole('tab', { name: /午盘/ }).click()
  await ticket.getByRole('button', { name: '撤回', exact: true }).click()
  await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('100')
  await expect(dialog.locator('[data-liangxiang-market-frozen]')).toHaveText('0')
  await expect(ticket.getByRole('button', { name: '撤回', exact: true })).toBeVisible()
  await expect(ticket.getByRole('button', { name: '撤回', exact: true })).toBeDisabled()
  await expectStableFrame()
})

test('tide uses smooth real anchors over the full day, leaves gaps and future open and retains candles', async ({ page }, testInfo) => {
  const data = candles().filter((_candle, index) => index < 240 || index >= 300)
  await page.route('**/liangxiang/api/market/candles?*', route => route.fulfill({ json: candlePage(route.request().url(), data) }))
  const dialog = await openMarket(page), chart = dialog.locator('[data-liangxiang-market-chart-mode]')
  await expect(chart).toHaveAttribute('data-liangxiang-market-chart-mode', 'candles')
  for (const key of ['open', 'high', 'low', 'close']) {
    await expect(chart.locator(`[data-liangxiang-market-quote="${key}"]`)).toBeVisible()
  }
  await expect.poll(() => chart.locator('[data-liangxiang-market-candle]').count()).toBeGreaterThan(0)
  const candleCount = await chart.locator('[data-liangxiang-market-candle]').count()
  expect(candleCount).toBeGreaterThan(0)
  expect(candleCount).toBeLessThan(data.length)
  await chart.getByRole('button', { name: '潮汐', exact: true }).click()
  await expect(chart).toHaveAttribute('data-liangxiang-market-chart-mode', 'tide')
  const segments = chart.locator('[data-liangxiang-market-tide-segment]')
  await expect(segments).toHaveCount(2)
  const geometry = await segments.evaluateAll(nodes => nodes.map(node => ({ path: node.getAttribute('d'), x: (node as SVGGraphicsElement).getBBox().x, width: (node as SVGGraphicsElement).getBBox().width })))
  expect(geometry[0]!.x + geometry[0]!.width).toBeLessThan(geometry[1]!.x)
  expect(geometry.every(segment => /C/.test(segment.path ?? '') && !/[HV]/.test(segment.path ?? ''))).toBe(true)
  const svg = chart.locator('svg').first()
  await expect(svg).toHaveAttribute('data-liangxiang-market-from', String(DAY))
  await expect(svg).toHaveAttribute('data-liangxiang-market-until', String(DAY + 24 * HOUR))
  const tickLabels = chart.locator('.liangxiang-market-time-tick text')
  await expect(tickLabels).toHaveText((await svg.boundingBox())!.width >= 500
    ? ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00']
    : ['00:00', '08:00', '16:00', '24:00'])
  const future = chart.locator('[data-liangxiang-market-future]')
  await expect(future).toContainText('待开梁')
  const futureX = Number(await future.locator('rect').getAttribute('x'))
  expect(geometry.every(segment => segment.x + segment.width <= futureX + .02)).toBe(true)
  await future.hover()
  await expect(chart.locator('[data-liangxiang-market-point-detail]')).toContainText('待开梁')
  const volume = chart.locator('[data-liangxiang-market-volume]')
  expect(await volume.count()).toBeGreaterThan(0)
  await volume.first().hover()
  await expect(chart.locator('[data-liangxiang-market-point-detail]')).toContainText('本段上香')
  await expect(chart.locator('.liangxiang-market-chart-readout')).toHaveCount(0)
  await expect(dialog.locator('.liangxiang-market-footer-metrics')).not.toContainText('上香')
  await expect(chart.locator('[data-liangxiang-market-point-detail]')).not.toContainText('全网')
  expect(await volume.evaluateAll(nodes => nodes.every(node => node.getAnimations().length === 0))).toBe(true)
  await expect(chart).not.toContainText('气泡 =')
  await chart.screenshot({ path: testInfo.outputPath('market-tide.png') })
  await chart.getByRole('button', { name: 'K 线', exact: true }).click()
  await expect(chart).toHaveAttribute('data-liangxiang-market-chart-mode', 'candles')
  await expect(chart.locator('[data-liangxiang-market-tide-segment]')).toHaveCount(0)
  await expect(chart.locator('[data-liangxiang-market-candle]')).toHaveCount(candleCount)
  await chart.getByRole('button', { name: '潮汐', exact: true }).click()
  await expect(segments).toHaveCount(2)
})


test('raised direction buttons depress and rebound without spending incense', async ({ page }, testInfo) => {
  const dialog = await openMarket(page)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await dialog.getByRole('switch', { name: '交易动画' }).click()
  const button = dialog.getByRole('button', { name: '↘ 做空' }), face = button.locator('.liangxiang-market-button-face')
  const rest = await face.evaluate(element => getComputedStyle(element).transform)
  const restY = await face.evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).m42)
  const bounds = (await button.boundingBox())!
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.mouse.down()
  await expect.poll(() => face.evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).m42)).toBeGreaterThan(restY)
  await dialog.screenshot({ path: testInfo.outputPath('market-button-pressed.png') })
  await page.mouse.up()
  await expect.poll(() => face.evaluate(element => getComputedStyle(element).transform)).toBe(rest)
  await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('90')
  await expect(dialog.locator('[data-liangxiang-market-frozen]')).toHaveText('10')
})


test('one market entry replaces the separate observed-bars entry without changing the wallet', async ({ page }) => {
  const market = await openMarket(page)
  await page.keyboard.press('Escape')
  const panel = await openPanel(page)
  const entry = panel.locator('[data-liangxiang-market-entry]')
  await expect(entry).toBeVisible()
  await expect(panel.locator('[data-liangxiang-utility-market]')).toHaveCount(0)
  await expect(entry.locator('[data-liangxiang-utility-icon="market"]')).toHaveAttribute('aria-hidden', 'true')
  await expect(panel.locator('[data-liangxiang-utility-action="bars"]')).toHaveCount(0)
  await panel.locator('[data-liangxiang-market-entry]').click()
  await expect(market).toBeVisible()
  await expect(page.getByRole('dialog', { name: '梁位走势', exact: true })).toHaveCount(0)
  await expect(market.locator('[data-liangxiang-market-available]')).toHaveText('90')
  await expect(market.locator('[data-liangxiang-market-frozen]')).toHaveText('10')
})

test('receipt and rules remain visible controls and use overlays without shifting the market', async ({ page }) => {
  const dialog = await openMarket(page)
  const bounds = (await dialog.boundingBox())!
  const speech = dialog.locator('.liangxiang-market-companion-speech')
  for (const [name, kind] of [['我的回执', 'history'], ['梁股玩法', 'rules']] as const) {
    const trigger = dialog.getByRole('button', { name, exact: true })
    await expect(trigger).toBeVisible()
    await trigger.click()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await expect(speech).toHaveAttribute('data-fish-action', kind === 'history' ? 'history' : 'rules')
    const popover = dialog.locator(`[data-liangxiang-market-popover="${kind}"]`)
    await expect(popover).toBeVisible()
    if (kind === 'rules') {
      await expect(popover.locator('.liangxiang-market-howto > li')).toHaveCount(3)
      await expect(popover.locator('.liangxiang-market-rule-times strong')).toHaveText(['12:00定梁', '17:00定梁', '22:00定梁'])
      await expect(popover.locator('.liangxiang-market-rule-example')).toContainText('投10')
      await expect(popover.locator('.liangxiang-market-rule-example')).toContainText('返还15')
      await expect(popover.locator('.liangxiang-market-rule-example')).toContainText('本金10＋赚5')
      await expect(popover).toContainText('收盘比照片高就赢')
      await expect(popover).toContainText('收盘比照片低就赢')
      await expect(popover).toContainText('冻结的香暂时不能上香')
      await expect(popover).toContainText('输了，这盘的投入就归对面啦')
      await expect(popover).toContainText('只有一边参加或本盘取消，原香退回')
    }
    const opened = (await dialog.boundingBox())!
    expect(Math.abs(opened.height - bounds.height)).toBeLessThanOrEqual(1)
    expect(Math.abs(opened.y - bounds.y)).toBeLessThanOrEqual(1)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    await expect(trigger).toBeFocused()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await trigger.click()
    await popover.getByRole('button', { name: kind === 'history' ? '关闭回执' : '关闭玩法', exact: true }).click()
    await expect(speech).toHaveAttribute('data-fish-action', 'dismiss')
    await expect(popover).toBeHidden()
  }
  await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('90')
  await expect(dialog.locator('[data-liangxiang-market-frozen]')).toHaveText('10')
})

test('receipt pages scroll inside the overlay, keep controls visible and reopen at the latest twenty', async ({ page }) => {
  const receipts: MarketReceipt[] = Array.from({ length: 100 }, (_, i) => {
    const n = 100 - i
    return { id: `receipt-${n}`, market_id: `receipt-market-${n}`,
      business_date: new Date(DAY - i * 86_400_000).toISOString().slice(0, 10), settled_at: DAY + n,
      invested_incense: n, returned_incense: n + 1, pnl_incense: 1, close_point: null,
      batches: [{ batch: 1, side: 'long', amount: n, payout: n + 1, result: 'long', reference: null }] }
  })
  let requests = 0
  await page.route('**/liangxiang/api/market/history?*', async route => {
    requests++
    const query = new URL(route.request().url()).searchParams
    expect(query.get('limit')).toBe('20')
    const before = Number(query.get('cursor') ?? 101)
    const remaining = receipts.filter(row => row.settled_at < DAY + before), rows = remaining.slice(0, 20)
    await route.fulfill({ json: { schema_version: 1, receipts: rows,
      next_cursor: remaining.length > rows.length ? String(rows.at(-1)!.settled_at - DAY) : null },
    headers: { 'x-liangxiang-cache-scope': 'browser-market-scope' } })
  })
  let dialog = await openMarket(page)
  const bounds = (await dialog.boundingBox())!
  const speech = dialog.locator('.liangxiang-market-companion-speech')
  await dialog.getByRole('button', { name: '我的回执', exact: true }).click()
  const popover = dialog.locator('[data-liangxiang-market-popover="history"]')
  const nav = popover.getByRole('navigation', { name: '回执分页' })
  for (let number = 1; number <= 5; number++) {
    await expect(nav).toContainText(`第${number}页`)
    await expect(popover.locator('details')).toHaveCount(20)
    await expect(popover.locator('summary').first()).toContainText(receipts[(number - 1) * 20]!.business_date)
    if (number === 1) {
      await popover.locator('summary').first().click()
      await expect(speech).toHaveAttribute('data-fish-action', 'receipt')
      await expect(popover.locator('details').first()).toHaveAttribute('open', '')
      await popover.locator('summary').first().click()
      await expect(popover.locator('details').first()).not.toHaveAttribute('open', '')
    }
    expect(await popover.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
    await popover.evaluate(element => { element.scrollTop = element.scrollHeight })
    const box = (await popover.boundingBox())!
    for (const button of [popover.getByRole('button', { name: '关闭回执' }), nav.getByRole('button', { name: '更早回执' })]) {
      const control = (await button.boundingBox())!
      expect(control.y).toBeGreaterThanOrEqual(box.y)
      expect(control.y + control.height).toBeLessThanOrEqual(box.y + box.height + 1)
    }
    if (number < 5) {
      await nav.getByRole('button', { name: '更早回执' }).click()
      await expect(speech).toHaveAttribute('data-fish-action', 'older')
      await expect.poll(() => popover.evaluate(element => element.scrollTop)).toBe(0)
    }
  }
  await expect(nav.getByRole('button', { name: '更早回执' })).toBeDisabled()
  for (let number = 4; number >= 1; number--) {
    await nav.getByRole('button', { name: '较新回执' }).click()
    await expect(speech).toHaveAttribute('data-fish-action', 'newer')
    await expect(nav).toContainText(`第${number}页`)
    await expect(popover.locator('summary').first()).toContainText(receipts[(number - 1) * 20]!.business_date)
  }
  await expect(nav.getByRole('button', { name: '较新回执' })).toBeDisabled()
  expect((await dialog.boundingBox())!.height).toBe(bounds.height)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('liangxiang.market.cache.v1')!).receipts.length)).toBe(30)
  const beforeReopen = requests
  await dialog.getByRole('button', { name: '关闭香火交易', exact: true }).click()
  dialog = await openMarket(page)
  await dialog.getByRole('button', { name: '我的回执', exact: true }).click()
  await expect(dialog.getByRole('navigation', { name: '回执分页' })).toContainText('第1页')
  await expect(dialog.locator('details')).toHaveCount(20)
  expect(requests).toBe(beforeReopen + 1)
})

test('a delayed position receipt preserves its submitted draft through older ordinary frames', async ({ page }) => {
  const attempts: MarketPositionRequest[] = []
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  const confirmed = fixture()
  confirmed.server_time += 1
  confirmed.wallet = { ...confirmed.wallet, available_incense: 77, frozen_incense: 23, version: 2 }
  confirmed.market!.batches[1] = { ...confirmed.market!.batches[1]!, long_incense: 20, short_incense: 43,
    position: { side: 'short', amount: 23, submitted_at: confirmed.server_time, payout: null } }
  await page.route('**/liangxiang/api/market/position', async route => {
    const intent = route.request().postDataJSON() as MarketPositionRequest
    attempts.push(intent)
    await held
    await route.fulfill({ json: { accepted: true, reason: null, request_id: intent.request_id, state: confirmed }, headers: { 'x-liangxiang-cache-scope': 'browser-market-scope' } })
  })
  try {
    const dialog = await openMarket(page), ticket = dialog.locator('[data-liangxiang-market-batch="2"]'), amount = ticket.getByRole('spinbutton')
    const short = ticket.getByRole('button', { name: '↘ 做空' })
    await short.click()
    await amount.fill('23')
    await ticket.getByRole('button', { name: '确认调整' }).click()
    await expect(amount).toBeDisabled()
    await expect(amount).toHaveValue('23')
    await expect(short).toHaveAttribute('aria-pressed', 'true')
    const ordinary = fixture(); ordinary.server_time += 1_000
    await page.evaluate(state => window.__liangxiangMarketFrame?.(state), ordinary)
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    await expect(amount).toHaveValue('23')
    await expect(short).toHaveAttribute('aria-pressed', 'true')
    await ticket.locator('form').evaluate(form => (form as HTMLFormElement).requestSubmit())
    await expect.poll(() => attempts.length).toBe(1)
    expect(attempts[0]).toMatchObject({ side: 'short', amount: 23 })
    await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('90')
    await expect(dialog.locator('[data-liangxiang-market-frozen]')).toHaveText('10')
    release()
    await expect(amount).toBeEnabled()
    await expect(amount).toHaveValue('23')
    await expect(short).toHaveAttribute('aria-pressed', 'true')
    await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('77')
    await expect(dialog.locator('[data-liangxiang-market-frozen]')).toHaveText('23')
    await expect(dialog.locator('.liangxiang-market-companion-speech')).toContainText('已确认空23炷')
    expect(attempts).toHaveLength(1)
  } finally { release() }
})

test('a delayed withdrawal keeps the visible draft until the authoritative refund arrives', async ({ page }) => {
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve }), attempts: MarketPositionRequest[] = []
  const refunded = fixture()
  refunded.server_time += 1
  refunded.wallet = { ...refunded.wallet, available_incense: 100, frozen_incense: 0, version: 2 }
  refunded.market!.batches[1] = { ...refunded.market!.batches[1]!, long_incense: 20, position: null }
  await page.route('**/liangxiang/api/market/position', async route => {
    const intent = route.request().postDataJSON() as MarketPositionRequest
    attempts.push(intent)
    await held
    await route.fulfill({ json: { accepted: true, reason: null, request_id: intent.request_id, state: refunded }, headers: { 'x-liangxiang-cache-scope': 'browser-market-scope' } })
  })
  try {
    const dialog = await openMarket(page), ticket = dialog.locator('[data-liangxiang-market-batch="2"]'), amount = ticket.getByRole('spinbutton')
    const short = ticket.getByRole('button', { name: '↘ 做空' })
    await short.click()
    await amount.fill('23')
    await ticket.getByRole('button', { name: '撤回', exact: true }).click()
    await expect(amount).toBeDisabled()
    await expect(amount).toHaveValue('23')
    await expect(short).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => attempts.length).toBe(1)
    expect(attempts[0]).toMatchObject({ side: null, amount: 0 })
    await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('90')
    release()
    await expect(amount).toBeEnabled()
    await expect(amount).toHaveValue('5')
    await expect(ticket.getByRole('button', { name: '↗ 做多' })).toHaveAttribute('aria-pressed', 'true')
    await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('100')
    await expect(dialog.locator('[data-liangxiang-market-frozen]')).toHaveText('0')
  } finally { release() }
})

test('an uncertain position retries its durable intent and applies the returned wallet once', async ({ page }) => {
  const attempts: MarketPositionRequest[] = []
  const confirmed = fixture()
  confirmed.server_time += 1
  confirmed.wallet = { ...confirmed.wallet, available_incense: 80, frozen_incense: 20, version: 2 }
  confirmed.market!.batches[1] = { ...confirmed.market!.batches[1]!, long_incense: 20, short_incense: 40,
    position: { side: 'short', amount: 20, submitted_at: confirmed.server_time, payout: null } }
  // Emulate a committed response lost in transit; the real backend's transaction
  // and idempotency are covered separately, while this proves the installed UI retries its ID.
  await page.route('**/liangxiang/api/market/position', async route => {
    attempts.push(route.request().postDataJSON() as MarketPositionRequest)
    if (attempts.length === 1) { await route.abort('connectionfailed'); return }
    await route.fulfill({ json: { accepted: true, reason: null, request_id: attempts[0]!.request_id, state: confirmed }, headers: { 'x-liangxiang-cache-scope': 'browser-market-scope' } })
  })
  const dialog = await openMarket(page), ticket = dialog.locator('[data-liangxiang-market-batch="2"]')
  await ticket.getByRole('button', { name: '↘ 做空' }).click()
  await ticket.getByRole('spinbutton').fill('20')
  await ticket.getByRole('button', { name: '确认调整' }).click()
  const retry = dialog.getByRole('button', { name: '核对上一笔', exact: true })
  await expect(retry).toBeVisible()
  await expect(ticket.getByRole('spinbutton')).toBeDisabled()
  await expect(ticket.getByRole('spinbutton')).toHaveValue('20')
  await expect(ticket.getByRole('button', { name: '↘ 做空' })).toHaveAttribute('aria-pressed', 'true')
  await expect(ticket.getByRole('button', { name: '撤回', exact: true })).toBeDisabled()
  await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('90')
  expect(attempts).toHaveLength(1)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('liangxiang.market.pending.v1') ?? 'null')?.intent)).toEqual(attempts[0])
  const ordinary = fixture(); ordinary.server_time += 1_000
  await page.evaluate(state => window.__liangxiangMarketFrame?.(state), ordinary)
  await expect(ticket.getByRole('spinbutton')).toHaveValue('20')
  await expect(ticket.getByRole('button', { name: '↘ 做空' })).toHaveAttribute('aria-pressed', 'true')
  await retry.click()
  await expect(dialog.locator('.liangxiang-market-companion-speech')).toHaveAttribute('data-fish-action', 'retry')
  await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('80')
  await expect(dialog.locator('[data-liangxiang-market-frozen]')).toHaveText('20')
  expect(attempts).toHaveLength(2)
  expect(attempts[1]).toEqual(attempts[0])
  await expect(retry).toHaveCount(0)
  await expect(ticket.getByRole('spinbutton')).toHaveValue('20')
  await expect(ticket.getByRole('spinbutton')).toBeEnabled()
  expect(await page.evaluate(() => localStorage.getItem('liangxiang.market.pending.v1'))).toBeNull()
  await page.evaluate(state => window.__liangxiangMarketFrame?.(state), confirmed)
  await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('80')
  await expect(dialog.locator('[data-liangxiang-market-frozen]')).toHaveText('20')
})

test('the fish and clickable footer facts report server values and real pool proportions without spending', async ({ page }) => {
  await page.clock.install()
  let positionRequests = 0
  page.on('request', request => { if (new URL(request.url()).pathname === '/liangxiang/api/market/position') positionRequests++ })
  const dialog = await openMarket(page)
  const fish = dialog.getByRole('button', { name: '大肥鱼：播报本盘香池与时间', exact: true })
  const speech = dialog.locator('.liangxiang-market-companion-speech')
  await fish.click()
  await expect(speech).toHaveAttribute('data-fish-action', 'report')
  await expect(speech).toContainText('16:00封盘')
  await expect(speech).toContainText('香池50炷 · 多30 / 空20')
  const pool = dialog.locator('[data-liangxiang-market-pool]')
  await pool.click()
  await expect(speech).toHaveAttribute('data-fish-action', 'pool')
  for (const fact of ['午盘香池50炷', '多30炷', '60%', '空20炷', '40%']) await expect(speech).toContainText(fact)
  await expect(speech).not.toContainText(/NaN|Infinity/)
  await dialog.locator('.liangxiang-market-position').click()
  await expect(speech).toHaveAttribute('data-fish-action', 'position')
  await expect(speech).toContainText('55.000000%')
  await expect(speech).toContainText('夯55 / 拉45')
  // This isolated market fixture has no matching Host case policy. Exact
  // counts remain readable; it must not invent a tier from another case.
  await expect(speech).not.toContainText('梁总')
  await page.clock.runFor(61_000)
  await expect(speech).toHaveAttribute('data-fish-action', 'periodic')
  await expect(speech).toContainText('余2时59分')
  await expect(speech).toContainText('香池50炷 · 多30 / 空20')
  await dialog.getByRole('tab', { name: /晚盘/ }).click()
  await expect(speech).toHaveAttribute('data-fish-action', 'batch3')
  await expect(speech).toContainText('17:00开放 · 22:00定梁')
  await expect(speech).toContainText('香池0炷 · 多0 / 空0')
  await pool.click()
  await expect(speech).toHaveAttribute('data-fish-action', 'pool')
  await expect(speech).toContainText('晚盘香池0炷')
  await expect(speech).toContainText('还没有投入')
  await expect(speech).not.toContainText(/%|NaN|Infinity/)
  await fish.click()
  await expect(speech).toHaveAttribute('data-fish-action', 'report')
  await expect(speech).toContainText('22:00定梁')
  expect(positionRequests).toBe(0)
  await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('90')
  await expect(dialog.locator('[data-liangxiang-market-frozen]')).toHaveText('10')
})

test('first loading swims two loops, keeps one fish and returns without blocking the ready market', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  let release!: () => void
  const response = new Promise<void>(resolve => { release = resolve })
  await page.route('**/liangxiang/api/market', async route => {
    await response
    await route.fulfill({ json: fixture(), headers: { 'x-liangxiang-cache-scope': 'browser-market-scope' } })
  })
  const panel = await openPanel(page)
  await panel.locator('[data-liangxiang-market-entry]').click()
  const dialog = page.getByRole('dialog', { name: '梁股 · 香火市场', exact: true })
  const companion = dialog.locator('.liangxiang-market-companion')
  const sprite = companion.locator('[data-liangxiang-market-main-whale]')
  try {
    await expect(companion).toHaveAttribute('data-loading-phase', 'fishing')
    await expect(dialog).toContainText('大肥鱼捕捞中')
    const original = await sprite.elementHandle()
    const height = (await dialog.boundingBox())!.height
    expect(await sprite.evaluate(element => element.getAnimations().some(animation => (animation.effect as KeyframeEffect).getKeyframes().length >= 18))).toBe(true)
    release()
    await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('90')
    await expect(dialog.getByRole('button', { name: '确认调整', exact: true })).toBeEnabled()
    await expect(companion).toHaveAttribute('data-loading-phase', 'idle')
    expect(await original!.evaluate(element => element.isConnected)).toBe(true)
    await expect(sprite).toHaveCount(1)
    expect((await dialog.boundingBox())!.height).toBeCloseTo(height, 0)
    const header = (await dialog.locator('.liangxiang-market-header').boundingBox())!, home = (await sprite.boundingBox())!
    expect(home.y).toBeGreaterThanOrEqual(header.y)
    expect(home.y).toBeLessThan(header.y + header.height)
    await page.evaluate(state => window.__liangxiangMarketFrame?.({ ...state, server_time: state.server_time + 1 }), fixture())
    await expect(companion).toHaveAttribute('data-loading-phase', 'idle')
    await dialog.getByRole('button', { name: '关闭香火交易', exact: true }).click()
      await panel.locator('[data-liangxiang-market-entry]').click()
    await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('90')
    await expect(companion).toHaveAttribute('data-loading-phase', 'idle')
    expect(await sprite.evaluate(element => element.getAnimations().length)).toBe(0)
  } finally { release() }
})

test('loading failure or reduced motion cancels fishing and keeps retry available', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  let fail!: () => void
  const response = new Promise<void>(resolve => { fail = resolve })
  await page.route('**/liangxiang/api/market', async route => {
    await response
    await route.fulfill({ status: 503, json: { error: 'unavailable' } })
  })
  const panel = await openPanel(page)
  await panel.locator('[data-liangxiang-market-entry]').click()
  const dialog = page.getByRole('dialog', { name: '梁股 · 香火市场', exact: true })
  const companion = dialog.locator('.liangxiang-market-companion')
  try {
    await expect(companion).toHaveAttribute('data-loading-phase', 'fishing')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(companion).toHaveAttribute('data-loading-phase', 'waiting')
    expect(await companion.locator('svg').evaluate(element => element.getAnimations().length)).toBe(0)
    fail()
    await expect(dialog.getByRole('button', { name: '重新连接', exact: true })).toBeVisible()
    await expect(companion).toHaveAttribute('data-loading-phase', 'idle')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await expect(companion).toHaveAttribute('data-loading-phase', 'idle')
    expect(await companion.locator('[data-liangxiang-market-main-whale]').evaluate(element => element.getAnimations().length)).toBe(0)
  } finally { fail() }
})

test('fish click emits bounded live-fact lines without spending and static mode clears them', async ({ page }) => {
  await page.clock.install()
  const dialog = await openMarket(page)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await dialog.getByRole('switch', { name: '交易动画' }).click()
  const fish = dialog.getByRole('button', { name: '大肥鱼：播报本盘香池与时间', exact: true })
  const lines = dialog.locator('[data-liangxiang-market-danmaku]')
  let writes = 0
  page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/market/position')) writes++ })
  await fish.click()
  await expect(lines).toHaveCount(3)
  const captured = await lines.allTextContents()
  const sprite = (await dialog.locator('[data-liangxiang-market-main-whale]').boundingBox())!
  for (const line of await lines.all()) {
    const bounds = (await line.boundingBox())!
    expect(bounds.x).toBeGreaterThanOrEqual(sprite.x + sprite.width)
  }
  expect(captured.join(' ')).toMatch(/梁位55\.000000%|午盘香池50炷|本盘多10炷|可用90炷/)
  const next = fixture()
  next.wallet = { ...next.wallet, available_incense: 80, frozen_incense: 20, version: 2 }
  next.server_time += 1_000
  next.market!.batches[1]!.position = { side: 'short', amount: 20, submitted_at: next.server_time, payout: null }
  next.market!.batches[1]!.long_incense = 20; next.market!.batches[1]!.short_incense = 40
  await page.evaluate(state => window.__liangxiangMarketFrame?.(state), next)
  await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('80')
  expect(await lines.allTextContents()).toEqual(captured)
  const fresh: string[] = []
  for (let i = 0; i < 4; i++) {
    const previous = await lines.allTextContents()
    await fish.click()
    await expect.poll(() => lines.allTextContents()).not.toEqual(previous)
    fresh.push(...await lines.allTextContents())
  }
  expect(fresh.join(' ')).toContain('本盘空20炷')
  expect(fresh.join(' ')).toContain('可用80炷，冻结20炷')
  expect(fresh.join(' ')).not.toContain('可用90炷')
  await page.clock.runFor(6_000)
  await expect(dialog.locator('.liangxiang-market-companion-speech')).toHaveAttribute('data-fish-action', 'idle')
  await expect(lines).toHaveCount(1)
  await fish.click()
  await expect(lines).toHaveCount(3)
  await dialog.getByRole('switch', { name: '交易动画' }).click()
  await fish.click()
  await expect(dialog.locator('.liangxiang-market-companion-speech')).toHaveCount(1)
  await expect(dialog.locator('.liangxiang-market-companion-speech')).toHaveAttribute('data-fish-action', 'report')
  await expect(lines).toHaveCount(2)
  await expect(dialog.locator('.liangxiang-market-companion-speech')).toContainText('香池60炷')
  expect(await lines.evaluateAll(nodes => nodes.every(node => node.getAnimations().length === 0))).toBe(true)
  expect(writes).toBe(0)
  await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('80')
})

async function recordMarketTones(page: Parameters<typeof openPanel>[0]): Promise<void> {
  await page.evaluate(() => {
    window.__liangxiangMarketTones = []
    const parameter = { setValueAtTime() {}, exponentialRampToValueAtTime() {} }
    class AudioContextProbe {
      state = 'running'; currentTime = 0; destination = {}
      resume() { return Promise.resolve() }
      createGain() { return { gain: parameter, connect() {} } }
      createOscillator() {
        let frequency = 0
        return { type: 'sine', frequency: { setValueAtTime(value: number) { frequency = value }, exponentialRampToValueAtTime() {} },
          connect() {}, start() { window.__liangxiangMarketTones!.push(frequency) }, stop() {} }
      }
    }
    window.AudioContext = AudioContextProbe as unknown as typeof AudioContext
  })
}

test('market audio follows accepted position changes once, including uncertain retry, while no-ops and failures stay silent', async ({ page }) => {
  await recordMarketTones(page)
  let dialog = await openMarket(page)
  const tones = () => page.evaluate(() => window.__liangxiangMarketTones ?? [])
  let ticket = dialog.locator('[data-liangxiang-market-batch="2"]')
  await ticket.getByRole('button', { name: '确认调整', exact: true }).click()
  await expect(ticket.getByRole('button', { name: '确认调整', exact: true })).toBeEnabled()
  await page.waitForTimeout(300)
  expect(await tones()).toEqual([])
  await ticket.getByRole('spinbutton').fill('20')
  await ticket.getByRole('button', { name: '确认调整', exact: true }).click()
  await expect.poll(tones).toEqual([660, 990])
  const held = await page.evaluate(() => fetch('/liangxiang/api/market').then(response => response.json())) as MarketState
  await page.route('**/liangxiang/api/market/position', route => route.fulfill({ json: {
    accepted: false, reason: 'closed', request_id: (route.request().postDataJSON() as MarketPositionRequest).request_id, state: held,
  }, headers: { 'x-liangxiang-cache-scope': 'browser-market-scope' } }), { times: 1 })
  await ticket.getByRole('button', { name: '↘ 做空', exact: true }).click()
  await ticket.getByRole('button', { name: '确认调整', exact: true }).click()
  await expect(dialog).toContainText('本盘已封盘，原仓位保持不变。')
  await page.waitForTimeout(300)
  expect(await tones()).toEqual([660, 990])
  await expect(dialog.locator('.liangxiang-market-status')).toHaveCSS('pointer-events', 'none')
  await ticket.getByRole('button', { name: '撤回', exact: true }).click()
  await expect.poll(tones).toEqual([660, 990, 880, 587])
  const refunded = await page.evaluate(() => fetch('/liangxiang/api/market').then(response => response.json())) as MarketState
  let first = true
  const ids: string[] = []
  const accepted = structuredClone(refunded)
  accepted.server_time++
  accepted.wallet = { ...accepted.wallet, available_incense: 95, frozen_incense: 5, total_incense: 100, version: accepted.wallet.version + 1 }
  accepted.market!.batches[1]!.position = { side: 'long', amount: 5, submitted_at: accepted.server_time, payout: null }
  await page.route('**/liangxiang/api/market/position', async route => {
    const intent = route.request().postDataJSON() as MarketPositionRequest
    ids.push(intent.request_id)
    if (first) { first = false; await route.abort('failed'); return }
    await route.fulfill({ json: { accepted: true, reason: null, request_id: intent.request_id, state: accepted }, headers: { 'x-liangxiang-cache-scope': 'browser-market-scope' } })
  })
  await ticket.getByRole('button', { name: '↗ 做多', exact: true }).click()
  await ticket.getByRole('spinbutton').fill('5')
  await ticket.getByRole('button', { name: '确认投入', exact: true }).click()
  await expect(dialog.getByRole('button', { name: '核对上一笔', exact: true })).toBeVisible()
  expect(await tones()).toHaveLength(4)
  await expect(dialog.getByRole('button', { name: '核对上一笔', exact: true })).toHaveCSS('pointer-events', 'auto')
  await dialog.getByRole('button', { name: '核对上一笔', exact: true }).click()
  await expect.poll(tones).toEqual([660, 990, 880, 587, 660, 990])
  expect(ids).toHaveLength(2)
  expect(ids[0]).toBe(ids[1])
  await page.evaluate(state => window.__liangxiangMarketFrame?.(state), accepted)
  await dialog.getByRole('button', { name: '关闭香火交易', exact: true }).click()
  await page.locator('[data-liangxiang-market-entry]').click()
  dialog = page.getByRole('dialog', { name: '梁股 · 香火市场', exact: true })
  await expect(dialog).toBeVisible()
  await page.waitForTimeout(300)
  expect(await tones()).toHaveLength(6)
  ticket = dialog.locator('[data-liangxiang-market-batch="2"]')
  await expect(ticket.getByRole('button', { name: '确认投入', exact: true })).toBeEnabled()
})

test('market settlement audio needs a newly confirmed positive receipt and never replays history or zero returns', async ({ page }) => {
  await recordMarketTones(page)
  let current = fixture()
  const old: MarketReceipt = { id: 'older-paid', market_id: 'older-market', business_date: '2026-11-05', settled_at: DAY,
    invested_incense: 10, returned_incense: 15, pnl_incense: 5, close_point: null,
    batches: [{ batch: 2, side: 'long', amount: 10, payout: 15, result: 'long', reference: null }] }
  let receipts = [old]
  await page.route('**/liangxiang/api/market', route => route.fulfill({ json: current, headers: { 'x-liangxiang-cache-scope': 'browser-market-scope' } }))
  await page.route('**/liangxiang/api/market/history?*', route => route.fulfill({ json: { schema_version: 1, receipts, next_cursor: null }, headers: { 'x-liangxiang-cache-scope': 'browser-market-scope' } }))
  let dialog = await openMarket(page)
  const tones = () => page.evaluate(() => window.__liangxiangMarketTones ?? [])
  await dialog.getByRole('button', { name: '我的回执', exact: true }).click()
  await expect(dialog.locator('[data-liangxiang-market-popover="history"] details')).toHaveCount(1)
  await dialog.getByRole('button', { name: '关闭回执', exact: true }).click()
  await page.waitForTimeout(300)
  expect(await tones()).toEqual([])
  const gift = structuredClone(current)
  gift.server_time++
  gift.wallet = { ...gift.wallet, available_incense: 190, total_incense: 200, version: 2 }
  await page.evaluate(state => window.__liangxiangMarketFrame?.(state), gift)
  await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('190')
  expect(await tones()).toEqual([])
  current = structuredClone(gift)
  current.market!.status = 'closed'
  current.market!.close_point = current.current_point
  current.server_time = DAY + 24 * HOUR
  current.wallet = { ...current.wallet, available_incense: 205, frozen_incense: 0, total_incense: 205, version: 3 }
  const paid = { ...old, id: 'fresh-paid', market_id: current.market!.id, business_date: '2026-11-06', settled_at: current.server_time }
  receipts = [paid, old]
  await page.evaluate(state => window.__liangxiangMarketFrame?.(state), current)
  await expect.poll(tones).toEqual([523, 659, 784])
  await page.evaluate(state => window.__liangxiangMarketFrame?.(state), { ...current, server_time: current.server_time + 1 })
  await dialog.getByRole('button', { name: '我的回执', exact: true }).click()
  await expect(dialog.locator('[data-liangxiang-market-popover="history"] details')).toHaveCount(2)
  await dialog.getByRole('button', { name: '关闭香火交易', exact: true }).click()
  await page.locator('[data-liangxiang-market-entry]').click()
  dialog = page.getByRole('dialog', { name: '梁股 · 香火市场', exact: true })
  await expect(dialog).toBeVisible()
  await page.waitForTimeout(300)
  expect(await tones()).toEqual([523, 659, 784])
  current = { ...current, server_time: current.server_time + 2, market: { ...current.market!, id: 'losing-market', status: 'open' }, wallet: { ...current.wallet, version: 4 } }
  await page.evaluate(state => window.__liangxiangMarketFrame?.(state), current)
  await expect(dialog.getByRole('button', { name: '我的回执', exact: true })).toBeVisible()
  current = { ...current, server_time: current.server_time + 1, market: { ...current.market!, status: 'closed' }, wallet: { ...current.wallet, version: 5 } }
  receipts = [{ ...paid, id: 'fresh-zero', market_id: 'losing-market', returned_incense: 0, pnl_incense: -10,
    batches: [{ ...paid.batches[0]!, payout: 0, result: 'short' }] }, paid, old]
  await page.evaluate(state => window.__liangxiangMarketFrame?.(state), current)
  await dialog.getByRole('button', { name: '我的回执', exact: true }).click()
  await expect(dialog.locator('[data-liangxiang-market-popover="history"] details')).toHaveCount(3)
  await page.waitForTimeout(450)
  expect(await tones()).toEqual([523, 659, 784])
})
