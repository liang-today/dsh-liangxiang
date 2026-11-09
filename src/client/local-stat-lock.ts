/** Cosmetic browser stats only; never a wallet lock. */
export function updateLocalStats(update: () => void): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.locks !== undefined) {
    return navigator.locks.request('liangxiang:local-stats', update)
  }
  update()
  return Promise.resolve()
}
