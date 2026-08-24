import { describe, expect, it } from 'vitest'
import {
  deriveLocalIncenseStats,
  formatIncenseShare,
  recordLocalIncenseVote,
  rollLocalIncenseDay,
} from '../src/domain/index.ts'
import { LOCAL_EPITHET_STORAGE_KEY } from '../src/client/local-epithet-store.ts'
import {
  LOCAL_INCENSE_STORAGE_KEY,
  readLocalIncenseStats,
  rememberLocalIncenseVote,
} from '../src/client/local-incense-store.ts'

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

describe('local incense ledger', () => {
  it('accumulates today and lifetime on the matching side', () => {
    const after = recordLocalIncenseVote({
      lifetimeUp: 10,
      lifetimeDown: 2,
      todayUp: 1,
      todayDown: 0,
    }, 'up', 3)
    expect(after).toEqual({
      lifetimeUp: 13,
      lifetimeDown: 2,
      todayUp: 4,
      todayDown: 0,
    })
    expect(deriveLocalIncenseStats(after).today).toMatchObject({ total: 4, upShare: '100%' })
  })

  it('clears only today when the business date rolls', () => {
    const rolled = rollLocalIncenseDay({
      lifetimeUp: 20,
      lifetimeDown: 5,
      todayUp: 4,
      todayDown: 1,
    })
    expect(rolled).toEqual({
      lifetimeUp: 20,
      lifetimeDown: 5,
      todayUp: 0,
      todayDown: 0,
    })
  })

  it('formats a share of 三界香火 without inventing a 梁位 delta', () => {
    expect(formatIncenseShare(0, 0)).toBe('--')
    expect(formatIncenseShare(0, 100)).toBe('0%')
    expect(formatIncenseShare(12, 12_846)).toBe('0.09%')
    expect(formatIncenseShare(80, 100)).toBe('80%')
  })

  it('persists lifetime across a new business date', () => {
    const storage = memoryStorage()
    rememberLocalIncenseVote('up', 8, '2026-08-23', storage)
    rememberLocalIncenseVote('down', 2, '2026-08-23', storage)
    expect(readLocalIncenseStats('2026-08-24', storage)).toMatchObject({
      today: { total: 0, up: 0, down: 0 },
      lifetime: { total: 10, up: 8, down: 2 },
    })
    expect(rememberLocalIncenseVote('up', 1, '2026-08-24', storage).lifetime.total).toBe(11)
  })

  it('promotes an existing 梁小号 row into the first lifetime ledger', () => {
    const storage = memoryStorage({
      [LOCAL_EPITHET_STORAGE_KEY]: JSON.stringify({ up: 6, down: 4, businessDate: '2026-08-24' }),
    })
    expect(readLocalIncenseStats('2026-08-24', storage)).toMatchObject({
      today: { total: 10, up: 6, down: 4, upShare: '60%' },
      lifetime: { total: 10, up: 6, down: 4 },
    })
    expect(storage.getItem(LOCAL_INCENSE_STORAGE_KEY)).not.toBeNull()
  })
})
