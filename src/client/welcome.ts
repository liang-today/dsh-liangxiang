/**
 * First-run welcome gate (cosmetic, localStorage only — never an authority).
 * Shows the online/local chooser once and waits for an explicit click; there
 * is no countdown and no automatic mode selection.
 * Choosing local asks the current Host process to switch explicitly; it is
 * deliberately not persisted as a browser authority preference.
 */
const WELCOME_KEY = 'liangxiang:welcome:v2'

export function hasSeenWelcome(): boolean {
  try {
    return typeof localStorage === 'undefined'
      || localStorage.getItem(WELCOME_KEY) === 'seen'
  } catch {
    return true
  }
}

export function markWelcomeSeen(): void {
  try {
    localStorage.setItem(WELCOME_KEY, 'seen')
  } catch {
    /* ignore */
  }
}
