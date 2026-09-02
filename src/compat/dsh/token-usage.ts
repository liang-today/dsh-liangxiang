/**
 * compat/dsh — the only layer allowed to depend on DSH shapes directly.
 *
 * V0.1 bucket mapping for the durable `tokenUsage` projection
 * (`TokenUsageProjection`, packages/llm/token-meter/src/projection.ts,
 * deepseek-harness 0.1.2-alpha.4 @ 4e84901e). Verified facts:
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

/** The DSH projection key registered by `tokenUsageProjectionDefinition`. */
export const DSH_TOKEN_USAGE_KEY = 'tokenUsage'

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/**
 * Boundary guard for projection payloads: the four cumulative buckets, all
 * non-negative safe integers. Anything else is treated as an incompatible
 * DSH change and skipped loudly by the caller.
 */
export function isDshTokenUsageBuckets(value: unknown): value is DshTokenUsageBuckets {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return isCount(record.uncachedInputTokens)
    && isCount(record.outputTokens)
    && isCount(record.cacheReadTokens)
    && isCount(record.cacheWriteTokens)
}

/** Normalize DSH buckets into the domain's `{ input, output }` vocabulary. */
export function normalizeDshTokenUsage(buckets: DshTokenUsageBuckets): TokenUsageInput {
  return {
    inputTokens: buckets.uncachedInputTokens + buckets.cacheReadTokens + buckets.cacheWriteTokens,
    outputTokens: buckets.outputTokens,
  }
}
