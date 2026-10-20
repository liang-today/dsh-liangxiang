import { expect, test } from '@playwright/test'
import { RELEASE_NOTES_TITLE } from '../../src/client/release-notes.ts'
import { DEFAULT_INCENSE_WEIGHT_POLICY, incenseWeightRows } from '../../src/domain/index.ts'
import { parseWireState } from '../../src/shared/wire.ts'

import {
  badgeSelector,
  bootInstalledLiangxiang,
  liangciSelector,
  openPanel,
  panelSelector,
  waitForSettledAnimations,
} from './helpers.ts'

test.beforeEach(async ({ page }) => {
  await bootInstalledLiangxiang(page)
})

test('packed install exposes the frozen four-region panel and exactly two vote actions', async ({ page }) => {
  const badge = page.locator(badgeSelector)
  await badge.focus()
  await badge.press('Enter')

  const panel = page.locator(panelSelector)
  await expect(panel).toBeVisible()
  await expect(panel).toBeFocused()
  await expect(panel).toHaveAttribute('data-liangxiang-authority', /^(DEV_STAGING_ONLY|LOCAL_FAKE_DEV)$/)

  const regions = panel.locator('[data-liangxiang-region]')
  await expect(regions).toHaveCount(4)
  await expect(regions.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-liangxiang-region'))))
    .resolves.toEqual(['case', 'core', 'vote', 'social'])

  await expect(panel.locator('[data-liangxiang-case-title]')).toBeVisible()
  const votes = panel.locator('[data-liangxiang-vote]')
  await expect(votes).toHaveCount(2)
  await expect(votes.nth(0)).toHaveAttribute('data-liangxiang-vote', 'up')
  await expect(votes.nth(0)).toContainText('夯 · 升梁')
  await expect(votes.nth(1)).toHaveAttribute('data-liangxiang-vote', 'down')
  await expect(votes.nth(1)).toContainText('拉 · 降梁')
})

test('keyboard opens and closes the panel and returns focus to 今日梁相', async ({ page }) => {
  const badge = page.locator(badgeSelector)
  const panel = page.locator(panelSelector)

  await badge.focus()
  await badge.press('Enter')
  await expect(panel).toBeVisible()
  await expect(panel).toBeFocused()

  await panel.press('Escape')
  await expect(panel).toBeHidden()
  await expect(badge).toBeFocused()
  await expect(badge).toHaveAttribute('aria-expanded', 'false')

  await badge.press('Space')
  await expect(panel).toBeVisible()
  await expect(panel).toBeFocused()
})

test('next-incense tooltip uses the installed Host rules and stays within the viewport', async ({ page }) => {
  const panel = await openPanel(page)
  const response = await page.request.get('/liangxiang/api/state')
  expect(response.ok()).toBe(true)
  const wire = parseWireState(await response.json())
  expect(wire.incenseWeightPolicy).toEqual(DEFAULT_INCENSE_WEIGHT_POLICY)
  const next = panel.locator('[data-liangxiang-personal="next-incense"]')
  await next.focus()
  const tooltip = next.locator('[data-liangxiang-weight-hint]')
  await expect.poll(() => tooltip.evaluate(element => getComputedStyle(element).opacity)).toBe('1')
  const rows = incenseWeightRows(wire.incenseWeightPolicy!, wire.personal.tokenPerIncense)
  await expect(tooltip.locator('tbody tr')).toHaveCount(rows.length)
  for (const [index, row] of rows.entries()) {
    await expect(tooltip.locator('tbody tr').nth(index).locator('th,td')).toHaveText([row.model, row.stick])
  }
  expect(await tooltip.locator('th,td').evaluateAll(cells => cells.every(cell => {
    const range = document.createRange()
    range.selectNodeContents(cell)
    return range.getClientRects().length === 1 && cell.scrollWidth <= cell.clientWidth
  }))).toBe(true)
  const box = await tooltip.boundingBox()
  expect(box).not.toBeNull()
  if (box !== null) {
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  }
})

test('fresh default dock sits just above the visible DSH footer control', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-narrow', 'DSH collapses the settings control outside the narrow frame')
  const badgeBox = await page.locator(badgeSelector).boundingBox()
  const settingsBox = await page.getByRole('button', { name: /^(?:Settings|设置|Account menu|账户菜单)$/ }).boundingBox()

  expect(badgeBox).not.toBeNull()
  expect(settingsBox).not.toBeNull()
  if (badgeBox === null || settingsBox === null) return
  expect(Math.round(settingsBox.y - (badgeBox.y + badgeBox.height))).toBe(8)
})

