import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { RELEASE_NOTES_QQ, RELEASE_NOTES_THANKS, RELEASE_NOTES_TITLE, RELEASE_NOTES_VERSION, RELEASE_NOTES_LATEST_SEEN_KEY } from '../../src/client/release-notes.ts'
import { axeSummary, bootInstalledLiangxiang } from './helpers.ts'

test.beforeEach(async ({ page }) => {
  await bootInstalledLiangxiang(page, { releaseNotesSeen: false })
})

test('an upgrader sees accessible version notes once, starting from the heading', async ({ page }) => {
  const dialog = page.getByRole('dialog', { name: RELEASE_NOTES_TITLE })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('[data-liangxiang-release-notes-qq]')).toHaveAttribute('aria-label', RELEASE_NOTES_QQ)
  await expect(dialog).toContainText(RELEASE_NOTES_THANKS)
  const thanks = dialog.locator('[data-liangxiang-release-notes-thanks]')
  for (const handle of ['@XChen446', '@Ritanlisa', '@xunxiaoQ']) await expect(thanks).toContainText(handle)
  expect(await thanks.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await expect(dialog).not.toContainText('上次正式版以来')
  const qqCard = dialog.locator('[data-liangxiang-release-notes-qq]')
  const qrCode = qqCard.locator('[data-liangxiang-release-notes-qq-qrcode]')
  await expect(qrCode).toBeVisible()
  await expect(qrCode).toHaveAttribute('alt', '梁相上香QQ群453683905二维码')
  expect(await qrCode.evaluate((image: HTMLImageElement) => ({
    complete: image.complete,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
  }))).toEqual({ complete: true, naturalWidth: 180, naturalHeight: 180 })
  const scroll = dialog.locator('[data-liangxiang-release-notes-scroll]')
  await expect.poll(() => scroll.evaluate(element => element.scrollTop)).toBe(0)
  expect(await dialog.evaluate(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }))).toEqual({ width: 256, height: 384 })
  await expect(dialog.locator('.u-slogan')).toHaveText('社区起浪，行情跟上。')
  await expect(dialog.locator('.u-benefits > li').first()).toHaveText('行情更清楚　三盘香池一起看，重连后走势自动跟上。')
  await expect(dialog.locator('nav button')).toHaveText(['梁股怎么玩', '社群', '鸣谢'])
  for (const button of await dialog.locator('nav button').all()) await expect(button).toBeInViewport()
  await dialog.screenshot({ path: test.info().outputPath('update-sheet.png') })

  const results = await new AxeBuilder({ page })
    .include('[data-liangxiang-release-notes]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(results.violations, axeSummary(results.violations)).toEqual([])

  await page.keyboard.press('Tab')
  const close = dialog.getByRole('button', { name: '开始体验' })
  await expect(dialog.getByRole('button', { name: '关闭更新介绍' })).toBeFocused()
  await close.click()
  await expect(dialog).toBeHidden()
  expect(await page.evaluate(key => localStorage.getItem(key), RELEASE_NOTES_LATEST_SEEN_KEY)).toBe(RELEASE_NOTES_VERSION)

  await page.reload()
  await expect(page.locator('[data-liangxiang-root]')).toBeVisible()
  await expect(page.locator('[data-liangxiang-release-notes]')).toHaveCount(0)
})

test('three jump arrows follow content order and keep header/footer fixed', async ({ page }) => {
  const dialog = page.getByRole('dialog', { name: RELEASE_NOTES_TITLE })
  const head = (await dialog.locator('header').boundingBox())!
  const foot = (await dialog.locator('footer').boundingBox())!
  const shortcuts = (await dialog.locator('nav').boundingBox())!
  expect(await dialog.locator('nav').evaluate(element => element.closest('.u-scroll'))).toBeNull()
  expect(await dialog.locator('[data-update-section]').evaluateAll(elements => elements.map(e => e.getAttribute('data-update-section')))).toEqual(['rules', 'community', 'thanks'])
  for (const [name, section] of [['梁股怎么玩', 'rules'], ['社群', 'community'], ['鸣谢', 'thanks']] as const) {
    await dialog.locator('nav').getByRole('button', { name, exact: true }).click()
    const target = dialog.locator(`[data-update-section="${section}"]`)
    await expect(target.locator('h3')).toBeInViewport()
    expect((await dialog.locator('header').boundingBox())!.y).toBe(head.y)
    expect((await dialog.locator('footer').boundingBox())!.y).toBe(foot.y)
    expect((await dialog.locator('nav').boundingBox())!.y).toBe(shortcuts.y)
    for (const button of await dialog.locator('nav button').all()) await expect(button).toBeInViewport()
    await dialog.locator('[data-liangxiang-release-notes-scroll]').evaluate(element => { element.scrollTop = 0 })
  }
})

test('QR enlarges inside the same sheet, traps focus, and Escape returns to the QR', async ({ page }) => {
  const dialog = page.getByRole('dialog', { name: RELEASE_NOTES_TITLE })
  await dialog.getByRole('button', { name: '社群', exact: true }).click()
  const open = dialog.getByRole('button', { name: '放大QQ群二维码' })
  await open.click()
  const qr = dialog.locator('.u-qr-view')
  await expect(qr).toBeVisible()
  await expect(dialog.locator('.u-base')).toHaveAttribute('inert', '')
  await expect(qr.getByRole('img')).toHaveJSProperty('naturalWidth', 180)
  const close = qr.getByRole('button', { name: '收起二维码' })
  await expect(close).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(qr).toBeHidden()
  await expect(dialog).toBeVisible()
  await expect(open).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

test('an acknowledgement in a newer tab closes older automatic notes without replaying history', async ({ page, context }) => {
  await expect(page.getByRole('dialog', { name: RELEASE_NOTES_TITLE })).toBeVisible()
  const newerTab = await context.newPage()
  await bootInstalledLiangxiang(newerTab, { releaseNotesSeen: false })
  await newerTab.evaluate(key => localStorage.setItem(key, '99.0.0'), RELEASE_NOTES_LATEST_SEEN_KEY)
  await expect(page.locator('[data-liangxiang-release-notes]')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('[data-liangxiang-root]')).toBeVisible()
  await expect(page.locator('[data-liangxiang-release-notes]')).toHaveCount(0)
  await newerTab.close()
})
