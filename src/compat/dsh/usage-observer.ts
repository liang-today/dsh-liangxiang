/**
 * compat/dsh — durable `tokenUsage` projection observer
 * (docs/COMPATIBILITY.md).
 *
 * Feeds every cumulative projection value (initial enumeration of live
 * sessions + the change feed) into the host callback; the host's watermark
 * ledger turns cumulative values into daily deltas. Exact duplicate/replay
 * observations are harmless; a same-attempt final sample may revise an
 * earlier chunk downward, which the current max-HWM ledger cannot reverse
 * after credit (tracked explicitly in docs/COMPATIBILITY.md).
 */
import type { DshSessionProjections, DshSessions } from './host-services.ts'
import { readSessionModelId } from './session-route.ts'
import { DSH_TOKEN_USAGE_KEY } from './token-usage.ts'

/**
 * Where one cumulative observation came from, deciding the unknown-session
 * ledger rule: `catchup` values and borrowed-history sessions
 * (firstLiveSeq > 0: resume/fork) BASELINE — pre-existing usage never earns
 * retroactive incense; a live value from a genuinely fresh session
 * (firstLiveSeq === 0) credits from zero because all of it grew under
 * observation.
 */
export type UsageObservationOrigin =
  | { kind: 'catchup' }
  | { kind: 'live', firstLiveSeq: number }

/**
 * Start observing. MUST be called synchronously inside the owning
 * `ctx.inject` callback: `onChanged` registers an effect on the calling
 * fiber (`SessionProjectionRegistry.onChanged`), so disposal rides the plugin
 * lifecycle. Verified against deepseek-harness 0.1.2-alpha.4 @ 4e84901e.
 *
 * Origin semantics: the catch-up enumeration marks values as `catchup`
 * (pre-existing usage must baseline, never earn retroactively); the change
 * feed carries the session's `firstLiveSeq` so the ledger can credit fresh
 * sessions from zero while baselining resumed/forked borrowed history.
 * @param projections - the projection registry face.
 * @param sessions - the live-session store face.
 * @param onUsage - sink for `(sessionId, cumulativeProjectionValue, origin, modelId)`.
 * @returns the change-feed disposer.
 */
export function attachUsageObservation(
  projections: DshSessionProjections,
  sessions: DshSessions,
  onUsage: (
    sessionId: string,
    value: unknown,
    origin: UsageObservationOrigin,
    modelId: string | null,
  ) => void,
): () => void {
  // Catch-up: sessions whose usage flowed before this plugin loaded.
  for (const session of sessions.list()) {
    const snapshot = projections.snapshot(session)
    const value = snapshot.values[DSH_TOKEN_USAGE_KEY]
    if (value !== undefined) onUsage(session.id, value, { kind: 'catchup' }, readSessionModelId(session))
  }
  return projections.onChanged((session, key, value) => {
    if (key === DSH_TOKEN_USAGE_KEY) {
      onUsage(session.id, value, { kind: 'live', firstLiveSeq: session.firstLiveSeq }, readSessionModelId(session))
    }
  })
}
