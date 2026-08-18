/** Hard-bounded in-memory limiter for vote attempts. */
export const VOTE_RATE_WINDOW_MS = 60_000
/** Per-installation incense submissions (votes) allowed in one minute. */
export const DEFAULT_VOTE_RATE_LIMIT_PER_MINUTE = 50
export const DEFAULT_VOTE_RATE_LIMIT_MAX_KEYS = 4_096

export type VoteRateLimitReason = 'per_installation' | 'active_key_capacity'

export interface VoteRateDecision {
  allowed: boolean
  reason: VoteRateLimitReason | null
  retryAfterMs: number
}

export class VoteRateLimiter {
  private readonly windows = new Map<string, number[]>()

  constructor(
    private readonly requestsPerMinute: number,
    private readonly maxActiveKeys: number,
  ) {
    if (!Number.isSafeInteger(maxActiveKeys) || maxActiveKeys <= 0) {
      throw new Error('maxActiveKeys must be a positive safe integer')
    }
  }

  check(installationId: string, now: number): VoteRateDecision {
    if (this.requestsPerMinute <= 0) return { allowed: true, reason: null, retryAfterMs: 0 }

    const existing = this.windows.get(installationId)
    if (existing === undefined && this.windows.size >= this.maxActiveKeys) {
      this.evictExpired(now)
      if (this.windows.size >= this.maxActiveKeys) {
        return { allowed: false, reason: 'active_key_capacity', retryAfterMs: VOTE_RATE_WINDOW_MS }
      }
    }

    const window = (existing ?? []).filter(at => now - at < VOTE_RATE_WINDOW_MS)
    if (window.length >= this.requestsPerMinute) {
      this.windows.set(installationId, window)
      const oldest = window[0] as number
      return {
        allowed: false,
        reason: 'per_installation',
        retryAfterMs: Math.max(1, VOTE_RATE_WINDOW_MS - (now - oldest)),
      }
    }
    window.push(now)
    this.windows.set(installationId, window)
    return { allowed: true, reason: null, retryAfterMs: 0 }
  }

  get activeKeys(): number {
    return this.windows.size
  }

  reset(): void {
    this.windows.clear()
  }

  private evictExpired(now: number): void {
    for (const [installationId, window] of this.windows) {
      const newest = window.at(-1)
      if (newest === undefined || now - newest >= VOTE_RATE_WINDOW_MS) {
        this.windows.delete(installationId)
      }
    }
  }
}
