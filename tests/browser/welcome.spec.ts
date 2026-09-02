import { expect, test } from '@playwright/test'

import { RELEASE_NOTES_QQ, RELEASE_NOTES_TITLE } from '../../src/client/release-notes.ts'
import { bootInstalledLiangxiang, panelSelector } from './helpers.ts'

test.beforeEach(async ({ page }) => {
  await bootInstalledLiangxiang(page, { welcomeSeen: false, releaseNotesSeen: false })
})

test('first-run welcome embeds the compact QQ group QR card without leaving the panel', async ({ page }) => {
  const panel = page.locator(panelSelector)
  const welcome = panel.locator('[data-liangxiang-welcome]')
  const card = welcome.locator('[data-liangxiang-welcome-qq]')
  const qrCode = card.locator('[data-liangxiang-welcome-qq-qrcode]')

  await expect(welcome).toBeVisible()
  await expect(card).toContainText(RELEASE_NOTES_QQ)
  await expect(qrCode).toBeVisible()
  await expect(qrCode).toHaveAttribute('alt', '梁相 QQ 群 453683905 二维码')
  expect(await qrCode.evaluate((image: HTMLImageElement) => ({
    complete: image.complete,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
  }))).toEqual({ complete: true, naturalWidth: 180, naturalHeight: 180 })

  const panelBox = await panel.boundingBox()
  const cardBox = await card.boundingBox()
  expect(panelBox).not.toBeNull()
  expect(cardBox).not.toBeNull()
  if (panelBox === null || cardBox === null) return
  expect(cardBox.x).toBeGreaterThanOrEqual(panelBox.x)
  expect(cardBox.y).toBeGreaterThanOrEqual(panelBox.y)
  expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width)
  expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(panelBox.y + panelBox.height)
})

test('first install continues into the canonical update-notes dialog', async ({ page }) => {
  await page.locator('[data-liangxiang-welcome-local]').click()

  const dialog = page.getByRole('dialog', { name: RELEASE_NOTES_TITLE })
  await expect(dialog).toBeVisible()
  await expect(page.locator('[data-liangxiang-welcome]')).toHaveCount(0)
  await expect(dialog.locator('[data-liangxiang-release-notes-qq-qrcode]')).toBeVisible()
})
