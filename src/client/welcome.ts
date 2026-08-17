/**
 * First-run welcome gate (cosmetic, localStorage only — never an authority).
 * Shows the online/local chooser once, then never again on this browser.
 * Choosing local also asks the Host to switch; the Host is the authority.
 */
const WELCOME_KEY = 'liangxiang:welcome:v2'
const AUTHORITY_KEY = 'liangxiang:authority:v1'

export const WELCOME_TIMEOUT_SECONDS = 10

export type StoredAuthorityPreference = 'online' | 'local'

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

export function loadAuthorityPreference(): StoredAuthorityPreference | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(AUTHORITY_KEY)
    if (raw === 'online' || raw === 'local') return raw
    return null
  } catch {
    return null
  }
}

export function saveAuthorityPreference(mode: StoredAuthorityPreference): void {
  try {
    localStorage.setItem(AUTHORITY_KEY, mode)
  } catch {
    /* ignore */
  }
}
