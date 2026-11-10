import { afterEach, expect, it, vi } from 'vitest'
import { updateLocalStats } from '../src/client/local-stat-lock.ts'
afterEach(() => vi.unstubAllGlobals())

it('keeps all cosmetic read-modify-write callbacks inside the same browser lock', async () => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let tail = gate
  const names: string[] = []
  vi.stubGlobal('navigator', { locks: { request(name: string, update: () => void) {
    names.push(name)
    const next = tail.then(update)
    tail = next
    return next
  } } })
  let stored = 0
  const first = updateLocalStats(() => { const read = stored; stored = read + 1 })
  const second = updateLocalStats(() => { const read = stored; stored = read + 1 })
  expect(stored).toBe(0)
  expect(new Set(names).size).toBe(1)
  release(); await Promise.all([first, second])
  expect(stored).toBe(2)
})

it('does not repeat an update outside the lock when lock acquisition fails', async () => {
  const update = vi.fn()
  vi.stubGlobal('navigator', { locks: { request: async () => { throw new Error('lock unavailable') } } })
  await expect(updateLocalStats(update)).rejects.toThrow('lock unavailable')
  expect(update).not.toHaveBeenCalled()
})

it('retains the compatible once-only fallback without Web Locks', async () => {
  const update = vi.fn()
  vi.stubGlobal('navigator', {})
  await updateLocalStats(update)
  expect(update).toHaveBeenCalledOnce()
})
