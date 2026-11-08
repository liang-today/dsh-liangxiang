import { marketBusinessHour } from '../../domain/market.ts'
import { businessDayEndsAt, createBusinessDateProvider } from '../../shared/business-date.ts'
import { marketTime } from './chart-model.ts'

export interface MarketTimeTick { at: number, label: string }
export interface MarketDayDomain { from: number, until: number, ticks: MarketTimeTick[] }
export interface MarketTimeWindow extends MarketDayDomain { observedUntil: number, futureFrom: number | null }

/** Explicit business midnights, including 23/25-hour days; never browser time. */
export function marketDayDomain(businessDate: string, timezone: string): MarketDayDomain {
  const dates = createBusinessDateProvider(timezone)
  const noon = marketBusinessHour(businessDate, timezone, 12)
  // Some zones advance the clock at midnight, so 00:00 itself does not exist.
  // Find the first real instant of the date rather than requiring that hour.
  let previous = noon - 48 * 3_600_000, from = noon
  while (from - previous > 1) {
    const mid = Math.floor((previous + from) / 2)
    if (dates.businessDateOf(mid) === businessDate) from = mid
    else previous = mid
  }
  const until = businessDayEndsAt(dates, noon)
  const ticks = [{ at: from, label: '00:00' }, ...[4, 8, 12, 16, 20].map(hour => ({ at: marketBusinessHour(businessDate, timezone, hour), label: `${String(hour).padStart(2, '0')}:00` }))]
  ticks.push({ at: until, label: '24:00' })
  return { from, until, ticks }
}

/** A full-day view is the default. A recent view is an explicit local choice. */
export function marketTimeWindow(day: MarketDayDomain, observedAt: number, timezone: string, recent = false): MarketTimeWindow {
  const observedUntil = Math.max(day.from, Math.min(day.until, observedAt))
  if (!recent) return { ...day, observedUntil, futureFrom: observedUntil < day.until ? observedUntil : null }
  const until = Math.min(day.until, Math.max(day.from + 3_600_000, observedUntil))
  const from = Math.max(day.from, until - 14_400_000)
  const ticks = Array.from({ length: 5 }, (_, index) => {
    const at = from + (until - from) * index / 4
    return { at, label: at === day.until ? '24:00' : marketTime(at, timezone) }
  })
  return { from, until, ticks, observedUntil, futureFrom: observedUntil < until ? observedUntil : null }
}
