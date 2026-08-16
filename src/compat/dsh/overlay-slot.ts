/**
 * compat/dsh — the only layer allowed to import DSH APIs directly.
 *
 * `shell.overlay` registration adapter (docs/003 rows C1 + C2):
 *
 * - `ctx.slots.inject(key, cb)` waits for the target slot's declaration,
 *   re-runs on redeclaration, and disposes with the caller's fiber, so plugin
 *   unload removes the entry automatically
 *   (packages/client/runtime/src/client/slots.ts:143 @ 47f94385).
 * - `shell.overlay` is the frame-wide floating list slot (root scope,
 *   click-through; entries opt back into pointer events), declared by
 *   ui-layout (packages/client/ui-layout/src/client/index.ts:83 @ 47f94385).
 *   The type-only import below merges its SlotMap declaration.
 * - Registration form mirrors the official slot-catalog example for
 *   `shell.overlay` (packages/extensions/cordis-client-runner/src/client/
 *   slot-catalog.ts:1474 @ 47f94385).
 */
import type { ReactElement } from 'react'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { DshClientContext } from './client-context.ts'

/** One overlay list entry: id/order cell plus a props-less placeholder component. */
export interface OverlayEntrySpec {
  /** List cell id (stable across re-registrations). */
  id: string
  /** Ordering among overlay occupants (ascending). */
  order: number
  /** Entry component; standard slot props are intentionally not consumed yet. */
  component: () => ReactElement
}

/**
 * Register one entry into `shell.overlay`. Disposal is automatic: both the
 * inject wait and the registration ride the calling plugin's fiber.
 * @param ctx - client context carrying the slots service.
 * @param spec - entry id, order, and component.
 */
export function registerOverlayEntry(ctx: DshClientContext, spec: OverlayEntrySpec): void {
  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    { name: 'shell.overlay', id: spec.id, order: spec.order },
    spec.component,
  ))
}
