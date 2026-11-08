/**
 * Clock + BusinessDateProvider, shared by the backend (authoritative) and the
 * host (local observation only).
 *
 * The business timezone is always an explicit configuration — never the
 * browser locale, never a scattered `new Date().toLocaleDateString()` call.
 * In the online path the BACKEND's provider is the authority and the host
 * adopts `business_date` from `/v1/bootstrap` (AGENTS.md §10); the host's own
 * provider only buckets locally observed tokens for its daily claim.
 */

export interface Clock {
  /** Epoch milliseconds. */
  now(): number
}

export const systemClock: Clock = { now: () => Date.now() }

/** Frozen dev default; override with the LIANGXIANG_BUSINESS_TZ environment variable. */
export const DEFAULT_BUSINESS_TIMEZONE = 'Asia/Shanghai'

export interface BusinessDateProvider {
  readonly timezone: string
  /** Calendar day `YYYY-MM-DD` of the given instant in the business timezone. */
  businessDateOf(epochMs: number): string
}

/**
 * Build a provider for one explicit IANA timezone. An unknown timezone fails
 * loudly at construction (Intl throws), never silently at midnight.
 * @param timezone - IANA zone id, e.g. `Asia/Shanghai`.
 * @returns the provider.
 */
export function createBusinessDateProvider(timezone: string): BusinessDateProvider {
  // en-CA formats as YYYY-MM-DD; constructing eagerly validates the zone.
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  // Fanout shares an exact frame timestamp. Reusing that exact conversion
  // avoids repeated Intl work without approximating midnight or DST edges.
  let lastEpoch: number | undefined
  let lastDate = ''
  return {
    timezone,
    businessDateOf: (epochMs: number): string => {
      if (epochMs !== lastEpoch) {
        lastDate = format.format(new Date(epochMs))
        lastEpoch = epochMs
      }
      return lastDate
    },
  }
}

/** First instant of a calendar date in its business timezone, including DST. */
export function businessDateStartsAt(dates: BusinessDateProvider, businessDate: string): number {
  const midnight = Date.parse(`${businessDate}T00:00:00.000Z`)
  if (!Number.isFinite(midnight)) throw new Error('invalid business date')
  let lo = midnight - 48 * 60 * 60 * 1000
  let hi = midnight + 48 * 60 * 60 * 1000
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2)
    if (dates.businessDateOf(mid) < businessDate) lo = mid
    else hi = mid
  }
  if (dates.businessDateOf(hi) !== businessDate) throw new Error('business date does not exist in this timezone')
  return hi
}

/** First instant outside this business date, including 23/25-hour DST days. */
export function businessDayEndsAt(dates: BusinessDateProvider, now: number): number {
  const date = dates.businessDateOf(now)
  let lo = Math.floor(now)
  let hi = lo + 48 * 60 * 60 * 1000
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2)
    if (dates.businessDateOf(mid) === date) lo = mid
    else hi = mid
  }
  return hi
}
