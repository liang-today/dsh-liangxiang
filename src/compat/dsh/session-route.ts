/**
 * Read the in-force DSH route model id from a live session.
 *
 * Verified against deepseek-harness 0.1.2-alpha.4 @ 4e84901e:
 *   packages/core/session/src/index.ts `Session.requestHeader()` and
 *   `Session.requestContext()`;
 *   EpochHeader.config.model / RequestContext.model are registration route
 *   ids, not display names (packages/core/session/src/types.ts).
 *
 * Latest-header is the model of the request that just ran when `tokenUsage`
 * moves. Stepwise log walk is more precise across a batched multi-step fold;
 * V0.1 accepts this seam (宁少勿多 still holds via HWM diffs).
 */
import type { DshSessionRef } from './host-services.ts'

function modelFromUnknown(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** Exact route model id, or null when the session has no header/context yet. */
export function readSessionModelId(session: DshSessionRef): string | null {
  const header = session.requestHeader?.()
  const fromHeader = modelFromUnknown(header?.config.model)
  if (fromHeader !== null) return fromHeader
  const context = session.requestContext?.()
  return modelFromUnknown(context?.model)
}
