import { expect, test, type Locator, type Page } from '@playwright/test'
import type { LiangxiangWireState } from '../../src/shared/wire.ts'
import { bootInstalledLiangxiang, openPanel } from './helpers.ts'

declare global {
  interface Window {
    __liangxiangBlueUiFrame?: (wire: LiangxiangWireState) => void
  }
}

/**
 * The installed DSH and its static illustration routes stay real. Only this
 * disposable browser's wire responses/SSE are controlled UI fixtures. No mock
 * balance, usage, vote, market order or reconcile request reaches a backend.
 */
async function installBlueFixture(page: Page) {
  let current: LiangxiangWireState | null = null
  const mutations: string[] = []
  await page.addInitScript(() => {
    const Native = window.EventSource
    const streams = new Set<{ onmessage: ((event: MessageEvent) => void) | null }>()
    window.EventSource = new Proxy(Native, {
      construct(target, args) {
        if (new URL(String(args[0]), location.href).pathname !== '/liangxiang/api/events') return Reflect.construct(target, args)
        const stream = { onmessage: null as ((event: MessageEvent) => void) | null, onerror: null,
          close() { streams.delete(stream) } }
        streams.add(stream)
        return stream
      },
    })
    window.__liangxiangBlueUiFrame = wire => {
      for (const stream of streams) stream.onmessage?.(new MessageEvent('message', { data: JSON.stringify(wire) }))
    }
  })
  await page.route('**/liangxiang/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (route.request().method() !== 'GET' && path !== '/liangxiang/api/refresh') {
      mutations.push(path)
      await route.fulfill({ status: 418, json: { error: 'UI fixture does not authorize a Host mutation' } })
    } else await route.fallback()
  })
  await page.route(/\/liangxiang\/api\/(?:state|refresh)(?:\?|$)/, async route => {
    if (current === null) {
      const original = await route.fetch()
      const wire = await original.json() as LiangxiangWireState
      const effective = 12 * 50_000 + 17_000
      current = { ...wire, revision: wire.revision + 1_000_000,
        authorityMode: 'DEV_STAGING_ONLY', authorityAvailable: true, authorityReason: null, broadcast: null, streamingActive: false,
        global: { ...wire.global, liangziPolicyVersion: 'liangzi-v0.2-25-50-70-85-95',
          upVotes: 100_000, downVotes: 900_000, uniqueVoters: 1_024, lifetimeIncense: 1_000_000, lifetimeVoters: 1_024 },
        personal: { ...wire.personal, effectiveTokensToday: effective, confirmedEffectiveTokensToday: effective,
          earnedIncenseToday: 12, usedIncenseToday: 0, remainingIncense: 1_000, tokenPerIncense: 50_000,
          wallet: { available_incense: 1_000, frozen_incense: 0, total_incense: 1_000,
            token_remainder: 17_000, token_per_incense: 50_000, version: 1 } },
        accounting: { ...wire.accounting, available: true, inputTokensToday: effective, outputTokensToday: 0, notice: null },
      }
    }
    await route.fulfill({ json: current })
  })
  await bootInstalledLiangxiang(page)
  const panel = await openPanel(page)
  await expect(panel.locator('[data-liangxiang-liang-position-value]')).toHaveText('10.000000%')
  const emit = async (change: (wire: LiangxiangWireState) => LiangxiangWireState, repeat = false): Promise<void> => {
    if (current === null) throw new Error('installed Host has not supplied its initial wire frame')
    const next = change(structuredClone(current))
    current = { ...next, revision: repeat ? current.revision : current.revision + 1 }
    await page.evaluate(wire => window.__liangxiangBlueUiFrame?.(wire), current)
  }
  return {
    panel,
    mutations,
    emit,
    balance: (value: number) => emit(wire => ({ ...wire, personal: { ...wire.personal, remainingIncense: value,
      wallet: { ...wire.personal.wallet!, available_incense: value, total_incense: value, version: wire.personal.wallet!.version + 1 } } })),
  }
}

