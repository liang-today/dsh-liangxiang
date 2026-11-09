import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { LiangxiangWireState } from '../../src/shared/wire.ts'
import { bootInstalledLiangxiang, openPanel } from './helpers.ts'

declare global {
  interface Window { __liangxiangActivityFrame?: (wire: LiangxiangWireState) => void }
}

test.beforeEach(async ({ page }) => {
  // UI-only mock channel inside this disposable browser. The actual packed
  // Host still supplies the initial state; no test identity or usage is sent
  // to the community and no mock route ships in the plugin.
  await page.addInitScript(() => {
    const sources = new Set<{ onmessage: ((event: MessageEvent) => void) | null }>()
    const Native = window.EventSource
    window.EventSource = new Proxy(Native, {
      construct(target, args) {
        if (new URL(String(args[0]), location.href).pathname !== '/liangxiang/api/events') return Reflect.construct(target, args)
        const source = { onmessage: null as ((event: MessageEvent) => void) | null, onerror: null,
          close() { sources.delete(source) } }
        sources.add(source)
        return source
      },
    })
    window.__liangxiangActivityFrame = wire => {
      for (const source of sources) source.onmessage?.(new MessageEvent('message', { data: JSON.stringify(wire) }))
    }
  })
  await bootInstalledLiangxiang(page)
})

