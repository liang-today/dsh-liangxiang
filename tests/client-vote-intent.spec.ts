/**
 * The vote handler attaches its success/failure handlers and a `.finally` that
 * releases the in-flight lock. Issue #26 showed that a synchronous throw inside
 * the store bypassed all of them; these tests pin the deferral that fixes it.
 */
import { describe, expect, it } from 'vitest'
import { startVoteIntent } from '../src/client/vote-intent.ts'

describe('vote intent start', () => {
  it('passes a resolved vote through', async () => {
    await expect(startVoteIntent(async () => 'accepted')).resolves.toBe('accepted')
  })

  it('turns a synchronous throw into a rejection instead of throwing at the caller', async () => {
    const failure = new TypeError('crypto.randomUUID is not a function')
    let started: Promise<never> | null = null
    expect(() => {
      started = startVoteIntent<never>(() => {
        throw failure
      })
    }).not.toThrow()
    if (started === null) throw new Error('startVoteIntent did not return a promise')
    await expect(started).rejects.toBe(failure)
  })

  it('still releases the caller lock after a synchronous throw', async () => {
    let released = false
    await startVoteIntent<never>(() => {
      throw new Error('crypto.randomUUID is not a function')
    })
      .finally(() => {
        released = true
      })
      .catch(() => undefined)
    expect(released).toBe(true)
  })
})
