import { expect, test, type Locator, type Page } from '@playwright/test'
import { bootInstalledLiangxiang, openLiangci, openPanel, waitForSettledAnimations } from './helpers.ts'

function colorChannels(css: string): number[] {
  const values = (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
  return css.startsWith('color(srgb ') ? values.map(value => value * 255) : values
}

async function expectInkInside(locator: Locator): Promise<void> {
  const overflow = await locator.evaluate(element => {
    const box = element.getBoundingClientRect(), escaped: string[] = []
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      const parent = text.parentElement
      if (!parent || !text.textContent?.trim()) continue
      const style = getComputedStyle(parent)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      const range = document.createRange(); range.selectNodeContents(text)
      for (const ink of range.getClientRects()) {
        if (ink.width && (ink.left < box.left - 1 || ink.right > box.right + 1 || ink.top < box.top - 1 || ink.bottom > box.bottom + 1)) {
          escaped.push(text.textContent.trim())
        }
      }
    }
    return escaped
  })
  expect(overflow).toEqual([])
}

function watchBusinessMutations(page: Page): string[] {
  const sent: string[] = []
  page.on('request', request => {
    const path = new URL(request.url()).pathname
    if (request.method() !== 'GET' && /^\/liangxiang\/api\/(?:vote|reconcile|mode|market\/position)$/.test(path)) sent.push(path)
  })
  return sent
}

test('personal incense units share a readable font and baseline without clipping either flank', async ({ page }, testInfo) => {
  const sent = watchBusinessMutations(page)
  await bootInstalledLiangxiang(page)
  const panel = await openPanel(page), units = panel.locator('[data-liangxiang-personal-unit]')
  await expect(units).toHaveCount(2)
  await expect(units).toHaveText(['炷', '量'])
  const styles = await units.evaluateAll(nodes => nodes.map(element => {
    const style = getComputedStyle(element), box = element.getBoundingClientRect()
    return { fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight,
      lineHeight: style.lineHeight, color: style.color, bottom: box.bottom }
  }))
  expect(styles[0]).toMatchObject({ fontSize: '9px', fontWeight: '500' })
  const { bottom: leftBottom, ...leftStyle } = styles[0]!
  const { bottom: rightBottom, ...rightStyle } = styles[1]!
  expect(leftStyle).toEqual(rightStyle)
  expect(Math.abs(leftBottom - rightBottom)).toBeLessThanOrEqual(1)
  for (const flank of await panel.locator('[data-liangxiang-personal]').all()) await expectInkInside(flank)
  await panel.screenshot({ path: testInfo.outputPath('blue-personal-units.png'), animations: 'disabled' })
  expect(sent).toEqual([])
})

test('compact repair row has balanced bottom spacing and confirmation fits without resizing the drawer', async ({ page }, testInfo) => {
  const sent = watchBusinessMutations(page)
  await bootInstalledLiangxiang(page)
  const panel = await openPanel(page), trigger = panel.locator('[data-liangxiang-utility-trigger]')
  await trigger.focus(); await trigger.press('Enter')
  const drawer = panel.locator('[data-liangxiang-utility-drawer]'), repair = drawer.locator('[data-liangxiang-utility-action="reconcile"]')
  await expect(drawer).toBeVisible()
  await waitForSettledAnimations(drawer)
  const original = (await drawer.boundingBox())!, repairBox = (await repair.boundingBox())!
  expect(original.height).toBe(180)
  const gap = original.y + original.height - repairBox.y - repairBox.height
  expect(gap).toBeGreaterThanOrEqual(4)
  expect(gap).toBeLessThanOrEqual(16)
  await expectInkInside(repair)
  await drawer.screenshot({ path: testInfo.outputPath('blue-compact-drawer.png'), animations: 'disabled' })
  await repair.click()
  const confirmation = drawer.locator('[data-liangxiang-reconcile-confirm]')
  await expect(confirmation).toBeVisible()
  expect((await drawer.boundingBox())!.height).toBe(original.height)
  expect(await confirmation.evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true)
  await expectInkInside(confirmation)
  await confirmation.locator('[data-liangxiang-reconcile-cancel]').click()
  await expect(confirmation).toBeHidden()
  await expect(repair).toBeFocused()
  expect((await drawer.boundingBox())!.height).toBe(original.height)
  // The mode confirmation also removes its cancel control. Keep focus inside
  // the existing drawer so a following Escape can still close it.
  const mode = drawer.locator('[data-liangxiang-utility-action="mode"]')
  await mode.click()
  const modeConfirmation = drawer.locator('[data-liangxiang-mode-confirm]')
  await expect(modeConfirmation).toBeVisible()
  expect(await modeConfirmation.evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true)
  await expectInkInside(modeConfirmation)
  await modeConfirmation.locator('[data-liangxiang-mode-cancel]').click()
  await expect(modeConfirmation).toBeHidden()
  await expect(mode).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await expect(trigger).toBeFocused()
  expect(sent).toEqual([])
})

test('blue calendar follows DSH appearance over OS light while archive selection and keyboard return stay intact', async ({ page }, testInfo) => {
  const sent = watchBusinessMutations(page)
  await bootInstalledLiangxiang(page)
  await page.emulateMedia({ colorScheme: 'light' })
  expect(await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(false)
  for (const dark of [true, false]) {
    await page.getByRole('button', { name: 'Account menu', exact: true }).click()
    await page.getByRole('menuitem', { name: /^(Settings|设置)/ }).click()
    const settings = page.getByRole('dialog', { name: /^(Settings|设置)$/ })
    await settings.getByRole('button', { name: dark ? /^(Dark|深色)$/ : /^(Light|浅色)$/ }).click()
    await settings.getByRole('button', { name: /^(Close|关闭)$/ }).click()
    await expect(page.locator('html')).toHaveCSS('color-scheme', dark ? 'dark' : 'light')
    const dialog = await openLiangci(page), detail = dialog.locator('[data-liangci-detail]')
    await expect(detail).toBeVisible()
    await expect(dialog).toHaveCSS('color-scheme', dark ? 'dark' : 'light')
    const paint = await dialog.evaluate(element => ({
      border: getComputedStyle(element).borderTopColor,
      detail: getComputedStyle(element.querySelector('[data-liangci-detail]')!).backgroundColor,
    }))
    const border = colorChannels(paint.border), paper = colorChannels(paint.detail)
    expect(border).toHaveLength(3); expect(paper).toHaveLength(3)
    expect(border[2]!).toBeGreaterThan(border[0]!)
    expect(paper[2]!).toBeGreaterThan(paper[0]!)
    if (dark) expect(Math.max(...paper)).toBeLessThan(100)
    else expect(Math.min(...paper)).toBeGreaterThan(200)
    const today = dialog.locator('[data-liangci-day-status="today"]')
    await today.focus(); await today.press('Enter')
    await expect(today).toHaveAttribute('data-selected', 'true')
    await expect(detail).toContainText('今日进行中')
    const selectedBorder = colorChannels(await today.evaluate(element => getComputedStyle(element).borderTopColor))
    expect(selectedBorder[2]!).toBeGreaterThan(selectedBorder[0]!)
    const month = dialog.locator('[data-liangci-period="month"]')
    await month.focus(); await month.press('Enter')
    await expect(month).toHaveAttribute('data-selected', 'true')
    await dialog.screenshot({ path: testInfo.outputPath(`blue-calendar-${dark ? 'dark' : 'light'}.png`), animations: 'disabled' })
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(page.locator('[data-liangxiang-liangci-entry]')).toBeFocused()
  }
  expect(sent).toEqual([])
})
