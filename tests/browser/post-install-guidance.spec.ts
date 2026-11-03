import { expect, test, type Page } from '@playwright/test'
import { RELEASE_NOTES_ITEMS, RELEASE_NOTES_TITLE } from '../../src/client/release-notes.ts'
import { AUTHORITY_MODE_ACTION_HEADER, AUTHORITY_MODE_ACTION_VALUE } from '../../src/shared/index.ts'
import { DAY_END_ACTION_HEADER, DAY_END_ACTION_VALUE } from '../../src/shared/day-end.ts'
import { bootInstalledLiangxiang, openPanel } from './helpers.ts'

const welcomeSelector = '[data-liangxiang-welcome]'
const notesSelector = '[data-liangxiang-release-notes]'

function hasLoopbackBackend(): boolean {
  try {
    const url = new URL(process.env.LIANGXIANG_SMOKE_BACKEND_URL ?? '')
    return ['http:', 'https:'].includes(url.protocol)
      && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  } catch { return false }
}

test.afterAll(async ({ browser }) => {
  const baseURL = process.env.LIANGXIANG_BROWSER_BASE_URL
  if (baseURL === undefined) throw new Error('A temporary DSH test Host is required')
  const context = await browser.newContext({ baseURL })
  try {
    // These fixtures share one temporary Host with the remaining browser suite.
    // Always hand it back in local mode with the opt-in daily action disabled.
    const mode = await context.request.post('/liangxiang/api/mode', {
      headers: { [AUTHORITY_MODE_ACTION_HEADER]: AUTHORITY_MODE_ACTION_VALUE }, data: { mode: 'local' },
    })
    expect(mode.ok()).toBe(true)
    const dayEnd = await context.request.post('/liangxiang/api/day-end', {
      headers: { [DAY_END_ACTION_HEADER]: DAY_END_ACTION_VALUE }, data: { enabled: false, voteType: 'up' },
    })
    expect(dayEnd.ok()).toBe(true)
  } finally { await context.close() }
})

function recordActions(page: Page): Array<{ path: string, body: string }> {
  const actions: Array<{ path: string, body: string }> = []
  page.on('request', request => {
    const path = new URL(request.url()).pathname
    if (request.method() === 'POST' && /^\/liangxiang\/api\/(?:mode|vote|day-end)$/.test(path)) {
      actions.push({ path, body: request.postData() ?? '' })
    }
  })
  return actions
}

test('a fresh install waits through prolonged idle and reload for an explicit mode choice', async ({ page }) => {
  const actions = recordActions(page)
  await bootInstalledLiangxiang(page, { seedPreferences: false })
  const welcome = page.locator(welcomeSelector)
  await expect(welcome).toBeVisible()
  await expect(welcome.locator('[data-liangxiang-welcome-online]')).toBeVisible()
  await expect(welcome.locator('[data-liangxiang-welcome-local]')).toBeVisible()
  await expect(page.locator(notesSelector)).toHaveCount(0)

  // Advance browser time without slowing the suite or changing the Host clock.
  // A welcome countdown would incorrectly submit a mode intent in this window.
  await page.clock.install()
  await page.clock.fastForward(120_000)
  await expect(welcome).toBeVisible()
  expect(actions).toEqual([])
  await page.reload()
  await expect(welcome).toBeVisible()
  await expect(page.locator(notesSelector)).toHaveCount(0)
  expect(actions).toEqual([])
})

