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
    expect(RELEASE_NOTES_ITEMS.length).toBeGreaterThanOrEqual(3)
    expect(RELEASE_NOTES_ITEMS.length).toBeLessThanOrEqual(4)
    expect(RELEASE_NOTES_ITEMS.join('\n')).not.toMatch(/SQLite|migration|回归测试|安全更新|schema/i)
    expect(RELEASE_NOTES_QQ).toContain('453683905')
    expect(RELEASE_NOTES_THANKS).toContain('@xunxiaoQ')
  })

  it('shows once for each version without becoming an authority record', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    }
    expect(hasSeenReleaseNotes('1.1.2', storage)).toBe(false)
    markReleaseNotesSeen('1.1.2', storage)
    expect(values.get(releaseNotesStorageKey('1.1.2'))).toBe('seen')
    expect(hasSeenReleaseNotes('1.1.2', storage)).toBe(true)
    expect(hasSeenReleaseNotes('1.1.3', storage)).toBe(false)
  })
})
