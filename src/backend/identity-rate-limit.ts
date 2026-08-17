/**
 * Identity-mutation rate limit (revoke / re-key).
 *
 *   hit  — public key or device fingerprint is already in community_identity
 *          → same IP + installation, once per 10 minutes
 *   miss — no public key (and no fingerprint) hit; treated as a probe
 *          → same IP, once per 30 minutes
 *
 * Timestamps are recorded on every attempt (allowed or denied) so a hammer
 * cannot reset the window by failing. The map is bounded.
 */
export const IDENTITY_HIT_WINDOW_MS = 10 * 60 * 1000
export const IDENTITY_MISS_WINDOW_MS = 30 * 60 * 1000
const EVICT_THRESHOLD = 2_000

export type IdentityRateKind = 'hit' | 'miss'

export interface IdentityRateDecision {
  allowed: boolean
  kind: IdentityRateKind
  retryAfterMs: number
}

export class IdentityRateLimiter {
  private readonly last = new Map<string, number>()

  check(
    now: number,
    ip: string,
    installationId: string,
    kind: IdentityRateKind,
  ): IdentityRateDecision {
    if (this.last.size > EVICT_THRESHOLD) this.evict(now)
    const windowMs = kind === 'hit' ? IDENTITY_HIT_WINDOW_MS : IDENTITY_MISS_WINDOW_MS
    const key = kind === 'hit' ? `hit:${ip}:${installationId}` : `miss:${ip}`
    const previous = this.last.get(key)
    if (previous !== undefined) {
      const elapsed = now - previous
      if (elapsed < windowMs) {
        if (kind === 'miss') this.last.set(key, now)
        return { allowed: false, kind, retryAfterMs: windowMs - elapsed }
      }
    }
    this.last.set(key, now)
    return { allowed: true, kind, retryAfterMs: 0 }
  }

  reset(): void {
    this.last.clear()
  }

  private evict(now: number): void {
    for (const [key, at] of this.last) {
      const windowMs = key.startsWith('miss:') ? IDENTITY_MISS_WINDOW_MS : IDENTITY_HIT_WINDOW_MS
      if (now - at >= windowMs) this.last.delete(key)
    }
  }
}
