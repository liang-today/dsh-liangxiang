import { describe, expect, it } from 'vitest'
import { LiangxiangBadge } from '../src/client/Badge.tsx'
import { apply, inject } from '../src/client/index.ts'
import type { DshClientContext } from '../src/compat/dsh/client-context.ts'

interface RecordedRegistration {
  options: Record<string, unknown>
  component: unknown
}

/**
 * Slots fake mirroring the registry contract the compat adapter relies on:
 * inject() runs its callback once the declaration exists (here: immediately)
 * and register() returns a disposer.
 */
function fakeClientContext(): {
  ctx: DshClientContext
  injectedKeys: string[]
  registrations: RecordedRegistration[]
  disposedIds: string[]
} {
  const injectedKeys: string[] = []
  const registrations: RecordedRegistration[] = []
  const disposedIds: string[] = []
  const slots = {
    inject(key: string, callback: () => unknown): void {
      injectedKeys.push(key)
      callback()
    },
    register(options: Record<string, unknown>, component: unknown): () => void {
      registrations.push({ options, component })
      return () => disposedIds.push(String(options.id))
    },
  }
  // Unsafe cast, documented: the fake covers exactly the two slots members
  // (`inject`, `register`) the compat adapter touches.
  return { ctx: { slots } as unknown as DshClientContext, injectedKeys, registrations, disposedIds }
}

describe('client half skeleton', () => {
  it('requests the slots service', () => {
    expect(inject).toEqual(['slots'])
  })

  it('registers the badge into shell.overlay through the declaration wait', () => {
    const { ctx, injectedKeys, registrations } = fakeClientContext()
    apply(ctx)
    expect(injectedKeys).toEqual(['shell.overlay'])
    expect(registrations).toHaveLength(1)
    expect(registrations[0]?.options).toMatchObject({
      name: 'shell.overlay',
      id: 'liangxiang',
      order: 100,
    })
    expect(registrations[0]?.component).toBe(LiangxiangBadge)
  })
})
