/**
 * Final request settlement + one durable per-session cursor. The cumulative
 * HWM helper below is retained only for legacy/dev entry points, not the
 * real DSH observer (seam facts: docs/COMPATIBILITY.md).
 *
 * Rules (docs/041 §聚合与防重):
 *  - first sighting of a session BASELINES (contribution 0, no retroactive
 *    credit, fork parent prefixes never double-count);
 *  - contributions are `max(0, cumulative - hwm)` per side; HWMs only rise,
 *    so replay cannot lower the stored mark. A chunk->final replacement can
 *    revise the real cumulative downward, however, and this irreversible HWM
 *    may then retain already-credited excess until later real growth catches
 *    up. This is an explicit open compatibility risk, not direction safety;
 *  - replay/restart produce identical cumulative values => diff 0.
 */
import {
  incenseWeightBpsForModel,
  scaleTokensByWeightBps,
  splitScaledTokens,
  type TokenUsageInput,
  type IncenseWeightPolicy,
  DEFAULT_INCENSE_WEIGHT_POLICY,
} from '../domain/index.ts'
import type { SettledUsageBatch } from '../compat/dsh/settled-usage.ts'
import type { UsageObservationOrigin } from '../compat/dsh/usage-observer.ts'

/** Persisted per-session watermark: input = sum of the three input buckets. */
export interface SessionUsageWatermark {
  inputHwm: number
  outputHwm: number
  /** One durable cursor per session, shared across online/offline ledgers. */
  settledOffset?: number
  /** A first-observation fence prevents inherited/pre-upgrade history minting. */
  baselineOffset?: number
  /** Session migrations can renumber offsets; never compare across formats. */
  sessionFormat?: number
}

export function mergeUsageWatermark(left: SessionUsageWatermark, right: SessionUsageWatermark): SessionUsageWatermark {
  const sessionFormat = Math.max(left.sessionFormat ?? 0, right.sessionFormat ?? 0)
  const settled = [left, right].filter(mark => mark.settledOffset !== undefined && (mark.sessionFormat ?? 0) === sessionFormat)
  return {
    inputHwm: Math.max(left.inputHwm, right.inputHwm),
    outputHwm: Math.max(left.outputHwm, right.outputHwm),
    ...(settled.length === 0 ? {} : {
      settledOffset: Math.max(...settled.map(mark => mark.settledOffset ?? 0)),
      baselineOffset: Math.min(...settled.map(mark => mark.baselineOffset ?? 0)),
      ...(sessionFormat === 0 ? {} : { sessionFormat }),
    }),
  }
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

/** One business date's accumulated observed usage (Pro-equivalent tokens). */
export interface DailyUsageRecord {
  /** Accounting metadata only; restored metadata never changes earning rates. */
  weightPolicy?: IncenseWeightPolicy
  inputTokens: number
  outputTokens: number
  /**
   * Leftover from Flash (and other fractional) weights, in 1/10000 token.
   * Old persisted rows omit this; treat missing as 0.
   */
  weightCarry: number
  /** Epoch ms of the last contribution. */
  observedAt: number
}

export const EMPTY_DAILY_USAGE: DailyUsageRecord = {
  inputTokens: 0,
  outputTokens: 0,
  weightCarry: 0,
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
    ...(record.weightPolicy === undefined ? {} : { weightPolicy: record.weightPolicy }),
    inputTokens: record.inputTokens + deltaInput,
    outputTokens: record.outputTokens + deltaOutput,
    weightCarry: record.weightCarry,
    observedAt,
  }
}

/**
 * Credit one provider usage amount with the effective model-rule data.
 * Stored totals are Pro-equivalent; the backend still sees claimed tokens.
 */
export function creditObservedUsage(
  record: DailyUsageRecord,
  deltaInput: number,
  deltaOutput: number,
  modelId: string | null | undefined,
  observedAt: number,
): DailyUsageRecord {
  const raw = deltaInput + deltaOutput
  const { scaled, carry } = scaleTokensByWeightBps(
    raw,
    incenseWeightBpsForModel(modelId),
    record.weightCarry,
  )
  const split = splitScaledTokens(scaled, deltaInput, deltaOutput)
  return {
    weightPolicy: DEFAULT_INCENSE_WEIGHT_POLICY,
    inputTokens: record.inputTokens + split.input,
    outputTokens: record.outputTokens + split.output,
    weightCarry: carry,
    observedAt,
  }
}

/** Final attempts only. A replay or a mode switch can never credit twice. */
export function creditSettledUsageBatch(
  previous: SessionUsageWatermark | undefined,
  record: DailyUsageRecord,
  batch: SettledUsageBatch,
  origin: UsageObservationOrigin,
  businessDate: string,
  dateOf: (instant: number) => string,
): { watermark: SessionUsageWatermark, record: DailyUsageRecord } {
  const sessionFormat = batch.sessionFormat ?? previous?.sessionFormat
  const formatChanged = previous !== undefined && batch.sessionFormat !== undefined && (previous.sessionFormat ?? 0) !== batch.sessionFormat
  const baselineOffset = formatChanged ? batch.throughOffset : previous?.baselineOffset ?? (
    previous !== undefined || origin.kind === 'catchup' ? batch.throughOffset : origin.firstLiveSeq
  )
  const settledOffset = formatChanged ? baselineOffset : previous?.settledOffset ?? baselineOffset
  const watermark: SessionUsageWatermark = {
    inputHwm: previous?.inputHwm ?? 0,
    outputHwm: previous?.outputHwm ?? 0,
    baselineOffset,
    settledOffset: Math.max(settledOffset, batch.throughOffset),
    ...(sessionFormat === undefined ? {} : { sessionFormat }),
  }
  let updated = record
  for (const request of batch.requests) {
    if (request.endOffset <= settledOffset || request.startOffset <= baselineOffset) continue
    // Never pour a missed previous-day attempt into today's furnace.
    if (origin.kind === 'catchup' && dateOf(request.endedAt) !== businessDate) continue
    watermark.inputHwm += request.inputTokens
    watermark.outputHwm += request.outputTokens
    updated = creditObservedUsage(
      updated,
      request.inputTokens, request.outputTokens, request.model, request.endedAt,
    )
  }
  return { watermark, record: updated }
}

/** Select an internally consistent cumulative record, never splice its carry. */
export function mergeDailyUsage(left: DailyUsageRecord, right: DailyUsageRecord): DailyUsageRecord {
  const units = (row: DailyUsageRecord): bigint => (BigInt(row.inputTokens) + BigInt(row.outputTokens)) * 10000n + BigInt(row.weightCarry)
  return { ...(units(left) >= units(right) ? left : right) }
}
