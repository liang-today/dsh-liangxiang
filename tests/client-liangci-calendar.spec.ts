import { describe, expect, it } from 'vitest'
import { calendarDates, isCompactLiangciMonth } from '../src/client/LiangciModal.tsx'

describe('梁祠 month grid', () => {
  it('uses only the calendar rows the month actually needs', () => {
    expect(calendarDates('2021-02')).toHaveLength(28) // Monday-start, 4 weeks
    expect(calendarDates('2026-08')).toHaveLength(42) // Saturday-start, 6 weeks
    expect(calendarDates('2026-09')).toHaveLength(35) // Tuesday-start, 5 weeks
  })

  it('still returns complete Monday-to-Sunday rows', () => {
    for (const month of ['2021-02', '2026-08', '2026-09']) {
      const dates = calendarDates(month)
      expect(dates.length % 7).toBe(0)
      expect(dates.some(date => date.startsWith(month))).toBe(true)
    }
  })

  it('compacts six-row artwork without changing the dialog height', () => {
    expect(isCompactLiangciMonth(calendarDates('2026-08').length / 7)).toBe(true)
    expect(isCompactLiangciMonth(calendarDates('2026-09').length / 7)).toBe(false)
  })
})