async function expectPanelInkToFit(panel: Locator): Promise<void> {
  await expect.poll(() => panel.evaluate(element => {
    const bounds = element.getBoundingClientRect(), overflow: string[] = []
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      const parent = text.parentElement
      if (!parent || !text.textContent?.trim() || parent.closest('style,script,[aria-hidden="true"],[role="tooltip"]')) continue
      const style = getComputedStyle(parent)
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue
      // Screen-reader summaries deliberately keep their full exact text in a
      // 1px clipped box; their unpainted Range geometry is not visible overflow.
      let ancestor: Element | null = parent, clippedSummary = false
      while (ancestor && ancestor !== element) {
        if (getComputedStyle(ancestor).clip !== 'auto') { clippedSummary = true;break }
        ancestor = ancestor.parentElement
      }
      if (clippedSummary) continue
      const range = document.createRange();range.selectNodeContents(text)
      for (const ink of range.getClientRects()) {
        if (ink.width > 0 && ink.height > 0 && (ink.left < bounds.left - 1 || ink.right > bounds.right + 1)) overflow.push(text.textContent.trim())
      }
    }
    return overflow
  })).toEqual([])
}

async function chooseDshDark(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Account menu', exact: true }).click()
  await page.getByRole('menuitem', { name: /^(Settings|设置)/ }).click()
  const settings = page.getByRole('dialog', { name: /^(Settings|设置)$/ })
  await settings.getByRole('button', { name: /^(Dark|深色)$/ }).click()
  await settings.getByRole('button', { name: /^(Close|关闭)$/ }).click()
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('dark')
}

test('water and small plants grow from zero without moving the four-region center or clipping real art', async ({ page }, testInfo) => {
  const fixture = await installBlueFixture(page), { panel } = fixture
  const pond = panel.locator('[data-liangxiang-main-pond]')
  const heights: number[] = []
  for (const [balance, growth] of [[0, 0], [25, .5], [100, 1], [101, 1], [1_000, 1]] as const) {
    await fixture.balance(balance)
    await expect(pond).toHaveAttribute('data-plant-growth', String(growth))
    const geometry = await pond.evaluate(element => ({
      drop: Number(element.dataset.waterDrop),
      grassHeight: element.querySelector('.liangxiang-main-pond-grass')!.getBoundingClientRect().height,
      stones: [...element.querySelectorAll('.liangxiang-main-pond-stones')].map(stones => stones.children.length),
    }))
    expect(geometry.drop).toBeCloseTo(128 * (1 - Math.sqrt(Math.min(1, balance / 1_000))), 5)
    expect(geometry.grassHeight).toBeCloseTo(27 * growth, 1)
    expect(geometry.stones).toEqual([2, 2])
    heights.push((await panel.boundingBox())!.height)
  }
  expect(new Set(heights).size).toBe(1)
  expect(await panel.locator('[data-liangxiang-region]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-liangxiang-region'))))
    .toEqual(['case', 'core', 'vote', 'social'])
  const layout = await panel.evaluate(element => {
    const box = (selector: string) => element.querySelector(selector)!.getBoundingClientRect()
    const panel = element.getBoundingClientRect(), ring = box('[data-liangxiang-ring]'), avatar = box('[data-liangxiang-avatar]')
    return { width: panel.width, center: panel.left + panel.width / 2,
      ringCenter: ring.left + ring.width / 2, avatarCenter: avatar.left + avatar.width / 2,
      positionWidth: box('[data-liangxiang-liang-position]').width, voteWidth: box('[data-liangxiang-region="vote"]').width }
  })
  expect(layout.width).toBe(256)
  expect(layout.ringCenter).toBeCloseTo(layout.center, 1)
  expect(layout.avatarCenter).toBeCloseTo(layout.center, 1)
  expect(layout.positionWidth).toBeCloseTo(layout.voteWidth, 1)
  const illustrations = panel.locator('img[src*="/liangxiang/api/panel/art.webp"]')
  await expect.poll(() => illustrations.evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true)
  const urls = [...new Set(await illustrations.evaluateAll(images => images.map(image => (image as HTMLImageElement).src)))]
  expect(urls.map(url => new URL(url).searchParams.get('asset')).sort()).toEqual(['fish', 'grass', 'nan'])
  for (const url of urls) {
    const response = await page.request.get(url)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toBe('image/webp')
  }
  await expectPanelInkToFit(panel)
  await panel.screenshot({ path: testInfo.outputPath('main-blue-water-full.png') })
  expect(fixture.mutations).toEqual([])
})

