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
  const activity = panel.locator('[data-liangxiang-stream-activity], [data-liangxiang-stream-ripple]')
  await expect(activity).toHaveCount(Number(remaining) > 0 ? 3 : 1)
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

test('activity follows shallow and full water, pauses offscreen, and never restarts a fish visit', async ({ page }) => {
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
  const ripples = panel.locator('[data-liangxiang-stream-ripple]')
  for (const stock of [25, 1_000]) {
    await emit(stock)
    await expect(ripples).toHaveCount(2)
    const drop = 128 * (1 - Math.sqrt(stock / 1_000))
    // Both decorations live inside the same tide transform as the genuine
    // water line, rather than floating at an independent fixed ring height.
    await expect.poll(() => ripples.first().evaluate(node => {
      const tide = node.closest('.liangxiang-main-pond-tide')!
      const gleam = tide.querySelector('.liangxiang-main-pond-gleam')!
      return gleam.closest('.liangxiang-main-pond-tide') === tide
        ? new DOMMatrixReadOnly(getComputedStyle(tide).transform).f : -1
    })).toBeCloseTo(drop, 1)
  }
  await page.clock.install()
  await page.clock.fastForward(10_001)
  await expect(pond).toHaveAttribute('data-fish', 'true')
  const fish = pond.locator('.liangxiang-main-pond-fish')
  const start = await fish.evaluate(node => node.getAnimations()[0]!.startTime)
  await emit(1_000, false)
  await expect(ripples).toHaveCount(0)
  await emit(1_000)
  await expect(ripples).toHaveCount(2)
  await expect(pond).toHaveAttribute('data-fish', 'true')
  expect(await fish.evaluate(node => node.getAnimations()[0]!.startTime)).toEqual(start)

  await pond.evaluate(node => { node.style.transform = 'translateX(200vw)' })
  await expect(pond).toHaveAttribute('data-available', 'false')
  const activity = panel.locator('[data-liangxiang-stream-activity], [data-liangxiang-stream-ripple]')
  expect(await activity.evaluateAll(nodes => nodes.every(node => node.getAnimations().every(animation => animation.playState === 'paused')))).toBe(true)
  await pond.evaluate(node => { node.style.transform = '' })
  await expect(pond).toHaveAttribute('data-available', 'true')
  await expect.poll(() => activity.evaluateAll(nodes => nodes.every(node => node.getAnimations().every(animation => animation.playState === 'running')))).toBe(true)
  await emit(0)
  await expect(ripples).toHaveCount(0)
  await expect(panel.locator('[data-liangxiang-stream-activity]')).toHaveCount(1)
  const detached = await panel.locator('[data-liangxiang-stream-activity]').elementHandle()
  await panel.getByRole('button', { name: '关闭面板', exact: true }).click()
  expect(await detached!.evaluate(node => ({ connected: node.isConnected, animations: node.getAnimations().length })))
    .toEqual({ connected: false, animations: 0 })
})
