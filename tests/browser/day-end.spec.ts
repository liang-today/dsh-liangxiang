import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { DAY_END_ACTION_HEADER, DAY_END_ACTION_VALUE } from '../../src/shared/day-end.ts'
import { bootInstalledLiangxiang, openPanel } from './helpers.ts'

test.afterEach(async ({ page }) => {
  const response = await page.request.post('/liangxiang/api/day-end', {
    headers: { [DAY_END_ACTION_HEADER]: DAY_END_ACTION_VALUE }, data: { enabled: false, voteType: 'up' },
  })
  expect(response.ok()).toBe(true)
})

test('automatic participation updates 此身香火 and 梁小号 without being appended again on reload or another tab', async ({ page }) => {
  await bootInstalledLiangxiang(page)
  const wire = await page.request.get('/liangxiang/api/state').then(r => r.json())
  const timedIncense = { businessDate: wire.businessDate, lifetimeUp: 550, lifetimeDown: 1_000, todayUp: 550, todayDown: 1_000 }
  // Only the additive Host projection is supplied by this fixture. Manual
  // browser records remain separate, and real SSE frames retain live transport.
  await page.context().route('**/liangxiang/api/state', async route => {
    const response = await route.fetch()
    const current = await response.json()
    await route.fulfill({ response, json: { ...current, revision: current.revision + 100_000, timedIncense } })
  })
  await page.context().addInitScript(({ businessDate }) => {
    localStorage.setItem('liangxiang:local-incense:v1', JSON.stringify({ businessDate,
      lifetimeUp: 0, lifetimeDown: 10, todayUp: 0, todayDown: 10 }))
    localStorage.setItem('liangxiang:local-epithet:v2', JSON.stringify({ businessDate, up: 0, down: 10 }))
  }, { businessDate: wire.businessDate })
  const check = async (target: typeof page) => {
    const panel = await openPanel(target)
    await expect(panel.locator('[data-liangxiang-vote-feedback]')).toContainText('香疯')
    await expect(panel.locator('[data-liangxiang-vote-feedback]')).toContainText('偏拉梁')
    const stats = panel.locator('[data-liangxiang-stat="incense"]')
    await stats.hover()
    await expect(stats.getByRole('tooltip')).toContainText('1,560')
    await expect(stats.getByRole('tooltip')).toContainText('550/1010')
  }
  await bootInstalledLiangxiang(page, { seedPreferences: false })
  await check(page)
  await bootInstalledLiangxiang(page, { seedPreferences: false })
  await check(page)
  const other = await page.context().newPage()
  try { await bootInstalledLiangxiang(other); await check(other) }
  finally { await other.close() }
  const manual = await page.evaluate(() => JSON.parse(localStorage.getItem('liangxiang:local-incense:v1')!))
  expect(manual.todayDown).toBe(10)
  expect(manual.todayUp).toBe(0)
})

