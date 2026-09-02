import { expect, test, type Locator, type TestInfo } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import {
  bootInstalledLiangxiang,
  openLiangci,
  openPanel,
} from './helpers.ts'

interface Box {
  x: number
  y: number
  width: number
  height: number
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  return box as Box
}

function expectInsideViewport(box: Box, viewport: { width: number, height: number }): void {
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
}

async function attachScreenshot(locator: Locator, name: string, testInfo: TestInfo): Promise<void> {
  const path = join(
    testInfo.project.outputDir,
    'screenshots',
    `${testInfo.project.name}-${name}`,
  )
  await mkdir(dirname(path), { recursive: true })
  await locator.screenshot({ animations: 'disabled', path })
  await testInfo.attach(`${testInfo.project.name}-${name}`, { path, contentType: 'image/png' })
}

test.beforeEach(async ({ page }) => {
  await bootInstalledLiangxiang(page)
})

test('panel stays centered, aligned, and on-screen at desktop and narrow widths', async ({ page }, testInfo) => {
  const viewport = page.viewportSize()
  expect(viewport).not.toBeNull()
  const panel = await openPanel(page)
  await panel.evaluate(element => Promise.all(
    element.getAnimations().map(animation => animation.finished.catch(() => undefined)),
  ))
  const panelBox = await boxOf(panel)
  expectInsideViewport(panelBox, viewport as { width: number, height: number })
  expect(panelBox.width).toBeGreaterThanOrEqual(255)
  expect(panelBox.width).toBeLessThanOrEqual(257)

  const regions = ['case', 'core', 'vote', 'social'].map(name =>
    panel.locator(`[data-liangxiang-region="${name}"]`))
  const regionBoxes = await Promise.all(regions.map(boxOf))
  for (let index = 1; index < regionBoxes.length; index += 1) {
    expect(regionBoxes[index]?.y).toBeGreaterThanOrEqual(regionBoxes[index - 1]?.y ?? 0)
  }

  const anchorBox = await boxOf(panel.locator('[data-liangxiang-core-anchor]'))
  const panelCenter = panelBox.x + panelBox.width / 2
  const anchorCenter = anchorBox.x + anchorBox.width / 2
  expect(Math.abs(panelCenter - anchorCenter)).toBeLessThanOrEqual(1.5)

  const upBox = await boxOf(panel.locator('[data-liangxiang-vote="up"]'))
  const downBox = await boxOf(panel.locator('[data-liangxiang-vote="down"]'))
  expect(Math.abs(upBox.width - downBox.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(upBox.y - downBox.y)).toBeLessThanOrEqual(1)

  await attachScreenshot(panel, 'panel.png', testInfo)
})

test('梁祠 remains within the viewport and uses contained horizontal scrolling when narrow', async ({ page }, testInfo) => {
  const viewport = page.viewportSize()
  expect(viewport).not.toBeNull()
  const dialog = await openLiangci(page)
  const dialogBox = await boxOf(dialog)
  expectInsideViewport(dialogBox, viewport as { width: number, height: number })

  const scroll = dialog.locator('[data-liangci-scroll]')
  await expect(scroll).toBeVisible()
  const dimensions = await scroll.evaluate(element => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }))
  if (testInfo.project.name.includes('narrow')) {
    expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth)
  } else {
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1)
  }

  await attachScreenshot(dialog, 'liangci.png', testInfo)
})
