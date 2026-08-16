/**
 * Client half (exports["./client"] entry): register the placeholder badge
 * into shell.overlay. All DSH touchpoints go through compat/dsh; this module
 * itself imports no DSH symbols.
 */
import type { DshClientContext } from '../compat/dsh/client-context.ts'
import { registerOverlayEntry } from '../compat/dsh/overlay-slot.ts'
import { OVERLAY_ENTRY_ID, OVERLAY_ENTRY_ORDER } from '../shared/index.ts'
import { LiangbiaoBadge } from './Badge.tsx'

export const inject = ['slots']

/**
 * Client plugin body: one overlay registration; disposal rides the fiber.
 * @param ctx - browser root context carrying the slots service.
 */
export function apply(ctx: DshClientContext): void {
  registerOverlayEntry(ctx, {
    id: OVERLAY_ENTRY_ID,
    order: OVERLAY_ENTRY_ORDER,
    component: LiangbiaoBadge,
  })
}
