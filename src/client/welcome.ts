/**
 * First-run welcome gate (cosmetic, localStorage only — never an authority).
 * Shows three plain-language lines once, then never again on this browser.
 */
const KEY = 'liangbiao:welcome:v1'

export function hasSeenWelcome(): boolean {
  try {
    return typeof localStorage === 'undefined' || localStorage.getItem(KEY) === 'seen'
  } catch {
    return true
  }
}

export function markWelcomeSeen(): void {
  try {
    localStorage.setItem(KEY, 'seen')
  } catch {
    /* ignore */
  }
}
