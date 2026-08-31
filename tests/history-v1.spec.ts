import { describe, expect, it } from 'vitest'
import {
  historyArchiveToV1,
  mergeHistoryArchive,
  parseV1HistoryResponse,
} from '../src/shared/index.ts'

const base = {
  schema_version: 1,
  archive_schema_version: 1,
  archive_version: 2,
  business_date: '2026-08-17',
  business_timezone: 'Europe/London',
  full: true,
  stale: false,
  days: [{
    business_date: '2026-08-16',
    case_count: 2,
    case_titles: ['甲案', '乙案'],
    up_votes: 7,
    down_votes: 3,
    finalized_at: 123,
    archive_version: 1,
    aggregation_policy_version: 'liang-archive-v1-weighted-counts',
    liangzi_policy_version: 'liangzi-v0.1-50-70-85-95',
  }],
  weeks: [],
  months: [],
} as const

describe('history v1 boundary', () => {
  it('parses raw counts and derives one self-consistent archive state', () => {
    const parsed = parseV1HistoryResponse(base)
    expect(parsed.days[0]).toMatchObject({
      businessDate: '2026-08-16',
      caseCount: 2,
      totalIncense: 10,
      upRatio: 0.7,
      liangziState: 'liang_shen',
    })
    expect(parsed.days[0]?.uniqueVoters).toBe(0)
    expect(parsed.openWeekUniqueVoters).toBe(0)
    expect(parseV1HistoryResponse(historyArchiveToV1(parsed, true))).toEqual(parsed)
  })

  it('round-trips unique voters and open-period pilgrim counts', () => {
    const parsed = parseV1HistoryResponse({
      ...base,
      open_week_unique_voters: 4,
      open_month_unique_voters: 9,
      days: [{ ...base.days[0], unique_voters: 3 }],
    })
    expect(parsed.days[0]?.uniqueVoters).toBe(3)
    expect(parsed.openWeekUniqueVoters).toBe(4)
    expect(parsed.openMonthUniqueVoters).toBe(9)
    expect(parseV1HistoryResponse(historyArchiveToV1(parsed, true))).toEqual(parsed)
  })

  it('rejects impossible dates, title counts, period bounds and future row versions', () => {
    expect(() => parseV1HistoryResponse({
      ...base,
      days: [{ ...base.days[0], business_date: '2026-02-30' }],
    })).toThrow(/calendar date/)
    expect(() => parseV1HistoryResponse({
      ...base,
      days: [{ ...base.days[0], case_count: 1 }],
    })).toThrow(/case_count/)
    expect(() => parseV1HistoryResponse({
      ...base,
      days: [{ ...base.days[0], archive_version: 3 }],
    })).toThrow(/archive_version/)
    expect(() => parseV1HistoryResponse({
      ...base,
      weeks: [{
        week_id: '2026-W34', start_date: '2026-08-17', end_date: '2026-08-24', covered_days: 1,
        up_votes: 1, down_votes: 0, finalized_at: 1, archive_version: 2,
        aggregation_policy_version: 'liang-archive-v1-weighted-counts',
        liangzi_policy_version: 'liangzi-v0.1-50-70-85-95',
      }],
    })).toThrow(/Monday-Sunday/)
  })

  it('merges a delta by stable archive keys without duplicating old rows', () => {
    const first = parseV1HistoryResponse(base)
    const delta = parseV1HistoryResponse({
      ...base,
      archive_version: 3,
      full: false,
      days: [{ ...base.days[0], business_date: '2026-08-17', case_count: 1, case_titles: ['丙案'], archive_version: 3 }],
    })
    const merged = mergeHistoryArchive(first, delta)
    expect(merged.archiveVersion).toBe(3)
    expect(merged.days.map(day => day.businessDate)).toEqual(['2026-08-16', '2026-08-17'])
  })
})
