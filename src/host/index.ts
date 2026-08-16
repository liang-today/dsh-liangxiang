/**
 * Host half: lifecycle skeleton only. Usage observation, storage, settings,
 * and HTTP/SSE routes arrive in later milestones (docs/002 §4).
 *
 * The single `ctx.effect` proves the host row loads and disposes cleanly:
 * plugin removal must leave no residue (acceptance: all effects auto-dispose
 * on unload).
 */
import type { DshHostContext } from '../compat/dsh/host-context.ts'
import { HOST_PLUGIN_NAME, PLUGIN_PACKAGE_NAME } from '../shared/index.ts'

export const name = HOST_PLUGIN_NAME

/**
 * Plugin body: one lifecycle-marker effect, nothing else yet.
 * @param ctx - host root context.
 */
export function apply(ctx: DshHostContext): void {
  ctx.effect(() => {
    console.log(`[${PLUGIN_PACKAGE_NAME}] host half active`)
    return () => {
      console.log(`[${PLUGIN_PACKAGE_NAME}] host half disposed`)
    }
  }, 'liangbiao: lifecycle marker')
}
