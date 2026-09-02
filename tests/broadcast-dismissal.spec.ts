import { describe, expect, it } from 'vitest'
import {
  DISMISSED_BROADCAST_STORAGE_KEY,
  loadDismissedBroadcastId,
  markBroadcastDismissed,
} from '../src/client/broadcast-dismissal.ts'

describe('per-browser broadcast dismissal', () => {
  it('remembers only the dismissed broadcast ID so a new notice can appear', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    }

    expect(loadDismissedBroadcastId(storage)).toBeNull()
    markBroadcastDismissed('broadcast-old', storage)
    expect(values.get(DISMISSED_BROADCAST_STORAGE_KEY)).toBe('broadcast-old')
    expect(loadDismissedBroadcastId(storage)).toBe('broadcast-old')
    expect(loadDismissedBroadcastId(storage)).not.toBe('broadcast-new')
  })

  it('treats blocked cosmetic storage as a harmless no-op', () => {
    const storage = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
    }
    expect(loadDismissedBroadcastId(storage)).toBeNull()
    expect(() => markBroadcastDismissed('broadcast-1', storage)).not.toThrow()
  })
})
