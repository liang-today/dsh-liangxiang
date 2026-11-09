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
  const wisps = panel.locator('[data-liangxiang-stream-wisp]')
  await expect(wisps).toHaveCount(2)
  expect(await wisps.evaluateAll(nodes => nodes.every(node => node.getAnimations().length === 0))).toBe(true)
  await page.waitForTimeout(1200) // prove a running request does not predict numbers
  expect(await figures.allTextContents()).toEqual(before)
  await expect(panel.locator('[data-liangxiang-ring]')).toHaveAttribute('data-remaining', remaining!)
  await expect(panel.locator('[data-liangxiang-liang-position-value]')).toHaveText(position!)
  await panel.screenshot({ path: testInfo.outputPath('streaming-reduced-motion.png') })
  const axe = await new AxeBuilder({ page }).include('[data-liangxiang-panel]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(axe.violations).toEqual([])

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect.poll(() => wisps.evaluateAll(nodes => nodes.every(node => node.getAnimations().length === 1))).toBe(true)
  const wisp = wisps.first()
  const transform = await wisp.evaluate(node => getComputedStyle(node).transform)
  await expect.poll(() => wisp.evaluate(node => getComputedStyle(node).transform)).not.toBe(transform)
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
  await expect(panel.locator('[data-liangxiang-stream-status]')).toHaveCount(0)
  await expect(panel.locator('[data-liangxiang-ring]')).toHaveAttribute('data-remaining', String(wire.personal.remainingIncense + 2))
  await expect(panel.locator('[data-caption-label]')).toHaveText('凝香到账')
  await expect(panel.locator('[data-caption-amount]')).toHaveText('+2')
})
