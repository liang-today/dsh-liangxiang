import { describe, expect, it, vi } from 'vitest'
import type { DshHostContext } from '../src/compat/dsh/host-context.ts'
import { apply, name } from '../src/host/index.ts'

/** Minimal ctx.effect fake: runs the callback eagerly, collects disposers. */
function fakeHostContext(): { ctx: DshHostContext; disposers: Array<() => void> } {
  const disposers: Array<() => void> = []
  const fake = {
    effect(callback: () => () => void): void {
      disposers.push(callback())
    },
  }
  // Unsafe cast, documented: the fake covers exactly the one Context member
  // (`effect`) the skeleton host half touches; anything else throwing is the
  // desired failure mode.
  return { ctx: fake as unknown as DshHostContext, disposers }
}

describe('host half skeleton', () => {
  it('exports the plugin display name', () => {
    expect(name).toBe('liangbiao')
  })

  it('installs exactly one lifecycle effect whose disposer runs cleanly', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const { ctx, disposers } = fakeHostContext()
    apply(ctx)
    expect(disposers).toHaveLength(1)
    expect(log).toHaveBeenCalledWith('[dsh-liangbiao] host half active')
    disposers[0]?.()
    expect(log).toHaveBeenCalledWith('[dsh-liangbiao] host half disposed')
    log.mockRestore()
  })
})
