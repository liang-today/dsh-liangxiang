import { describe, expect, it } from 'vitest'
import { deriveLocalEpithet, recordLocalEpithetVote } from '../src/domain/index.ts'
import { LOCAL_EPITHET_STORAGE_KEY, readLocalEpithet, rememberLocalEpithetVote } from '../src/client/local-epithet-store.ts'
import { formatLocalEpithetLine } from '../src/shared/index.ts'

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial))
  return {
    get length() { return data.size },
    clear() { data.clear() },
    getItem(key: string) { return data.get(key) ?? null },
    setItem(key: string, value: string) { data.set(key, value) },
    removeItem(key: string) { data.delete(key) },
    key(index: number) { return [...data.keys()][index] ?? null },
  }
}

describe('local-only 梁号', () => {
  it('starts as 旁观 • 闲梁 before any stick is spent', () => {
    expect(deriveLocalEpithet({ up: 0, down: 0 })).toEqual({
      dedication: '旁观',
      stance: '闲梁',
      label: '旁观 • 闲梁',
      spent: 0,
    })
    expect(formatLocalEpithetLine('焚尽', '死夯梁')).toBe('小梁号：焚尽 • 死夯梁')
  })

  it('stacks dedication and stance from local 夯/拉 counts', () => {
    expect(deriveLocalEpithet({ up: 20, down: 0 }).label).toBe('勤香 • 死夯梁')
    expect(deriveLocalEpithet({ up: 1, down: 18 }).label).toBe('日课 • 死拉梁')
    expect(deriveLocalEpithet({ up: 10, down: 9 }).label).toBe('日课 • 骑墙梁')
    expect(deriveLocalEpithet({ up: 70, down: 20 }).label).toBe('倾炉 • 铁夯梁')
    expect(deriveLocalEpithet({ up: 160, down: 80 }).label).toBe('焚尽 • 偏夯梁')
    expect(deriveLocalEpithet({ up: 30, down: 270 }).label).toBe('香疯 • 死拉梁')
  })

  it('records a dump onto the matching side', () => {
    const after = recordLocalEpithetVote({ up: 2, down: 1 }, 'up', 12)
    expect(after).toEqual({ up: 14, down: 1 })
    expect(recordLocalEpithetVote(after, 'down', 0)).toEqual(after)
  })

  it('clears with the business date the same way incense does', () => {
    const storage = memoryStorage()
    const yesterday = rememberLocalEpithetVote('up', 20, '2026-08-23', storage)
    expect(yesterday.label).toBe('勤香 • 死夯梁')
    expect(readLocalEpithet('2026-08-23', storage).label).toBe('勤香 • 死夯梁')
    expect(readLocalEpithet('2026-08-24', storage)).toMatchObject({ spent: 0, label: '旁观 • 闲梁' })
    expect(rememberLocalEpithetVote('down', 1, '2026-08-24', storage)).toMatchObject({
      spent: 1,
      dedication: '试手',
      stance: '死拉梁',
    })
  })

  it('ignores a stored row that has no business date', () => {
    const storage = memoryStorage({
      [LOCAL_EPITHET_STORAGE_KEY]: JSON.stringify({ up: 90, down: 10 }),
    })
    expect(readLocalEpithet('2026-08-24', storage).spent).toBe(0)
  })
})
