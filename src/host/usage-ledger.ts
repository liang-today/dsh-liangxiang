/**
 * Per-session high-water-mark diffing of the cumulative DSH `tokenUsage`
 * projection (seam facts: docs/041). Pure functions — the service owns the
 * maps and persistence.
 *
 * Rules (docs/041 §聚合与防重):
 *  - first sighting of a session BASELINES (contribution 0, no retroactive
 *    credit, fork parent prefixes never double-count);
 *  - contributions are `max(0, cumulative - hwm)` per side; HWMs only rise,
 *    so a chunk->final replacement that momentarily lowers a cumulative can
 *    never double-count on recovery (direction-safe: never over-counts);
 *  - replay/restart produce identical cumulative values => diff 0.
 */
import type { TokenUsageInput } from '../domain/index.ts'

/** Persisted per-session watermark: input = sum of the three input buckets. */
export interface SessionUsageWatermark {
  inputHwm: number
  outputHwm: number
}

export interface UsageFoldResult {
  watermark: SessionUsageWatermark
  /** New tokens attributable to the observation instant (>= 0). */
  deltaInput: number
  deltaOutput: number
}

/**
 * Fold one cumulative observation against the previous watermark.
 * @param previous - stored watermark; undefined on first sighting (baseline).
 * @param cumulative - normalized cumulative usage of the whole session log.
 * @returns the raised watermark and the non-negative deltas.
 */
export function foldUsageObservation(
  previous: SessionUsageWatermark | undefined,
  cumulative: TokenUsageInput,
): UsageFoldResult {
  if (previous === undefined) {
    return {
      watermark: { inputHwm: cumulative.inputTokens, outputHwm: cumulative.outputTokens },
      deltaInput: 0,
      deltaOutput: 0,
    }
  }
  const deltaInput = Math.max(0, cumulative.inputTokens - previous.inputHwm)
  const deltaOutput = Math.max(0, cumulative.outputTokens - previous.outputHwm)
  return {
    watermark: {
      inputHwm: Math.max(previous.inputHwm, cumulative.inputTokens),
      outputHwm: Math.max(previous.outputHwm, cumulative.outputTokens),
    },
    deltaInput,
    deltaOutput,
  }
}

/** One business date's accumulated observed usage. */
export interface DailyUsageRecord {
  inputTokens: number
  outputTokens: number
  /** Epoch ms of the last contribution. */
  observedAt: number
}

export const EMPTY_DAILY_USAGE: DailyUsageRecord = {
  inputTokens: 0,
  outputTokens: 0,
  observedAt: 0,
}

/**
 * Add one fold's deltas to a day record (pure).
 * @param record - the day's record so far (or the empty record).
 * @param deltaInput - non-negative input contribution.
 * @param deltaOutput - non-negative output contribution.
 * @param observedAt - contribution instant (epoch ms).
 * @returns the updated record.
 */
export function addDailyUsage(
  record: DailyUsageRecord,
  deltaInput: number,
  deltaOutput: number,
  observedAt: number,
): DailyUsageRecord {
  return {
    inputTokens: record.inputTokens + deltaInput,
    outputTokens: record.outputTokens + deltaOutput,
    observedAt,
  }
}
