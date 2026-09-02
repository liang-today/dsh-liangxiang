/**
 * Per-browser acknowledgement for the one active Liangxiang broadcast.
 *
 * This is cosmetic only: it never mutates the server broadcast or any
 * identity/incense authority. Remembering one ID is sufficient because the
 * backend exposes at most one active broadcast; a newly-issued ID appears
 * normally even when the previous message was dismissed.
 */
export const DISMISSED_BROADCAST_STORAGE_KEY = 'liangxiang:broadcast-dismissed:v1'

export function loadDismissedBroadcastId(
  storage?: Pick<Storage, 'getItem'> | null,
): string | null {
  try {
    const store = storage === undefined
      ? (typeof localStorage === 'undefined' ? null : localStorage)
      : storage
    const value = store?.getItem(DISMISSED_BROADCAST_STORAGE_KEY)?.trim()
    return value === undefined || value === '' ? null : value
  } catch {
    return null
  }
}

export function markBroadcastDismissed(
  broadcastId: string,
  storage?: Pick<Storage, 'setItem'> | null,
): void {
  if (broadcastId.trim() === '') return
  try {
    const store = storage === undefined
      ? (typeof localStorage === 'undefined' ? null : localStorage)
      : storage
    store?.setItem(
      DISMISSED_BROADCAST_STORAGE_KEY,
      broadcastId,
    )
  } catch {
    /* A cosmetic dismissal must never break the voting panel. */
  }
}
