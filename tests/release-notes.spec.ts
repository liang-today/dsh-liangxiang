import { describe, expect, it } from 'vitest'
import { PLUGIN_VERSION } from '../src/shared/index.ts'
import {
  RELEASE_NOTES_ITEMS,
  RELEASE_NOTES_QQ,
  RELEASE_NOTES_THANKS,
  RELEASE_NOTES_VERSION,
  hasSeenReleaseNotes,
  markReleaseNotesSeen,
  releaseNotesStorageKey,
} from '../src/client/release-notes.ts'

describe('version-scoped release notes', () => {
  it('must be refreshed whenever the client version changes', () => {
    expect(RELEASE_NOTES_VERSION).toBe(PLUGIN_VERSION)
    expect(RELEASE_NOTES_ITEMS.length).toBeGreaterThanOrEqual(5)
    expect(RELEASE_NOTES_QQ).toContain('453683905')
    expect(RELEASE_NOTES_THANKS).toContain('@xunxiaoQ')
  })

  it('shows once for each version without becoming an authority record', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    }
    expect(hasSeenReleaseNotes('1.1.1', storage)).toBe(false)
    markReleaseNotesSeen('1.1.1', storage)
    expect(values.get(releaseNotesStorageKey('1.1.1'))).toBe('seen')
    expect(hasSeenReleaseNotes('1.1.1', storage)).toBe(true)
    expect(hasSeenReleaseNotes('1.1.2', storage)).toBe(false)
  })
})
