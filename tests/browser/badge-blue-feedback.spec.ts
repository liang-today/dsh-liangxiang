import { expect, test } from '@playwright/test'
import { badgeSelector, bootInstalledLiangxiang } from './helpers.ts'

test('badge speech and its hint use the blue palette when DSH appearance overrides the OS', async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await bootInstalledLiangxiang(page)
  const badge = page.locator(badgeSelector)
  const mutations: string[] = []
  page.on('request', request => {
    const path = new URL(request.url()).pathname
    if (request.method() === 'POST' && /\/liangxiang\/api\/(?:vote|mode|reconcile|market\/position)$/.test(path)) mutations.push(path)
  })

  for (const dark of [false, true]) {
    await page.getByRole('button', { name: 'Account menu', exact: true }).click()
    await page.getByRole('menuitem', { name: /^(Settings|设置)/ }).click()
    const settings = page.getByRole('dialog', { name: /^(Settings|设置)$/ })
    await settings.getByRole('button', { name: dark ? /^(Dark|深色)$/ : /^(Light|浅色)$/ }).click()
    await settings.getByRole('button', { name: /^(Close|关闭)$/ }).click()
    await expect(page.locator('html')).toHaveCSS('color-scheme', dark ? 'dark' : 'light')
    expect(await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(false)

    const box = (await badge.boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForTimeout(60)
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    const line = page.locator('[data-liangxiang-danmu-row][data-exiting="false"] [data-liangxiang-danmu-line]').first()
    await expect(line).toBeVisible()
    await expect(badge).toHaveAttribute('aria-expanded', 'false')
    const paint = await line.evaluate(element => {
      const context = document.createElement('canvas').getContext('2d')!
      const rgb = (value: string): number[] => {
        context.clearRect(0, 0, 1, 1); context.fillStyle = value; context.fillRect(0, 0, 1, 1)
        return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3)
      }
      const luminance = (values: number[]): number => values.map(value => {
        const channel = value / 255
        return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4
      }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0)
      const style = getComputedStyle(element), foreground = rgb(style.color), background = rgb(style.backgroundColor)
      const hint = rgb(getComputedStyle(document.querySelector('[data-liangxiang-badge-tooltip]')!).backgroundColor)
      const first = luminance(foreground), second = luminance(background)
      return { foreground, background, hint, contrast: (Math.max(first, second) + .05) / (Math.min(first, second) + .05),
        opacity: getComputedStyle(element.parentElement!).opacity }
    })
    for (const channels of [paint.foreground, paint.background, paint.hint]) expect(channels[2]!).toBeGreaterThan(channels[0]!)
    if (dark) expect(Math.max(...paint.background)).toBeLessThan(100)
    else expect(Math.min(...paint.background)).toBeGreaterThan(200)
    expect(paint.contrast).toBeGreaterThanOrEqual(4.5)
    expect(paint.opacity).toBe('1')
    await page.screenshot({ path: testInfo.outputPath(`badge-blue-${dark ? 'dark' : 'light'}.png`) })
  }
  expect(mutations).toEqual([])
})