test('pointer crosses from 梁相案牍 into its menu and version reopens update notes', async ({ page }) => {
  const panel = await openPanel(page)
  const trigger = panel.locator('[data-liangxiang-utility-trigger]')
  await trigger.click()

  const drawer = panel.locator('[data-liangxiang-utility-drawer]')
  await expect(drawer).toBeVisible()
  const triggerBox = await trigger.boundingBox()
  const drawerBox = await drawer.boundingBox()
  expect(triggerBox).not.toBeNull()
  expect(drawerBox).not.toBeNull()
  if (triggerBox === null || drawerBox === null) return

  // Cross the visual 6px gap explicitly. The transparent descendant bridge
  // keeps this point inside the combined trigger + drawer hover region.
  await page.mouse.move(triggerBox.x + triggerBox.width / 2, triggerBox.y + triggerBox.height / 2)
  await page.mouse.move(
    triggerBox.x + triggerBox.width / 2,
    (drawerBox.y + drawerBox.height + triggerBox.y) / 2,
  )
  await expect(drawer).toBeVisible()

  const version = drawer.locator('[data-liangxiang-utility-action="version"]')
  const versionLayout = await version.evaluate(button => {
    const box = button.getBoundingClientRect()
    const label = button.querySelector('[data-liangxiang-version-label]')!
    const group = label.getBoundingClientRect()
    const lines = [...label.children].map(line => line.getBoundingClientRect())
    return { fits: button.scrollWidth <= button.clientWidth && lines.every(line => line.left >= box.left && line.right <= box.right),
      leftAligned: lines.every(line => Math.abs(line.left - group.left) < 1),
      verticalOffset: Math.abs((group.top + group.bottom) / 2 - (box.top + box.bottom) / 2) }
  })
  expect(versionLayout.fits).toBe(true)
  expect(versionLayout.leftAligned).toBe(true)
  expect(versionLayout.verticalOffset).toBeLessThan(1)
  await version.hover()
  await expect(drawer).toBeVisible()
  await version.click()

  const releaseNotes = page.getByRole('dialog', { name: RELEASE_NOTES_TITLE })
  await expect(releaseNotes).toBeVisible()
  await expect(releaseNotes.locator('[data-liangxiang-release-notes-qq-qrcode]')).toBeVisible()
  await expect(page.locator('[data-liangxiang-version-dialog]')).toHaveCount(0)
})

test('梁祠 traps focus in both directions, closes with Escape, and restores entry focus', async ({ page }) => {
  const badge = page.locator(badgeSelector)
  await badge.focus()
  await badge.press('Enter')

  const entry = page.locator('[data-liangxiang-liangci-entry]')
  await entry.focus()
  await entry.press('Enter')

  const dialog = page.locator(liangciSelector)
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('role', 'dialog')
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  await expect(dialog).toHaveAttribute('aria-labelledby', 'liangci-title')
  await expect(page.locator('#liangci-title')).toHaveText('梁祠')
  await expect(dialog).toBeFocused()

  const focusable = dialog.locator('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')
  const first = focusable.first()
  const last = focusable.last()
  await page.keyboard.press('Shift+Tab')
  await expect(last).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(first).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(last).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(entry).toBeFocused()
})

test('reduced-motion removes panel and 梁祠 entry animations', async ({ page }) => {
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
  const badge = page.locator(badgeSelector)
  await badge.focus()
  await badge.press('Enter')
  const panel = page.locator(panelSelector)
  await expect(panel).toBeVisible()
  expect(await panel.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0)

  const entry = page.locator('[data-liangxiang-liangci-entry]')
  await entry.focus()
  await entry.press('Enter')
  const dialog = page.locator(liangciSelector)
  await expect(dialog).toBeVisible()
  await waitForSettledAnimations(dialog)
  expect(await dialog.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0)
})
