/**
 * Clock + BusinessDateProvider. LOCAL/DEV ONLY authority: the business
 * timezone is an explicit configuration (never the browser locale, never
 * scattered `new Date().toLocaleDateString()` calls). Once a real backend
 * exists, its `business_date` / server time replaces this provider
 * (AGENTS.md §10); this module must not be promoted to production authority.
 */

export interface Clock {
  /** Epoch milliseconds. */
  now(): number
}

export const systemClock: Clock = { now: () => Date.now() }

/** Frozen dev default; override with the LIANGBIAO_BUSINESS_TZ environment variable. */
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
  return {
    timezone,
    businessDateOf: (epochMs: number): string => format.format(new Date(epochMs)),
  }
}
