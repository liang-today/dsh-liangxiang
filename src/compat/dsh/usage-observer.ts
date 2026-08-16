/**
 * compat/dsh — durable `tokenUsage` projection observer (docs/041, docs/044).
 *
 * Feeds every cumulative projection value (initial enumeration of live
 * sessions + the change feed) into the host callback; the host's watermark
 * ledger turns cumulative values into non-double-counting daily deltas, so
 * ordering/duplication here is harmless by design.
 */
import type { DshSessionProjections, DshSessions } from './host-services.ts'
import { DSH_TOKEN_USAGE_KEY } from './token-usage.ts'

/**
 * Where one cumulative observation came from, deciding the unknown-session
 * ledger rule (docs/041): `catchup` values and borrowed-history sessions
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
 * fiber (session-projection/src/index.ts:230-238), so disposal rides the
 * plugin lifecycle.
 *
 * Origin semantics: the catch-up enumeration marks values as `catchup`
 * (pre-existing usage must baseline, never earn retroactively); the change
 * feed carries the session's `firstLiveSeq` so the ledger can credit fresh
 * sessions from zero while baselining resumed/forked borrowed history.
 * @param projections - the projection registry face.
 * @param sessions - the live-session store face.
 * @param onUsage - sink for `(sessionId, cumulativeProjectionValue, origin)`.
 * @returns the change-feed disposer.
 */
export function attachUsageObservation(
  projections: DshSessionProjections,
  sessions: DshSessions,
  onUsage: (sessionId: string, value: unknown, origin: UsageObservationOrigin) => void,
): () => void {
  // Catch-up: sessions whose usage flowed before this plugin loaded.
  for (const session of sessions.list()) {
    const snapshot = projections.snapshot(session)
    const value = snapshot.values[DSH_TOKEN_USAGE_KEY]
    if (value !== undefined) onUsage(session.id, value, { kind: 'catchup' })
  }
  return projections.onChanged((session, key, value) => {
    if (key === DSH_TOKEN_USAGE_KEY) {
      onUsage(session.id, value, { kind: 'live', firstLiveSeq: session.firstLiveSeq })
    }
  })
}