test('day-end is explicit, right-click only sets direction, and tabs share the Host preference', async ({ page }, testInfo) => {
  await bootInstalledLiangxiang(page)
  const configure = async (enabled: boolean) => {
    const response = await page.request.post('/liangxiang/api/day-end', {
      headers: { [DAY_END_ACTION_HEADER]: DAY_END_ACTION_VALUE }, data: { enabled, voteType: 'up' },
    })
    expect(response.ok()).toBe(true)
  }
  await configure(false)
  const before = await page.request.get('/liangxiang/api/state').then(r => r.json())
  const votes: string[] = []
  page.on('request', request => { if (request.url().endsWith('/liangxiang/api/vote')) votes.push(request.postData() ?? '') })
  const panel = await openPanel(page)
  await panel.locator('[data-liangxiang-vote="down"]').click({ button: 'right' })
  await expect(panel).toContainText('定时上香：默认投拉')
  expect(votes).toHaveLength(0)
  await panel.locator('[data-liangxiang-vote="up"]').click({ button: 'right' })
  await expect(panel).toContainText('定时上香：默认投夯')
  await panel.locator('[data-liangxiang-vote="down"]').click({ button: 'right' })
  await expect(panel).toContainText('定时上香：默认投拉')
  await panel.locator('[data-liangxiang-utility-trigger]').click()
  const toggle = panel.locator('[data-liangxiang-utility-action="day-end"]')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(toggle).toContainText('已关闭')
  const hint = panel.locator('[data-liangxiang-day-end-hint]')
  await expect(hint).toBeHidden()
  await toggle.hover()
  await expect(hint).toBeVisible()
  await expect(hint).toContainText('当前：拉')
  await expect(hint).toContainText('满 500 炷后')
  await expect(hint).toContainText('每 10 分钟')
  await expect(hint).toContainText('23:59 再按限额收尾一次')
  const hintLayout = await hint.evaluate(element => {
    const box = element.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(element)
    const text = range.getBoundingClientRect()
    const direction = element.querySelector('[data-liangxiang-day-end-direction]')!
    const label = direction.firstElementChild!.getBoundingClientRect()
    const current = direction.lastElementChild!.getBoundingClientRect()
    return { insetDifference: Math.abs((text.left - box.left) - (box.right - text.right)),
      fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
      directionAligned: Math.abs(label.top - current.top) < 1 && label.right <= current.left,
      overflow: element.scrollWidth > element.clientWidth }
  })
  expect(hintLayout.insetDifference).toBeLessThan(hintLayout.fontSize)
  expect(hintLayout.directionAligned).toBe(true)
  expect(hintLayout.overflow).toBe(false)
  await expect(toggle).toContainText('定时上香')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(toggle).toContainText('已开启')
  // The entire tile remains a working toggle in both directions. Leave it
  // enabled for the held-gesture check below.
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(toggle).toContainText('已关闭')
  await toggle.press('Enter')
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await panel.locator('[data-liangxiang-utility-action="version"]').hover()
  await expect(hint).toBeHidden()
  // A held gesture informs the Host before release. Cancel it so this test
  // never spends the existing smoke balance.
  await page.mouse.move(10, 10)
  const up = panel.locator('[data-liangxiang-vote="up"]')
  const gesture = page.waitForResponse(r => r.url().endsWith('/liangxiang/api/vote-activity'))
  await up.hover()
  await page.mouse.down()
  expect((await gesture).ok()).toBe(true)
  await up.dispatchEvent('pointercancel', { pointerId: 1, bubbles: true })
  await page.mouse.up()
  expect(votes).toHaveLength(0)
  await panel.locator('[data-liangxiang-utility-trigger]').click()
  const repair = panel.locator('[data-liangxiang-utility-action="reconcile"]')
  await expect(repair).toBeHidden()
  await panel.getByText('显示异常？', { exact: true }).click()
  await expect(repair).toBeVisible()
  const repairLayout = await repair.evaluate(element => {
    const drawer = element.closest('[data-liangxiang-utility-drawer]')!
    const first = drawer.querySelector('[data-liangxiang-utility-action="home"]')!.getBoundingClientRect()
    const last = drawer.querySelector('[data-liangxiang-utility-action="version"]')!.getBoundingClientRect()
    const box = element.getBoundingClientRect()
    const text = document.createRange()
    text.selectNodeContents(element)
    // React emits label, separator and hint as separate text nodes. Count
    // visual rows rather than mistaking each fragment for a wrapped line.
    const rows: Array<{ top: number, bottom: number }> = []
    for (const rect of Array.from(text.getClientRects()).sort((a, b) => a.top - b.top)) {
      if (rect.width === 0 || rect.height === 0) continue
      const previous = rows.at(-1)
      if (previous === undefined || rect.top >= previous.bottom - 1) rows.push({ top: rect.top, bottom: rect.bottom })
      else previous.bottom = Math.max(previous.bottom, rect.bottom)
    }
    return { leftGap: Math.abs(box.left - first.left), rightGap: Math.abs(box.right - last.right),
      height: box.height, lines: rows.length, overflow: element.scrollWidth > element.clientWidth }
  })
  expect(repairLayout.leftGap).toBeLessThan(1)
  expect(repairLayout.rightGap).toBeLessThan(1)
  expect(repairLayout.lines).toBeLessThanOrEqual(2)
  expect(repairLayout.height).toBeLessThanOrEqual(44)
  expect(repairLayout.overflow).toBe(false)
  await panel.locator('[data-liangxiang-utility-drawer]').screenshot({ path: testInfo.outputPath('repair-expanded.png') })
  await repair.click()
  await expect(panel.locator('[data-liangxiang-reconcile-confirm]')).toBeVisible()
  await panel.locator('[data-liangxiang-reconcile-cancel]').click()
  await expect(panel.locator('[data-liangxiang-reconcile-confirm]')).toBeHidden()
  const accessibility = await new AxeBuilder({ page }).include('[data-liangxiang-utility-drawer]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(accessibility.violations).toEqual([])
  const other = await page.context().newPage()
  try {
    await bootInstalledLiangxiang(other)
    const second = await openPanel(other)
    await second.locator('[data-liangxiang-utility-trigger]').click()
    const secondToggle = second.locator('[data-liangxiang-utility-action="day-end"]')
    await expect(secondToggle).toHaveAttribute('aria-pressed', 'true')
    await expect(secondToggle).toContainText('已开启')
    await secondToggle.hover()
    await expect(second.locator('[data-liangxiang-day-end-hint]')).toContainText('当前：拉')
    await secondToggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  } finally { await other.close() }
  const after = await page.request.get('/liangxiang/api/state').then(r => r.json())
  expect(after.personal.usedIncenseToday).toBe(before.personal.usedIncenseToday)
  expect(after.personal.remainingIncense).toBe(before.personal.remainingIncense)
})
