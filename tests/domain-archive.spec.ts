import { describe, expect, it } from 'vitest'
import {
  addBusinessDays,
  deriveArchiveResult,
  deriveTemporaryMonth,
  deriveTemporaryWeek,
  isoWeekFor,
  isBusinessDate,
  monthFor,
  sumDayArchives,
  type LiangDayArchive,
} from '../src/domain/index.ts'

function day(businessDate: string, upVotes: number, downVotes: number): LiangDayArchive {
  return {
    businessDate,
    caseCount: 1,
    caseTitles: [`${businessDate} 梁案`],
    finalizedAt: 1,
    archiveVersion: 1,
    aggregationPolicyVersion: 'liang-archive-v1-weighted-counts',
    liangziPolicyVersion: 'liangzi-v0.1-50-70-85-95',
    ...deriveArchiveResult(upVotes, downVotes),
  }
}

describe('archive calendar policy', () => {
  it('validates real Gregorian dates and crosses leap/month/year boundaries in UTC', () => {
    expect(isBusinessDate('2024-02-29')).toBe(true)
    expect(isBusinessDate('2023-02-29')).toBe(false)
    expect(isBusinessDate('2026-13-01')).toBe(false)
    expect(addBusinessDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addBusinessDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('derives ISO weeks across the year boundary', () => {
    expect(isoWeekFor('2025-12-29')).toEqual({
      weekId: '2026-W01',
      startDate: '2025-12-29',
      endDate: '2026-01-04',
    })
    expect(isoWeekFor('2026-08-17')).toEqual({
      weekId: '2026-W34',
      startDate: '2026-08-17',
      endDate: '2026-08-23',
    })
    expect(monthFor('2024-02-29')).toEqual({
      monthId: '2024-02',
      startDate: '2024-02-01',
      endDate: '2024-02-29',
    })
  })
})

describe('weighted 梁 archive policy', () => {
  it('weights raw accepted votes instead of averaging daily percentages', () => {
    const result = sumDayArchives([
      day('2026-08-01', 9, 1),
      day('2026-08-02', 1, 99),
    ])
    expect(result).toMatchObject({ upVotes: 10, downVotes: 100, totalIncense: 110, uniqueVoters: 0 })
    expect(result.upRatio).toBeCloseTo(10 / 110)
    expect(result.liangziState).toBe('liang_gong')
  })

  it('keeps zero-vote archives as WAITING with null ratios', () => {
    expect(deriveArchiveResult(0, 0)).toEqual({
      upVotes: 0,
      downVotes: 0,
      uniqueVoters: 0,
      totalIncense: 0,
      upRatio: null,
      downRatio: null,
      liangziState: 'waiting',
    })
  })

  it('excludes today from current week/month temporary values', () => {
    const days = [
      day('2026-08-16', 9, 1),
      day('2026-08-17', 0, 10),
      day('2026-08-18', 10, 0),
    ]
    expect(deriveTemporaryWeek('2026-08-18', days)).toMatchObject({
      periodId: '2026-W34',
      throughDate: '2026-08-17',
      coveredDays: 1,
      upVotes: 0,
      downVotes: 10,
    })
    expect(deriveTemporaryMonth('2026-08-17', days)).toMatchObject({
      periodId: '2026-08',
      throughDate: '2026-08-16',
      coveredDays: 1,
      upVotes: 9,
      downVotes: 1,
    })
  })

  it('keeps uniqueVoters on day sums and accepts a distinct override for temporary periods', () => {
    const days = [
      { ...day('2026-08-17', 2, 0), ...deriveArchiveResult(2, 0, 1) },
      { ...day('2026-08-18', 0, 3), ...deriveArchiveResult(0, 3, 1) },
    ]
    expect(sumDayArchives(days).uniqueVoters).toBe(2)
    expect(deriveTemporaryWeek('2026-08-19', days).uniqueVoters).toBe(2)
    expect(deriveTemporaryWeek('2026-08-19', days, 1).uniqueVoters).toBe(1)
    expect(() => deriveArchiveResult(1, 0, 2)).toThrow(/uniqueVoters/)
  })

  it('shows waiting on Monday and the first day of a month', () => {
    expect(deriveTemporaryWeek('2026-08-17', [])).toMatchObject({
      status: 'waiting',
      throughDate: null,
      coveredDays: 0,
      liangziState: 'waiting',
    })
    expect(deriveTemporaryMonth('2026-08-01', [])).toMatchObject({ status: 'waiting' })
  })
})
