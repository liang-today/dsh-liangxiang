import { describe, expect, it } from 'vitest'
import { PLUGIN_VERSION } from '../src/shared/index.ts'
import {
  RELEASE_NOTES_ITEMS,
  RELEASE_NOTES_QQ,
  RELEASE_NOTES_THANKS,
  RELEASE_NOTES_VERSION,
  RELEASE_NOTES_LATEST_SEEN_KEY,
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

  it('skips unseen intermediate releases after reading the latest, without suppressing a future release', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    }
    markReleaseNotesSeen('1.1.0', storage)
    expect(hasSeenReleaseNotes('1.3.0', storage)).toBe(false)
    markReleaseNotesSeen('1.3.0', storage)
    expect(hasSeenReleaseNotes('1.2.0', storage)).toBe(true)
    expect(hasSeenReleaseNotes('1.4.0', storage)).toBe(false)
    markReleaseNotesSeen('1.2.0', storage) // an older open tab must not rewind it
    expect(values.get(RELEASE_NOTES_LATEST_SEEN_KEY)).toBe('1.3.0')
  })

  it('orders prereleases numerically and preserves legacy per-version acknowledgements', () => {
    const values = new Map([[releaseNotesStorageKey('1.1.6'), 'seen']])
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) }
    expect(hasSeenReleaseNotes('1.1.6', storage)).toBe(true)
    markReleaseNotesSeen('1.2.1-beta.10', storage)
    expect(hasSeenReleaseNotes('1.2.1-beta.2', storage)).toBe(true)
    expect(hasSeenReleaseNotes('1.2.1-rc.1', storage)).toBe(false)
    expect(hasSeenReleaseNotes('1.2.1', storage)).toBe(false)
    markReleaseNotesSeen('1.2.1', storage)
    expect(hasSeenReleaseNotes('1.2.1-rc.1', storage)).toBe(true)
    expect(hasSeenReleaseNotes('1.2.10', storage)).toBe(false)
  })

  it('ignores invalid latest markers and fails safely when cosmetic storage is blocked', () => {
    const storage = { getItem: (key: string) => key === RELEASE_NOTES_LATEST_SEEN_KEY ? 'invalid' : null, setItem: () => { throw new Error('blocked') } }
    expect(hasSeenReleaseNotes('1.2.0', storage)).toBe(false)
    expect(() => markReleaseNotesSeen('1.2.0', storage)).not.toThrow()
    expect(hasSeenReleaseNotes('1.2.0', { getItem: () => { throw new Error('blocked') } })).toBe(true)
  })
})