test('live activity stays non-numeric, reduced motion stays static, and final settlement ends it', async ({ page }, testInfo) => {
  const wire = await (await page.request.get('/liangxiang/api/state')).json() as LiangxiangWireState
  expect(wire.streamingActive).toBe(false) // real packed Host wiring
  const panel = await openPanel(page)
  // Two recent finalized samples would have triggered the old rate forecast.
  const confirmed = { ...wire, revision: wire.revision + 1000,
    personal: { ...wire.personal, effectiveTokensToday: wire.personal.effectiveTokensToday + 3000 } }
  await page.evaluate(state => window.__liangxiangActivityFrame?.(state), {
    ...confirmed, revision: confirmed.revision - 1,
    personal: { ...confirmed.personal, effectiveTokensToday: wire.personal.effectiveTokensToday + 1000 },
  })
  await page.evaluate(state => window.__liangxiangActivityFrame?.(state), confirmed)
  const exactNext = wire.personal.tokenPerIncense - confirmed.personal.effectiveTokensToday % wire.personal.tokenPerIncense
  await expect(panel.locator('[data-liangxiang-personal="next-incense"]')).toHaveAttribute('aria-label', `下一炷 ${exactNext.toLocaleString('zh-CN')} 当量`)
  expect(await panel.locator('[data-liangxiang-compact="next-incense"]').getAttribute('title')).toBeNull()
  const figures = panel.locator('[data-liangxiang-compact]')
  const before = await figures.allTextContents()
  const remaining = await panel.locator('[data-liangxiang-ring]').getAttribute('data-remaining')
  const position = await panel.locator('[data-liangxiang-liang-position-value]').textContent()
  const active = { ...confirmed, revision: confirmed.revision + 1, streamingActive: true }
  await page.evaluate(state => window.__liangxiangActivityFrame?.(state), active)
  await expect(panel.locator('[data-liangxiang-stream-status]')).toHaveCount(0)
  await expect(panel.locator('[data-caption-label]')).toHaveText('今日凝香')
  const activity = panel.locator('[data-liangxiang-stream-activity]')
  const plantBubbles = panel.locator('[data-liangxiang-stream-bubble]')
  await expect(activity).toHaveCount(1)
  expect(await plantBubbles.evaluateAll(nodes => nodes.every(node => (node as HTMLElement).hidden))).toBe(true)
  await expect(panel.locator('[data-liangxiang-stream-wisp]')).toHaveCount(0)
  expect(await activity.evaluateAll(nodes => nodes.every(node => node.getAnimations().length === 0))).toBe(true)
  await page.waitForTimeout(1200) // prove a running request does not predict numbers
  expect(await figures.allTextContents()).toEqual(before)
  await expect(panel.locator('[data-liangxiang-ring]')).toHaveAttribute('data-remaining', remaining!)
  await expect(panel.locator('[data-liangxiang-liang-position-value]')).toHaveText(position!)
  await panel.screenshot({ path: testInfo.outputPath('streaming-reduced-motion.png') })
  const axe = await new AxeBuilder({ page }).include('[data-liangxiang-panel]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(axe.violations).toEqual([])

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect.poll(() => activity.evaluateAll(nodes => nodes.every(node => node.getAnimations().length === 1))).toBe(true)
  const glow = panel.locator('[data-liangxiang-stream-activity]')
  if (Number(remaining) >= 10) await expect.poll(() => panel.locator('[data-liangxiang-stream-bubble]:not([hidden])').count()).toBeGreaterThan(0)
  const opacity = await glow.evaluate(node => getComputedStyle(node).opacity)
  await expect.poll(() => glow.evaluate(node => getComputedStyle(node).opacity)).not.toBe(opacity)
  expect(await figures.allTextContents()).toEqual(before)
  await panel.screenshot({ path: testInfo.outputPath('streaming-active.png') })

  // Only the finalized frame updates the spendable stock. The mock final
  // receipt is cosmetic to this page and never writes the real Host ledger.
  await page.evaluate(state => window.__liangxiangActivityFrame?.(state), {
    ...active, revision: active.revision + 1, streamingActive: false,
    personal: { ...wire.personal, effectiveTokensToday: confirmed.personal.effectiveTokensToday + 2 * wire.personal.tokenPerIncense,
      remainingIncense: wire.personal.remainingIncense + 2 },
  })
  await expect(panel.locator('[data-liangxiang-stream-activity]')).toHaveCount(0)
  await expect(panel.locator('[data-liangxiang-stream-ripple]')).toHaveCount(0)
  await expect(panel.locator('[data-liangxiang-stream-status]')).toHaveCount(0)
  await expect(panel.locator('[data-liangxiang-ring]')).toHaveAttribute('data-remaining', String(wire.personal.remainingIncense + 2))
  await expect(panel.locator('[data-caption-label]')).toHaveText('凝香到账')
  await expect(panel.locator('[data-caption-amount]')).toHaveText('+2')
})

test('plant bubbles fit actual shallow water, follow its surface and do not restart a whale visit', async ({ page }) => {
  const wire = await (await page.request.get('/liangxiang/api/state')).json() as LiangxiangWireState
  const panel = await openPanel(page), pond = panel.locator('[data-liangxiang-main-pond]')
  let revision = wire.revision + 10_000
  const emit = async (stock: number, streamingActive = true) => {
    await page.evaluate(state => window.__liangxiangActivityFrame?.(state), {
      ...wire, revision: ++revision, streamingActive,
      personal: { ...wire.personal, remainingIncense: stock,
        wallet: { available_incense: stock, frozen_incense: 0, total_incense: stock,
          token_remainder: wire.personal.effectiveTokensToday % wire.personal.tokenPerIncense,
          token_per_incense: wire.personal.tokenPerIncense, version: revision } },
    })
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const bubbles = pond.locator('[data-liangxiang-stream-bubble]')
  const rising = pond.locator('[data-liangxiang-stream-bubble][data-stage=rise]:not([hidden])')
  for (const stock of [0, 1]) {
    await emit(stock)
    await expect(panel.locator('[data-liangxiang-stream-activity]')).toHaveCount(1)
    expect(await bubbles.evaluateAll(nodes => nodes.every(node => (node as HTMLElement).hidden))).toBe(true)
  }
  for (const stock of [10, 1_000]) {
    await emit(stock)
    await expect(rising.first()).toBeVisible({ timeout: 6_000 })
    const birth = await rising.first().evaluate(node => ({
      y: Number((node as HTMLElement).dataset.birthY), water: Number((node as HTMLElement).dataset.surfaceY),
      size: parseFloat(getComputedStyle(node).width),
      bottom: node.closest('[data-liangxiang-main-pond]')!.querySelector('[data-liangxiang-main-pond-water]')!.getBoundingClientRect().bottom
        - node.closest('[data-liangxiang-main-pond]')!.getBoundingClientRect().top,
    }))
    expect(birth.y).toBeGreaterThan(birth.water)
    expect(birth.y + birth.size / 2).toBeLessThanOrEqual(birth.bottom)
    expect(birth.size).toBeLessThanOrEqual(8)
    if (stock === 10) expect(birth.size).toBeLessThan(8)
    await expect(pond.locator('[data-liangxiang-stream-bubble][data-stage=pop]:not([hidden])').first()).toBeVisible({ timeout: 2_000 })
  }
  await page.clock.install()
  await page.clock.fastForward(10_001)
  await expect(pond).toHaveAttribute('data-fish', 'true')
  const fish = pond.locator('.liangxiang-main-pond-fish')
  const start = await fish.evaluate(node => node.getAnimations()[0]!.startTime)
  await emit(1_000, false)
  expect(await bubbles.evaluateAll(nodes => nodes.every(node => (node as HTMLElement).hidden))).toBe(true)
  await emit(1_000)
  await expect(pond).toHaveAttribute('data-fish', 'true')
  expect(await fish.evaluate(node => node.getAnimations()[0]!.startTime)).toEqual(start)
  await pond.evaluate(node => { node.style.transform = 'translateX(200vw)' })
  await expect(pond).toHaveAttribute('data-available', 'false')
  expect(await bubbles.evaluateAll(nodes => nodes.every(node => (node as HTMLElement).hidden))).toBe(true)
  await pond.evaluate(node => { node.style.transform = '' })
  await expect(pond).toHaveAttribute('data-available', 'true')
  await emit(0)
  await expect(panel.locator('[data-liangxiang-stream-activity]')).toHaveCount(1)
  const detached = await pond.elementHandle()
  await panel.getByRole('button', { name: '关闭面板', exact: true }).click()
  expect(await detached!.evaluate(node => ({ connected: node.isConnected, animations: node.getAnimations({ subtree: true }).length })))
    .toEqual({ connected: false, animations: 0 })
})

test('a confirmed vote frame reveals personal balance without a transaction or an earning animation', async ({ page }) => {
  const wire = await (await page.request.get('/liangxiang/api/state')).json() as LiangxiangWireState
  const panel = await openPanel(page), mutations: string[] = []
  page.on('request', request => { if (request.method() !== 'GET') mutations.push(request.url()) })
  await expect(panel.locator('[data-caption-label]')).toHaveText('今日凝香')
  const remaining = wire.personal.remainingIncense - 1
  await page.evaluate(state => window.__liangxiangActivityFrame?.(state), {
    ...wire, revision: wire.revision + 10_000,
    personal: { ...wire.personal, usedIncenseToday: wire.personal.usedIncenseToday + 1, remainingIncense: remaining,
      ...(wire.personal.wallet ? { wallet: { ...wire.personal.wallet, available_incense: remaining,
        total_incense: wire.personal.wallet.total_incense - 1, version: wire.personal.wallet.version + 1 } } : {}) },
  })
  await expect(panel.locator('[data-caption-label]')).toHaveText('个人余香')
  await expect(panel.locator('[data-caption-amount]')).toHaveText(String(remaining))
  await expect(panel.locator('[data-liangxiang-ring]')).toHaveAttribute('data-remaining', String(remaining))
  await expect(panel.locator('[data-caption-label]')).toHaveText('今日凝香', { timeout: 4_000 })
  expect(mutations).toEqual([])
})
