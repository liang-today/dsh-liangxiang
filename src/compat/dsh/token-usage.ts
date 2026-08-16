/**
 * compat/dsh — the only layer allowed to depend on DSH shapes directly.
 *
 * V0.1 bucket mapping for the durable `tokenUsage` projection
 * (`TokenUsageProjection`, packages/llm/token-meter/src/projection.ts:13-18
 * @ 47f94385). Verified facts from that source:
 *
 * - the four buckets are DISJOINT;
 * - reasoning tokens are already included in `outputTokens` (never re-added);
 * - `uncachedInputTokens` mirrors provider `inputTokens` (cache misses only).
 *
 * Frozen product mapping (AGENTS.md §5):
 *
 *   input     = uncachedInput + cacheRead + cacheWrite   (all full weight)
 *   effective = input + output
 *
 * No 10% cache-read weighting, no dropped cache-write, no Context Occupancy.
 */
import type { TokenUsageInput } from '../../domain/index.ts'

/** Shape of the durable DSH `tokenUsage` projection view. */
export interface DshTokenUsageBuckets {
  uncachedInputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

/** Normalize DSH buckets into the domain's `{ input, output }` vocabulary. */
export function normalizeDshTokenUsage(buckets: DshTokenUsageBuckets): TokenUsageInput {
  return {
    inputTokens: buckets.uncachedInputTokens + buckets.cacheReadTokens + buckets.cacheWriteTokens,
    outputTokens: buckets.outputTokens,
  }
}
