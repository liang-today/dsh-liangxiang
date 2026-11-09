import { describe, expect, it } from 'vitest'
import { marketDayDomain, marketTimeWindow } from '../src/client/market/time-window.ts'

const HOUR = 3_600_000

describe('business-day chart window', () => {
  it('keeps midnight through 24:00 visible even before the first 09:00 batch', () => {
    const day = marketDayDomain('2026-11-06', 'Asia/Shanghai')
    const morning = Date.UTC(2026, 10, 6, 0)
    const window = marketTimeWindow(day, morning, 'Asia/Shanghai')
    expect(window.from).toBe(Date.UTC(2026, 10, 5, 16))
    expect(window.until).toBe(Date.UTC(2026, 10, 6, 16))
    expect(window.ticks.map(tick => tick.label)).toEqual(['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'])
    expect(window.futureFrom).toBe(morning)
    expect(window.observedUntil).toBe(morning)
  })

  it.each([
    ['2026-03-29', Date.UTC(2026, 2, 29), Date.UTC(2026, 2, 29, 23), 23, Date.UTC(2026, 2, 29, 3)],
    ['2026-10-25', Date.UTC(2026, 9, 24, 23), Date.UTC(2026, 9, 26), 25, Date.UTC(2026, 9, 25, 4)],
  ] as const)('resolves both midnights and clock ticks on London DST day %s', (date, start, end, duration, four) => {
    const day = marketDayDomain(date, 'Europe/London')
    expect(day.from).toBe(start)
    expect(day.until).toBe(end)
    expect(day.until - day.from).toBe(duration * HOUR)
    expect(day.ticks.find(tick => tick.label === '04:00')!.at).toBe(four)
    expect(day.ticks[6]).toEqual({ at: end, label: '24:00' })
  })

  it('clamps future area to the selected day and retains an explicit recent choice', () => {
    const day = marketDayDomain('2026-11-06', 'UTC')
    expect(marketTimeWindow(day, day.until + HOUR, 'UTC').futureFrom).toBeNull()
    expect(marketTimeWindow(day, day.from - HOUR, 'UTC').futureFrom).toBe(day.from)
    const recent = marketTimeWindow(day, day.from + 19 * HOUR, 'UTC', true)
    expect(recent.from).toBe(day.from + 15 * HOUR)
    expect(recent.until).toBe(day.from + 19 * HOUR)
    expect(recent.ticks.map(tick => tick.label)).toEqual(['15:00', '16:00', '17:00', '18:00', '19:00'])
    expect(recent.futureFrom).toBeNull()
  })

  it('starts at the first actual instant when a DST change skips midnight', () => {
    const day = marketDayDomain('2026-09-06', 'America/Santiago')
    expect(day.from).toBe(Date.UTC(2026, 8, 6, 4)) // The local date begins at 01:00.
    expect(day.until).toBe(Date.UTC(2026, 8, 7, 3))
    expect(day.until - day.from).toBe(23 * HOUR)
    expect(day.ticks[0]).toEqual({ at: day.from, label: '00:00' })
    expect(day.ticks[1]).toEqual({ at: Date.UTC(2026, 8, 6, 7), label: '04:00' })
  })
})
