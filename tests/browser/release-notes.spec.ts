import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { RELEASE_NOTES_QQ, RELEASE_NOTES_THANKS, RELEASE_NOTES_TITLE } from '../../src/client/release-notes.ts'
import { axeSummary, bootInstalledLiangxiang } from './helpers.ts'

test.beforeEach(async ({ page }) => {
  await bootInstalledLiangxiang(page, { releaseNotesSeen: false })
})

test('an upgrader sees accessible version notes once, starting from the heading', async ({ page }) => {
  const dialog = page.getByRole('dialog', { name: RELEASE_NOTES_TITLE })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText(RELEASE_NOTES_QQ)
  await expect(dialog).toContainText(RELEASE_NOTES_THANKS)
  await expect(dialog).not.toContainText('上次正式版以来')
  const qqCard = dialog.locator('[data-liangxiang-release-notes-qq]')
  const qrCode = qqCard.locator('[data-liangxiang-release-notes-qq-qrcode]')
  await expect(qrCode).toBeVisible()
  await expect(qrCode).toHaveAttribute('alt', '梁相 QQ 群 453683905 二维码')
  expect(await qrCode.evaluate((image: HTMLImageElement) => ({
    complete: image.complete,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
  }))).toEqual({ complete: true, naturalWidth: 180, naturalHeight: 180 })
  await expect.poll(() => dialog.evaluate(element => element.scrollTop)).toBe(0)

  const results = await new AxeBuilder({ page })
    .include('[data-liangxiang-release-notes]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(results.violations, axeSummary(results.violations)).toEqual([])

  await page.keyboard.press('Tab')
  const close = dialog.getByRole('button', { name: '知道了' })
  await expect(close).toBeFocused()
  await close.click()
  await expect(dialog).toBeHidden()

  await page.reload()
  await expect(page.locator('[data-liangxiang-root]')).toBeVisible()
  await expect(page.locator('[data-liangxiang-release-notes]')).toHaveCount(0)
})
