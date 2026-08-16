/**
 * Local observed-usage projection: cumulative DSH `tokenUsage` values folded
 * into per-business-date totals through the pure watermark helpers.
 *
 * This is LOCAL OBSERVATION, never authority. In the online path its only job
 * is to produce the daily figure the host submits as a CLAIM; the backend
 * decides what that claim is worth (which, under A3, is "unverifiable but
 * recorded" — docs/052).
 */
import { isDshTokenUsageBuckets, normalizeDshTokenUsage } from '../compat/dsh/token-usage.ts'
import type { UsageObservationOrigin } from '../compat/dsh/usage-observer.ts'
import { computeEffectiveTokens } from '../domain/index.ts'
import type { BusinessDateProvider, Clock } from '../shared/business-date.ts'
import {
  addDailyUsage,
  EMPTY_DAILY_USAGE,
  foldUsageObservation,
  type DailyUsageRecord,
  type SessionUsageWatermark,
} from './usage-ledger.ts'

export interface UsageProjectionSink {
  putWatermark: (sessionId: string, watermark: SessionUsageWatermark) => void
  putDailyUsage: (businessDate: string, record: DailyUsageRecord) => void
}

export interface UsageProjectionDeps {
  dates: BusinessDateProvider
  clock: Clock
  warn: (message: string) => void
}

export class UsageProjection {
  private readonly dates: BusinessDateProvider
  private readonly clock: Clock
  private readonly warn: (message: string) => void

  private watermarks = new Map<string, SessionUsageWatermark>()
  private daily = new Map<string, DailyUsageRecord>()
  private sink: UsageProjectionSink | null = null

  constructor(deps: UsageProjectionDeps) {
    this.dates = deps.dates
    this.clock = deps.clock
    this.warn = deps.warn
  }

  /** Adopt persisted state and the write-behind sink. */
  hydrate(
    watermarks: Map<string, SessionUsageWatermark>,
    daily: Map<string, DailyUsageRecord>,
    sink: UsageProjectionSink,
  ): void {
    this.watermarks = watermarks
    this.daily = daily
    this.sink = sink
  }

  /**
   * Fold one cumulative observation.
   * @returns true when today's total actually grew (worth re-claiming).
   */
  observe(sessionId: string, value: unknown, origin: UsageObservationOrigin): boolean {
    if (!isDshTokenUsageBuckets(value)) {
      this.warn(`[dsh-liangbiao] ignoring malformed tokenUsage projection for session ${sessionId}`)
      return false
    }
    const cumulative = normalizeDshTokenUsage(value)
    // Unknown-session rule (docs/041): a fresh live session credits from zero,
    // catch-up and borrowed history baseline instead.
    const previous = this.watermarks.get(sessionId)
      ?? (origin.kind === 'live' && origin.firstLiveSeq === 0 ? { inputHwm: 0, outputHwm: 0 } : undefined)
    const fold = foldUsageObservation(previous, cumulative)
    const moved = previous === undefined
      || fold.watermark.inputHwm !== previous.inputHwm
      || fold.watermark.outputHwm !== previous.outputHwm
    if (moved) {
      this.watermarks.set(sessionId, fold.watermark)
      this.sink?.putWatermark(sessionId, fold.watermark)
    }
    if (fold.deltaInput === 0 && fold.deltaOutput === 0) return false
    const now = this.clock.now()
    const businessDate = this.dates.businessDateOf(now)
    const updated = addDailyUsage(
      this.daily.get(businessDate) ?? EMPTY_DAILY_USAGE,
      fold.deltaInput,
      fold.deltaOutput,
      now,
    )
    this.daily.set(businessDate, updated)
    this.sink?.putDailyUsage(businessDate, updated)
    return true
  }

  /** The host's local business date (its own timezone configuration). */
  localBusinessDate(now = this.clock.now()): string {
    return this.dates.businessDateOf(now)
  }

  recordFor(businessDate: string): DailyUsageRecord {
    return this.daily.get(businessDate) ?? EMPTY_DAILY_USAGE
  }

  /** Effective Token = Input + Output for one business date (AGENTS.md §5). */
  effectiveTokensFor(businessDate: string): number {
    const record = this.recordFor(businessDate)
    return computeEffectiveTokens({
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
    })
  }
}