test('large confirmed amounts fit both the project palette and OS-light DSH-dark appearance', async ({ page }, testInfo) => {
  const fixture = await installBlueFixture(page)
  await fixture.emit(wire => ({ ...wire, global: { ...wire.global, upVotes: 999_999, downVotes: 9_000_000, lifetimeIncense: 9_999_999 },
    personal: { ...wire.personal, earnedIncenseToday: 9_999_999,
      effectiveTokensToday: 9_999_999 * 50_000 + 17_000,
      confirmedEffectiveTokensToday: 9_999_999 * 50_000 + 17_000,
      remainingIncense: 9_999_999, wallet: { ...wire.personal.wallet!, available_incense: 9_999_999, total_incense: 9_999_999 } } }))
  await expectPanelInkToFit(fixture.panel)
  await fixture.panel.screenshot({ path: testInfo.outputPath('main-blue-project-theme.png') })
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await chooseDshDark(page)
  await openPanel(page)
  expect(await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(false)
  await expect.poll(() => fixture.panel.evaluate(element => getComputedStyle(element).colorScheme)).toBe('dark')
  await expectPanelInkToFit(fixture.panel)
  await fixture.panel.screenshot({ path: testInfo.outputPath('main-blue-os-light-dsh-dark.png') })
  expect(fixture.mutations).toEqual([])
})

test('continuous activity keeps the daily caption while a confirmed receipt retires and duplicate frames stay quiet', async ({ page }) => {
  const fixture = await installBlueFixture(page), caption = fixture.panel.locator('[data-liangxiang-personal-caption]')
  await fixture.emit(wire => ({ ...wire, streamingActive: true }))
  await expect(caption).toHaveAttribute('data-view', 'daily')
  await expect(caption.locator('[data-caption-label]')).toHaveText('今日凝香')
  // Provider-finalized usage can still lead the server's claim watermark.
  // It may affect ring geometry, but it is not an acknowledged incense receipt.
  await fixture.emit(wire => ({ ...wire, personal: { ...wire.personal, effectiveTokensToday: wire.personal.effectiveTokensToday + 3 * 50_000 } }))
  await page.waitForTimeout(400)
  await expect(caption).toHaveAttribute('data-view', 'daily')
  await expect(caption).toHaveAttribute('aria-label', '今日凝香12炷')
  await expect(fixture.panel.locator('[data-liangxiang-ring]')).toHaveAttribute('data-remaining', '1000')
  await fixture.emit(wire => ({ ...wire, personal: { ...wire.personal,
    earnedIncenseToday: 15, effectiveTokensToday: 15 * 50_000 + 17_000,
    confirmedEffectiveTokensToday: 15 * 50_000 + 17_000,
    remainingIncense: 1_003, wallet: { ...wire.personal.wallet!, available_incense: 1_003, total_incense: 1_003 } } }))
  await expect(caption).toHaveAttribute('data-view', 'gain')
  await expect(caption.locator('[data-caption-amount]')).toHaveText('+3')
  await expect(caption).toHaveAttribute('data-view', 'balance', { timeout: 2_000 })
  await expect(caption).toHaveAttribute('data-view', 'daily', { timeout: 3_100 })
  await expect(caption).toHaveAttribute('aria-label', '今日凝香15炷')
  await fixture.emit(wire => wire, true)
  await fixture.emit(wire => wire)
  await page.waitForTimeout(300)
  await expect(caption).toHaveAttribute('data-view', 'daily')
  await expect(fixture.panel.locator('[data-liangxiang-stream-status]')).toHaveCount(0)
  await fixture.panel.locator('[data-liangxiang-inspect-incense]').click()
  await expect(caption).toHaveAttribute('data-view', 'balance')
  await expect(caption).toHaveAttribute('aria-label', '个人余香1,003炷')
  // A live connection may move to another case/business date without mounting
  // a new Badge. The new scope's existing totals must be fenced as history.
  await fixture.emit(wire => {
    const businessDate = wire.businessDate === '2026-11-09' ? '2026-11-10' : '2026-11-09'
    return { ...wire, businessDate,
      activeCase: { ...wire.activeCase, id: 'case-blue-ui-new-scope', businessDate },
      global: { ...wire.global, caseId: 'case-blue-ui-new-scope' },
      personal: { ...wire.personal, earnedIncenseToday: 99, effectiveTokensToday: 99 * 50_000 + 17_000,
        confirmedEffectiveTokensToday: 99 * 50_000 + 17_000 } }
  })
  await expect(caption).toHaveAttribute('data-view', 'daily')
  await expect(caption).toHaveAttribute('aria-label', '今日凝香99炷')
  await page.waitForTimeout(400)
  await expect(caption).toHaveAttribute('data-view', 'daily')
  expect(fixture.mutations).toEqual([])
})

test('one real fish visit puffs identically on both sides and foreground bubbles rise, grow, pop and cancel', async ({ page }, testInfo) => {
  const fixture = await installBlueFixture(page), pond = fixture.panel.locator('[data-liangxiang-main-pond]')
  await page.clock.install()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(pond).toHaveAttribute('data-motion', 'true')
  await expect(pond).toHaveAttribute('data-available', 'true')
  // Skip only the random 6–10s idle delay. The complete swimming, head action,
  // rise and surface-pop choreography below runs at real browser speed.
  await page.clock.fastForward(10_001)
  await expect(pond).toHaveAttribute('data-fish', 'true')
  const body = pond.locator('.liangxiang-main-pond-fish-body')
  const puffs: Array<unknown> = []
  for (const side of ['left', 'right'] as const) {
    const bubble = pond.locator(`[data-liangxiang-main-pond-bubbles] .liangxiang-main-pond-bubble[data-side="${side}"]`)
    await expect.poll(() => body.getAttribute('data-puff'), { intervals: [20], timeout: 5_000 }).toBe('true')
    puffs.push(await body.evaluate(element => element.getAnimations().map(animation => ({
      name: animation instanceof CSSAnimation ? animation.animationName : '',
      frames: animation.effect instanceof KeyframeEffect ? animation.effect.getKeyframes().map(frame => frame.transform) : [],
    }))))
    await expect.poll(() => bubble.getAttribute('data-stage'), { intervals: [20], timeout: 1_000 }).toBe('rise')
    const first = await bubble.evaluate(element => ({
      top: element.getBoundingClientRect().top,
      scale: new DOMMatrixReadOnly(getComputedStyle(element.querySelector('.liangxiang-main-pond-bubble-orb')!).transform).a,
      x: Number((element as HTMLElement).dataset.birthX), y: Number((element as HTMLElement).dataset.birthY),
    }))
    await page.waitForTimeout(220)
    const next = await bubble.evaluate(element => ({ top: element.getBoundingClientRect().top,
      scale: new DOMMatrixReadOnly(getComputedStyle(element.querySelector('.liangxiang-main-pond-bubble-orb')!).transform).a }))
    expect(next.top).toBeLessThan(first.top)
    expect(next.scale).toBeGreaterThan(first.scale)
    const avatar = await fixture.panel.locator('[data-liangxiang-avatar]').boundingBox(), origin = await pond.boundingBox()
    const ring = (await fixture.panel.locator('[data-liangxiang-ring]').boundingBox())!
    if (side === 'left') expect(origin!.x + first.x + 6).toBeLessThan(avatar!.x)
    else expect(origin!.x + first.x - 6).toBeGreaterThan(avatar!.x + avatar!.width)
    // Keep even the fully grown orb outside the ring's rectangular footprint.
    if (side === 'left') expect(origin!.x + first.x + 5).toBeLessThan(ring.x)
    else expect(origin!.x + first.x - 5).toBeGreaterThan(ring.x + ring.width)
    await expect(bubble).toHaveAttribute('data-stage', 'pop', { timeout: 1_500 })
    const pop = await bubble.evaluate(element => {
      const pond = element.closest<HTMLElement>('[data-liangxiang-main-pond]')!
      return { y: element.getBoundingClientRect().top + 5 - pond.getBoundingClientRect().top,
        water: Number((element as HTMLElement).dataset.surfaceY), z: getComputedStyle(element.parentElement!).zIndex,
        orb: getComputedStyle(element.querySelector('.liangxiang-main-pond-bubble-orb')!).display,
        ring: getComputedStyle(element.querySelector('.liangxiang-main-pond-pop')!).animationName }
    })
    expect(pop.y).toBeCloseTo(pop.water, 0)
    expect(pop.z).toBe('4')
    expect(pop.orb).toBe('none')
    expect(pop.ring).toBe('liangxiang-main-pond-ring')
    await fixture.panel.screenshot({ path: testInfo.outputPath(`main-blue-${side}-surface-pop.png`) })
  }
  expect(puffs[0]).toEqual(puffs[1])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(pond).toHaveAttribute('data-fish', 'false')
  expect(await pond.locator('.liangxiang-main-pond-bubble').evaluateAll(nodes => nodes.every(node => (node as HTMLElement).hidden))).toBe(true)
  expect(await pond.evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length)).toBe(0)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const detachedPond = await pond.elementHandle()
  await fixture.panel.getByRole('button', { name: '关闭面板', exact: true }).click()
  await expect(fixture.panel).toBeHidden()
  expect(await detachedPond!.evaluate(element => ({ connected: element.isConnected, fish: element.dataset.fish,
    visibleBubbles: [...element.querySelectorAll<HTMLElement>('.liangxiang-main-pond-bubble')].filter(bubble => !bubble.hidden).length })))
    .toEqual({ connected: false, fish: 'false', visibleBubbles: 0 })
  expect(fixture.mutations).toEqual([])
})

