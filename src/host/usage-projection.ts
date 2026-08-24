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
  creditObservedUsage,
  EMPTY_DAILY_USAGE,
  foldUsageObservation,
  type DailyUsageRecord,
  type SessionUsageWatermark,
} from './usage-ledger.ts'

export interface UsageProjectionSink {
  putWatermark: (sessionId: string, watermark: SessionUsageWatermark) => void
  putDailyUsage: (businessDate: string, record: DailyUsageRecord) => void
  deleteDailyUsage: (businessDate: string) => void
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

  /**
   * Adopt persisted state and the write-behind sink.
   *
   * MUST merge, never replace: usage observation starts in a separate DSH
   * inject from persistence, so catch-up can baseline live sessions before
   * this runs. Replacing the maps rewound those high-water marks; the next
   * `firstLiveSeq === 0` live event then credited the whole session again.
   */
  hydrate(
    watermarks: Map<string, SessionUsageWatermark>,
    daily: Map<string, DailyUsageRecord>,
    sink: UsageProjectionSink,
  ): void {
    this.sink = sink
    for (const [sessionId, persisted] of watermarks) {
      const current = this.watermarks.get(sessionId)
      this.watermarks.set(sessionId, current === undefined
        ? { ...persisted }
        : {
          inputHwm: Math.max(current.inputHwm, persisted.inputHwm),
          outputHwm: Math.max(current.outputHwm, persisted.outputHwm),
        })
    }
    for (const [date, persisted] of daily) {
      const current = this.daily.get(date)
      this.daily.set(date, current === undefined
        ? { ...persisted }
        : {
          inputTokens: Math.max(current.inputTokens, persisted.inputTokens),
          outputTokens: Math.max(current.outputTokens, persisted.outputTokens),
          weightCarry: Math.max(current.weightCarry, persisted.weightCarry),
          observedAt: Math.max(current.observedAt, persisted.observedAt),
        })
    }
    for (const [sessionId, watermark] of this.watermarks) sink.putWatermark(sessionId, watermark)
    for (const [date, record] of this.daily) sink.putDailyUsage(date, record)
  }

  /**
   * Fold one cumulative observation.
   * @param modelId - DSH route id for this delta (`deepseek-v4-pro` / `deepseek-v4-flash`);
   *   only V4-Pro earns at ×1; Flash/missing/unknown/other routes earn at ×0.5.
   * @param bucketDate - authoritative business date to credit into. Online hosts
   *   MUST pass the backend's `business_date` so local TZ skew cannot hide
   *   today's tokens under a different key (AGENTS.md §10).
   * @returns true when today's total actually grew (worth re-claiming).
   */
  observe(
    sessionId: string,
    value: unknown,
    origin: UsageObservationOrigin,
    modelId?: string | null,
    bucketDate?: string,
  ): boolean {
    if (!isDshTokenUsageBuckets(value)) {
      this.warn(`[dsh-liangxiang] ignoring malformed tokenUsage projection for session ${sessionId}`)
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
    const businessDate = bucketDate === undefined || bucketDate === ''
      ? this.dates.businessDateOf(now)
      : bucketDate
    const updated = creditObservedUsage(
      this.daily.get(businessDate) ?? EMPTY_DAILY_USAGE,
      fold.deltaInput,
      fold.deltaOutput,
      modelId,
      now,
    )
    this.daily.set(businessDate, updated)
    this.sink?.putDailyUsage(businessDate, updated)
    return true
  }

  /**
   * Move the host-local "today" bucket onto the authoritative business date
   * when the two labels disagree (timezone skew). A real rollover does not
   * hit this path: local today and backend today are the same string.
   */
  alignDailyBucket(authoritativeDate: string): void {
    if (authoritativeDate === '') return
    const localDate = this.localBusinessDate()
    if (localDate === authoritativeDate) return
    const source = this.daily.get(localDate)
    if (source === undefined) return
    const dest = this.daily.get(authoritativeDate) ?? EMPTY_DAILY_USAGE
    const merged: DailyUsageRecord = dest.inputTokens === 0 && dest.outputTokens === 0
      ? { ...source }
      : {
        inputTokens: dest.inputTokens + source.inputTokens,
        outputTokens: dest.outputTokens + source.outputTokens,
        weightCarry: dest.weightCarry + source.weightCarry,
        observedAt: Math.max(dest.observedAt, source.observedAt),
      }
    this.daily.set(authoritativeDate, merged)
    this.daily.delete(localDate)
    this.sink?.putDailyUsage(authoritativeDate, merged)
    this.sink?.deleteDailyUsage(localDate)
  }

  /** The host's local business date (its own timezone configuration). */
  localBusinessDate(now = this.clock.now()): string {
    return this.dates.businessDateOf(now)
  }

  recordFor(businessDate: string): DailyUsageRecord {
    return this.daily.get(businessDate) ?? EMPTY_DAILY_USAGE
  }

  /**
   * Forget today's observed totals. Watermarks stay so still-open sessions
   * cannot dump their cumulative usage as a new contribution.
   */
  discardDailyTotals(): void {
    const dates = [...this.daily.keys()]
    this.daily.clear()
    for (const date of dates) this.sink?.deleteDailyUsage(date)
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
