import { describe, expect, it, vi } from 'vitest'
import type { DshHostContext } from '../src/compat/dsh/host-context.ts'
import { apply, name } from '../src/host/index.ts'

/**
 * Minimal ctx fake: `effect` runs eagerly and collects disposers; `inject`
 * records the requested service keys and invokes the callback with a scoped
 * fake that carries NO services, so every capability degrades exactly as the
 * missing-service path prescribes (UI channel absent, accounting
 * unavailable, memory-only persistence).
 */
function fakeHostContext(): {
  ctx: DshHostContext
  disposers: Array<() => void>
  injectedDeps: string[][]
} {
  const disposers: Array<() => void> = []
  const injectedDeps: string[][] = []
  const fake = {
    effect(callback: () => () => void): void {
      disposers.push(callback())
    },
    inject(deps: string[], callback: (scoped: unknown) => void): void {
      injectedDeps.push([...deps])
      callback(fake)
    },
  }
  // Unsafe cast, documented: the fake covers exactly the two Context members
  // (`effect`, `inject`) the host half touches; anything else throwing is the
  // desired failure mode.
  return { ctx: fake as unknown as DshHostContext, disposers, injectedDeps }
}

describe('host half wiring', () => {
  it('exports the plugin display name', () => {
    expect(name).toBe('liangxiang')
  })

  it('installs lifecycle + timers as effects and requests the DSH seams via inject', () => {
    vi.stubEnv('LIANGXIANG_BACKEND_URL', 'local')
    vi.useFakeTimers()
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const { ctx, disposers, injectedDeps } = fakeHostContext()
    apply(ctx)

    expect(log).toHaveBeenCalledWith('[dsh-liangxiang] host half active')
    // lifecycle marker + service lifecycle + readiness fallback + snapshot cadence.
    expect(disposers.length).toBe(4)
    expect(injectedDeps).toEqual([
      ['webServer'],
      ['storageDomain'],
      ['sessionProjections', 'sessions'],
    ])

    for (const dispose of disposers) dispose()
    expect(log).toHaveBeenCalledWith('[dsh-liangxiang] host half disposed')
    expect(vi.getTimerCount()).toBe(0)
    log.mockRestore()
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })
})