test('the compact drawer has no second market entry and repair confirmation keeps its height and Escape focus', async ({ page }) => {
  const fixture = await installBlueFixture(page), trigger = fixture.panel.locator('[data-liangxiang-utility-trigger]')
  await trigger.focus();await trigger.press('Enter')
  const drawer = fixture.panel.locator('[data-liangxiang-utility-drawer]')
  await expect(drawer).toBeVisible()
  await expect(drawer.locator('[data-liangxiang-utility-market]')).toHaveCount(0)
  await expect(drawer.locator('[data-liangxiang-utility-action="bars"]')).toHaveCount(0)
  const before = (await drawer.boundingBox())!
  await drawer.locator('[data-liangxiang-utility-action="reconcile"]').click()
  const confirm = drawer.locator('[data-liangxiang-reconcile-confirm]')
  await expect(confirm).toBeVisible()
  expect((await drawer.boundingBox())!.height).toBe(before.height)
  const overlay = (await confirm.boundingBox())!
  expect(overlay.width).toBeCloseTo(before.width - 2, 0)
  expect(overlay.height).toBeCloseTo(before.height - 2, 0)
  await page.keyboard.press('Escape')
  await expect(confirm).toHaveCount(0)
  await expect(drawer).toBeVisible()
  expect((await drawer.boundingBox())!.height).toBe(before.height)
  await page.keyboard.press('Escape')
  await expect(drawer).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await trigger.click()
  await expect(drawer).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(drawer).toHaveCount(0)
  await expect(trigger).not.toBeFocused()
  await expect(trigger.locator('[data-liangxiang-hint]')).toHaveCSS('opacity', '0')
  expect(fixture.mutations).toEqual([])
})
