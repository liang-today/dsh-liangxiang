import AxeBuilder from '@axe-core/playwright'
import { expect, test, type TestInfo } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import {
  axeSummary,
  bootInstalledLiangxiang,
  openLiangci,
  openPanel,
  panelSelector,
  waitForSettledAnimations,
} from './helpers.ts'

async function attachAxeViolations(
  testInfo: TestInfo,
  surface: 'panel' | 'liangci',
  violations: unknown[],
): Promise<void> {
  const path = join(
    testInfo.project.outputDir,
    'axe',
    `${testInfo.project.name}-${surface}.json`,
  )
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(violations, null, 2)}\n`, 'utf8')
  await testInfo.attach(`axe-${surface}.json`, {
    path,
    contentType: 'application/json',
  })
}

test.beforeEach(async ({ page }) => {
  await bootInstalledLiangxiang(page)
})

test('panel has no WCAG A/AA axe violations', async ({ page }, testInfo) => {
  const panel = await openPanel(page)
  await waitForSettledAnimations(panel)
  const results = await new AxeBuilder({ page })
    .include(panelSelector)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()

  await attachAxeViolations(testInfo, 'panel', results.violations)
  expect(results.violations, axeSummary(results.violations)).toEqual([])
})

test('梁祠 has no WCAG A/AA axe violations', async ({ page }, testInfo) => {
  const dialog = await openLiangci(page)
  await waitForSettledAnimations(dialog)
  const results = await new AxeBuilder({ page })
    .include('[data-liangci-dialog]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()

  await attachAxeViolations(testInfo, 'liangci', results.violations)
  expect(results.violations, axeSummary(results.violations)).toEqual([])
})
