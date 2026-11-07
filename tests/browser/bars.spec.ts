import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { axeSummary, badgeSelector, bootInstalledLiangxiang, openPanel } from './helpers.ts'

async function openBars(page: Page) {
  const panel = await openPanel(page)
  await panel.locator('[data-liangxiang-utility-trigger]').click()
  await panel.locator('[data-liangxiang-utility-action="bars"]').click()
  const dialog = page.getByRole('dialog', { name: '梁位走势', exact: true })
  await expect(dialog).toBeVisible()
  await expect.poll(() => dialog.locator('[data-liangxiang-bars-image]').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
  return dialog
}

test.beforeEach(async ({ page }) => {
  await bootInstalledLiangxiang(page)
})

test('drawer opens a themed dialog, full screen restores, and Escape returns focus', async ({ page }) => {
  const dialog = await openBars(page)
  await expect(page.locator('[data-liangxiang-bars-attached]')).toHaveCount(0)
  await expect(dialog).toHaveAttribute('data-liangxiang-bars-window', 'float')
  await expect(dialog).toBeFocused()
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  const dark = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme === 'dark')
  await expect(dialog.locator('[data-liangxiang-bars-image]')).toHaveAttribute('src', new RegExp(`theme=${dark ? 'dark' : 'light'}`))

  const fits = await dialog.evaluate(element => {
    const rect = element.getBoundingClientRect()
    return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight
      && element.scrollWidth <= element.clientWidth
  })
  expect(fits).toBe(true)
  for (const button of await dialog.locator('[data-liangxiang-bars-range]').all()) {
    expect(await button.evaluate(element => {
      const range = document.createRange()
      range.selectNodeContents(element)
      return range.getClientRects().length === 1
    })).toBe(true)
  }

  await dialog.locator('[data-liangxiang-bars-action="full"]').click()
  await expect(dialog).toHaveAttribute('data-liangxiang-bars-window', 'full')
  await dialog.locator('[data-liangxiang-bars-action="float"]').click()
  await expect(dialog).toHaveAttribute('data-liangxiang-bars-window', 'float')
  await dialog.locator('[data-liangxiang-bars-range="all"]').click()
  await expect(dialog.locator('[data-liangxiang-bars-range="all"]')).toHaveAttribute('aria-pressed', 'true')

  await dialog.focus()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.locator('[data-liangxiang-bars-range="all"]')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.locator('[data-liangxiang-bars-action="full"]')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.locator('[data-liangxiang-utility-trigger]')).toBeFocused()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('liangxiang:bars:v1')!).slot)).toBe('closed')
})

test('chart dialog has no WCAG A/AA axe violations', async ({ page }) => {
  await openBars(page)
  const results = await new AxeBuilder({ page })
    .include('[data-liangxiang-bars-window]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(results.violations, axeSummary(results.violations)).toEqual([])
})

test('reloading remembers a full-screen chart and keeps keyboard focus inside it', async ({ page }) => {
  const dialog = await openBars(page)
  await dialog.locator('[data-liangxiang-bars-action="full"]').click()
  await dialog.locator('[data-liangxiang-bars-range="today"]').click()
  await page.reload()
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('data-liangxiang-bars-window', 'full')
  await expect(dialog.locator('[data-liangxiang-bars-range="today"]')).toHaveAttribute('aria-pressed', 'true')
  // An unconfigured DSH can show its own onboarding again after a reload. It
  // legitimately owns focus until dismissed; the chart must then trap Tab.
  const onboarding = page.getByRole('dialog', { name: /^(?:Get started|Add an API key to get started)$/ })
  const appeared = await onboarding.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true, () => false)
  if (appeared) {
    await onboarding.getByRole('button', { name: /^(?:Close|Configure later)$/ }).click()
    await expect(onboarding).toBeHidden()
  }
  await page.keyboard.press('Tab')
  await expect(dialog.locator('[data-liangxiang-bars-action="float"]')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.locator(badgeSelector)).toBeFocused()
})