for (const mode of ['online', 'local'] as const) {
  test(`an explicit ${mode} choice survives reload and a new tab without repeating guidance`, async ({ page }) => {
    test.skip(mode === 'online' && !hasLoopbackBackend(), 'Online guidance needs an explicit loopback LIANGXIANG_SMOKE_BACKEND_URL fixture')
    const actions = recordActions(page)
    await bootInstalledLiangxiang(page, { seedPreferences: false })
    const before = await page.request.get('/liangxiang/api/state').then(response => response.json())
    const selection = page.waitForResponse(response => response.request().method() === 'POST'
      && response.url().endsWith('/liangxiang/api/mode'))
    await page.locator(`[data-liangxiang-welcome-${mode}]`).click()
    expect((await selection).ok()).toBe(true)
    await expect(page.locator(welcomeSelector)).toHaveCount(0)

    const notes = page.getByRole('dialog', { name: RELEASE_NOTES_TITLE })
    await expect(notes).toBeVisible()
    await expect(notes.locator('[data-liangxiang-release-notes-items] > li')).toHaveText([...RELEASE_NOTES_ITEMS])
    await expect(notes.locator('[data-liangxiang-release-notes-qq-qrcode]')).toBeVisible()
    for (const handle of ['@XChen446', '@Ritanlisa', '@xunxiaoQ']) {
      await expect(notes.locator('[data-liangxiang-release-notes-thanks]')).toContainText(handle)
    }
    await expect.poll(() => notes.evaluate(element => element.scrollTop)).toBe(0)
    await notes.focus()
    await page.keyboard.press('Tab')
    const dismiss = notes.getByRole('button', { name: '知道了', exact: true })
    await expect(dismiss).toBeFocused()
    await dismiss.press('Enter')
    await expect(notes).toHaveCount(0)

    const expectedAuthority = mode === 'online' ? 'DEV_STAGING_ONLY' : 'LOCAL_FAKE_DEV'
    await expect.poll(() => page.request.get('/liangxiang/api/state').then(response => response.json())
      .then(state => state.authorityMode)).toBe(expectedAuthority)
    const panel = await openPanel(page)
    await panel.locator('[data-liangxiang-utility-trigger]').click()
    const dayEnd = panel.locator('[data-liangxiang-utility-action="day-end"]')
    await expect(dayEnd).toHaveAttribute('aria-pressed', 'false')
    await expect(dayEnd).toContainText('已关闭')
    await dayEnd.hover()
    const hint = panel.locator('[data-liangxiang-day-end-hint]')
    await expect(hint).toBeVisible()
    await expect(hint).toContainText('23:59')
    await expect(hint).toContainText(/右键夯\s*\/\s*拉/)

    await page.reload()
    await expect(page.locator('[data-liangxiang-root]')).toBeVisible()
    await expect(page.locator(welcomeSelector)).toHaveCount(0)
    await expect(page.locator(notesSelector)).toHaveCount(0)
    const other = await page.context().newPage()
    try {
      await other.goto('/')
      await expect(other.locator('[data-liangxiang-root]')).toBeVisible()
      await expect(other.locator(welcomeSelector)).toHaveCount(0)
      await expect(other.locator(notesSelector)).toHaveCount(0)
      await openPanel(other)
    } finally { await other.close() }
    const after = await page.request.get('/liangxiang/api/state').then(response => response.json())
    expect(after.authorityMode).toBe(expectedAuthority)
    expect(after.dayEnd).toMatchObject({ enabled: false, voteType: 'up', available: true })
    // Guidance never votes or silently enables day-end; the one explicit mode
    // choice is the only authority mutation sent by these browser interactions.
    expect(actions).toEqual([{ path: '/liangxiang/api/mode', body: JSON.stringify({ mode }) }])
    if (before.authorityMode === expectedAuthority) {
      expect(after.personal.usedIncenseToday).toBe(before.personal.usedIncenseToday)
      expect(after.personal.remainingIncense).toBe(before.personal.remainingIncense)
    }
  })
}

test('already-open tabs share completed welcome and version guidance without another authority choice', async ({ page }) => {
  const actions = recordActions(page)
  await bootInstalledLiangxiang(page, { seedPreferences: false })
  const other = await page.context().newPage()
  const otherActions = recordActions(other)
  try {
    await other.goto('/')
    await expect(other.locator(welcomeSelector)).toBeVisible()
    await page.locator('[data-liangxiang-welcome-local]').click()
    await expect(page.locator(notesSelector)).toBeVisible()
    await expect(other.locator(welcomeSelector)).toHaveCount(0)
    await expect(other.locator(notesSelector)).toBeVisible()
    await page.locator(notesSelector).getByRole('button', { name: '知道了', exact: true }).click()
    await expect(page.locator(notesSelector)).toHaveCount(0)
    await expect(other.locator(notesSelector)).toHaveCount(0)
    expect([...actions, ...otherActions]).toEqual([{ path: '/liangxiang/api/mode', body: JSON.stringify({ mode: 'local' }) }])
  } finally { await other.close() }
})

test('dismissed version guidance can be reopened from the drawer and closed with Escape', async ({ page }) => {
  const actions = recordActions(page)
  await bootInstalledLiangxiang(page)
  const panel = await openPanel(page)
  await expect(page.locator(notesSelector)).toHaveCount(0)
  await panel.locator('[data-liangxiang-utility-trigger]').click()
  const version = panel.locator('[data-liangxiang-utility-action="version"]')
  await version.focus()
  await version.press('Enter')
  const notes = page.getByRole('dialog', { name: RELEASE_NOTES_TITLE })
  await expect(notes).toBeVisible()
  await expect.poll(() => notes.evaluate(element => element.scrollTop)).toBe(0)
  await expect(notes).toContainText('23:59')
  await page.keyboard.press('Escape')
  await expect(notes).toHaveCount(0)
  await expect(panel).toBeVisible()
  expect(actions).toEqual([])
})
