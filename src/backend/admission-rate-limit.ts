/** Server-wide cap for first-install ticket claims. No attacker-controlled key map. */
export class AdmissionRateLimiter {
  private windowStartedAt = 0
  private used = 0

  constructor(private readonly perMinute: number) {}

  check(now: number): { allowed: boolean, retryAfterMs: number } {
    if (this.perMinute <= 0) return { allowed: true, retryAfterMs: 0 }
    if (this.windowStartedAt === 0 || now - this.windowStartedAt >= 60_000) {
      this.windowStartedAt = now
      this.used = 0
    }
    if (this.used >= this.perMinute) {
      return { allowed: false, retryAfterMs: Math.max(1, 60_000 - (now - this.windowStartedAt)) }
    }
    this.used += 1
    return { allowed: true, retryAfterMs: 0 }
  }

  reset(): void {
    this.windowStartedAt = 0
    this.used = 0
  }
}
