import { expect, type Locator, type Page } from '@playwright/test'
import { RELEASE_NOTES_VERSION } from '../../src/client/release-notes.ts'

export const badgeSelector = '[data-liangxiang-badge]'
export const panelSelector = '[data-liangxiang-panel]'
export const liangciSelector = '[data-liangci-dialog]'
const browserAuthUrl = process.env.LIANGXIANG_BROWSER_AUTH_URL

export async function bootInstalledLiangxiang(
  page: Page,
  options: { welcomeSeen?: boolean, releaseNotesSeen?: boolean } = {},
): Promise<void> {
  // The suite controls cosmetic browser preferences only. Authority is set by
  // the isolated Profile smoke before Playwright starts.
  // Apply reduced motion on the page explicitly: some DSH-created browser
  // contexts do not retain the project-level media option across token auth.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(({ welcomeSeen, releaseNotesSeen, releaseNotesVersion }) => {
    if (welcomeSeen) localStorage.setItem('liangxiang:welcome:v2', 'seen')
    else localStorage.removeItem('liangxiang:welcome:v2')
    if (releaseNotesSeen) {
      localStorage.setItem(`liangxiang:release-notes:${releaseNotesVersion}`, 'seen')
    }
    localStorage.setItem('liangxiang:panel-open:v1', '0')
    localStorage.removeItem('liangxiang:badge-position:v2')
  }, {
    welcomeSeen: options.welcomeSeen ?? true,
    releaseNotesSeen: options.releaseNotesSeen ?? true,
    releaseNotesVersion: RELEASE_NOTES_VERSION,
  })
  // Current DSH prints a process-token URL which exchanges for an HttpOnly
  // browser cookie. Older/no-auth hosts can still use the plain base URL.
  await page.goto(browserAuthUrl ?? '/')
  await expect(page.locator('[data-liangxiang-root]')).toBeVisible()
  await expect(page.locator(badgeSelector)).toBeVisible()

  // A genuinely fresh DSH profile presents its own onboarding dialogs above
  // every plugin. Dismiss them through the public UI before exercising the
  // installed Liangxiang controls; pre-seeding private DSH storage keys would
  // make this smoke depend on unstable shell implementation details.
  const dshPrompts = [
    { dialog: 'Internal Testing Notice', action: 'Continue' },
    { dialog: 'Add an API key to get started', action: 'Configure later' },
  ] as const
  for (const prompt of dshPrompts) {
    const dialog = page.getByRole('dialog', { name: prompt.dialog })
    // A fresh alpha.4 shell may mount onboarding one render after plugin
    // roots become visible. Give each known prompt a short arrival window so
    // the first cold test cannot race the shell dialog.
    const appeared = await dialog.waitFor({ state: 'visible', timeout: 3_000 })
      .then(() => true, () => false)
    if (!appeared) continue
    await dialog.getByRole('button', { name: prompt.action }).click()
    await expect(dialog).toBeHidden()
  }
}

export async function openPanel(page: Page): Promise<Locator> {
  const panel = page.locator(panelSelector)
  if (!await panel.isVisible()) {
    const badge = page.locator(badgeSelector)
    await badge.focus()
    await badge.press('Enter')
  }
  await expect(panel).toBeVisible()
  await expect(page.locator(badgeSelector)).toHaveAttribute('aria-expanded', 'true')
  return panel
}

export async function openLiangci(page: Page): Promise<Locator> {
  await openPanel(page)
  const entry = page.locator('[data-liangxiang-liangci-entry]')
  await entry.focus()
  await entry.press('Enter')
  const dialog = page.locator(liangciSelector)
  await expect(dialog).toBeVisible()
  return dialog
}

/** Sample accessibility and geometry only after translucent entry frames settle. */
export async function waitForSettledAnimations(locator: Locator): Promise<void> {
  await locator.evaluate(async (element) => {
    const animations = element.getAnimations({ subtree: true })
    await Promise.all(animations.map(async animation => animation.finished.catch(() => undefined)))
  })
}

export function axeSummary(violations: Array<{ id: string, impact?: string | null, nodes: unknown[] }>): string {
  return violations
    .map(item => `${item.id} (${item.impact ?? 'unknown'}, ${item.nodes.length} nodes)`)
    .join(', ')
}
