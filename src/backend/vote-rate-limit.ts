import { VOTE_BUDGET_WINDOW_MS, voteBudgetAvailable } from '../domain/vote-budget.ts'

/**
 * Hard-bounded in-memory limiter for vote-intent work units, not arbitrary
 * raw HTTP traffic. A new accepted intent consumes its actual incense spend;
 * a new service-level rejection consumes one unit because it creates a durable
 * receipt. Stored replays/conflicts consume nothing.
 * Process-local: sharing one SQLite file across N processes multiplies the
 * budget. A community node must run a single backend process (docs/102).
 */
export const VOTE_RATE_WINDOW_MS = VOTE_BUDGET_WINDOW_MS
/** Per-installation vote-intent work units allowed to refill each minute. */
export const DEFAULT_VOTE_RATE_LIMIT_PER_MINUTE = 50
export const DEFAULT_VOTE_RATE_LIMIT_MAX_KEYS = 4_096

export type VoteRateLimitReason = 'per_installation' | 'active_key_capacity'

export interface VoteRateDecision {
  allowed: boolean
  reason: VoteRateLimitReason | null
  retryAfterMs: number
  available: number
}

interface Bucket {
  tokens: number
  updatedAt: number
}

export class VoteRateLimiter {
  private readonly windows = new Map<string, Bucket>()

  constructor(
    private readonly workUnitsPerMinute: number,
    private readonly maxActiveKeys: number,
  ) {
    if (!Number.isSafeInteger(maxActiveKeys) || maxActiveKeys <= 0) {
      throw new Error('maxActiveKeys must be a positive safe integer')
    }
  }

  /**
   * Current spendable incense. `lastVoteAt` reconstructs a missing bucket from
   * the last accepted vote (no new schema): idle refill from empty.
   * A new installation (no last vote) starts at `workUnitsPerMinute` (50),
   * not the 10-minute burst cap of 500.
   */
  inspect(installationId: string, now: number, lastVoteAt?: number | null): VoteRateDecision {
    if (this.workUnitsPerMinute <= 0) {
      return { allowed: true, reason: null, retryAfterMs: 0, available: Number.POSITIVE_INFINITY }
    }
    const existing = this.windows.get(installationId)
    if (existing === undefined) {
      if (this.windows.size >= this.maxActiveKeys) {
        this.evictExpired(now)
        if (this.windows.size >= this.maxActiveKeys) {
          return { allowed: false, reason: 'active_key_capacity', retryAfterMs: VOTE_RATE_WINDOW_MS, available: 0 }
        }
      }
      const available = lastVoteAt == null
        ? this.workUnitsPerMinute
        : Math.floor(voteBudgetAvailable(0, lastVoteAt, now, this.workUnitsPerMinute))
      return {
        allowed: available >= 1,
        reason: available >= 1 ? null : 'per_installation',
        retryAfterMs: available >= 1 ? 0 : this.retryAfterMs(available, 1),
        available,
      }
    }
    const available = Math.floor(voteBudgetAvailable(
      existing.tokens,
      existing.updatedAt,
      now,
      this.workUnitsPerMinute,
    ))
    return {
      allowed: available >= 1,
      reason: available >= 1 ? null : 'per_installation',
      retryAfterMs: available >= 1 ? 0 : this.retryAfterMs(available, 1),
      available,
    }
  }

  peek(installationId: string, now: number, lastVoteAt?: number | null): number {
    return this.inspect(installationId, now, lastVoteAt).available
  }

  /** Spend `count` incense from the bucket. `check(id, now)` is consume(1). */
  consume(installationId: string, count: number, now: number, lastVoteAt?: number | null): VoteRateDecision {
    if (this.workUnitsPerMinute <= 0) {
      return { allowed: true, reason: null, retryAfterMs: 0, available: Number.POSITIVE_INFINITY }
    }
    const want = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
    if (want < 1) {
      return { allowed: true, reason: null, retryAfterMs: 0, available: this.peek(installationId, now) }
    }

    const existing = this.windows.get(installationId)
    if (existing === undefined && this.windows.size >= this.maxActiveKeys) {
      this.evictExpired(now)
      if (this.windows.size >= this.maxActiveKeys) {
        return { allowed: false, reason: 'active_key_capacity', retryAfterMs: VOTE_RATE_WINDOW_MS, available: 0 }
      }
    }

    const tokens = existing === undefined
      ? (lastVoteAt == null
          ? this.workUnitsPerMinute
          : voteBudgetAvailable(0, lastVoteAt, now, this.workUnitsPerMinute))
      : voteBudgetAvailable(existing.tokens, existing.updatedAt, now, this.workUnitsPerMinute)
    if (tokens < want) {
      if (existing !== undefined) this.windows.set(installationId, { tokens, updatedAt: now })
      return {
        allowed: false,
        reason: 'per_installation',
        retryAfterMs: this.retryAfterMs(tokens, want),
        available: Math.floor(tokens),
      }
    }
    this.windows.set(installationId, { tokens: tokens - want, updatedAt: now })
    return { allowed: true, reason: null, retryAfterMs: 0, available: Math.floor(tokens - want) }
  }

  check(installationId: string, now: number): VoteRateDecision {
    return this.consume(installationId, 1, now)
  }

  get activeKeys(): number {
    return this.windows.size
  }

  reset(): void {
    this.windows.clear()
  }

  private retryAfterMs(tokens: number, want: number): number {
    const need = want - tokens
    if (need <= 0) return 1
    return Math.max(1, Math.ceil((need / this.workUnitsPerMinute) * VOTE_RATE_WINDOW_MS))
  }

  private evictExpired(now: number): void {
    for (const [installationId, bucket] of this.windows) {
      if (now - bucket.updatedAt >= VOTE_RATE_WINDOW_MS) {
        this.windows.delete(installationId)
      }
    }
  }
}
