/**
 * Pure 梁祠 archive policy.
 *
 * A day is the immutable source record. Week/month values are weighted by the
 * raw accepted-vote counts of their covered days — never by averaging daily
 * percentages or avatar tiers. The current day is deliberately excluded from
 * temporary week/month views until its business date has ended.
 */
import { DomainError, assertCount } from './errors.ts'
import { assertBusinessDate, type BusinessDate } from './case.ts'
import { deriveLiangziState, type LiangziState } from './liangzi.ts'

export const LIANG_ARCHIVE_SCHEMA_VERSION = 1
export const LIANG_ARCHIVE_AGGREGATION_POLICY_VERSION = 'liang-archive-v1-weighted-counts'

export interface LiangArchiveResult {
  upVotes: number
  downVotes: number
  uniqueVoters: number
  totalIncense: number
  upRatio: number | null
  downRatio: number | null
  liangziState: LiangziState
}

export interface LiangDayArchive extends LiangArchiveResult {
  businessDate: BusinessDate
  caseCount: number
  caseTitles: readonly string[]
  finalizedAt: number
  archiveVersion: number
  aggregationPolicyVersion: string
  liangziPolicyVersion: string
}

export interface LiangWeekArchive extends LiangArchiveResult {
  weekId: string
  startDate: BusinessDate
  endDate: BusinessDate
  coveredDays: number
  finalizedAt: number
  archiveVersion: number
  aggregationPolicyVersion: string
  liangziPolicyVersion: string
}

export interface LiangMonthArchive extends LiangArchiveResult {
  monthId: string
  startDate: BusinessDate
  endDate: BusinessDate
  coveredDays: number
  finalizedAt: number
  archiveVersion: number
  aggregationPolicyVersion: string
  liangziPolicyVersion: string
}

export interface LiangHistoryArchive {
  archiveVersion: number
  businessDate: BusinessDate
  businessTimezone: string
  stale: boolean
  days: readonly LiangDayArchive[]
  weeks: readonly LiangWeekArchive[]
  months: readonly LiangMonthArchive[]
  /**
   * Distinct installations that voted in the still-open week/month, excluding
   * today. Sealed week/month rows store their own distinct count. Missing on
   * older caches; the client then falls back to summing daily uniqueVoters.
   */
  openWeekUniqueVoters: number
  openMonthUniqueVoters: number
}

export interface TemporaryLiangPeriod extends LiangArchiveResult {
  kind: 'week' | 'month'
  periodId: string
  startDate: BusinessDate
  endDate: BusinessDate
  throughDate: BusinessDate | null
  coveredDays: number
  status: 'temporary' | 'waiting'
}

function dateParts(date: BusinessDate): { year: number, month: number, day: number } {
  assertBusinessDate(date)
  const [year, month, day] = date.split('-').map(Number)
  return { year: year as number, month: month as number, day: day as number }
}

function dateFromUtc(instant: Date): BusinessDate {
  return instant.toISOString().slice(0, 10)
}

export function addBusinessDays(date: BusinessDate, amount: number): BusinessDate {
  assertBusinessDate(date)
  if (!Number.isInteger(amount)) {
    throw new DomainError('invalid_policy', `business-day offset must be an integer, got ${String(amount)}`)
  }
  const { year, month, day } = dateParts(date)
  return dateFromUtc(new Date(Date.UTC(year, month - 1, day + amount)))
}

/** Monday-based ISO week bounds and identifier. */
export function isoWeekFor(date: BusinessDate): {
  weekId: string
  startDate: BusinessDate
  endDate: BusinessDate
} {
  const { year, month, day } = dateParts(date)
  const instant = new Date(Date.UTC(year, month - 1, day))
  const weekday = instant.getUTCDay() === 0 ? 7 : instant.getUTCDay()
  const start = new Date(instant)
  start.setUTCDate(instant.getUTCDate() - weekday + 1)
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 6)

  const thursday = new Date(instant)
  thursday.setUTCDate(instant.getUTCDate() + 4 - weekday)
  const isoYear = thursday.getUTCFullYear()
  const januaryFourth = new Date(Date.UTC(isoYear, 0, 4))
  const janWeekday = januaryFourth.getUTCDay() === 0 ? 7 : januaryFourth.getUTCDay()
  const firstMonday = new Date(januaryFourth)
  firstMonday.setUTCDate(januaryFourth.getUTCDate() - janWeekday + 1)
  const week = Math.floor((thursday.getTime() - firstMonday.getTime()) / 604_800_000) + 1

  return {
    weekId: `${isoYear}-W${String(week).padStart(2, '0')}`,
    startDate: dateFromUtc(start),
    endDate: dateFromUtc(end),
  }
}

export function monthFor(date: BusinessDate): {
  monthId: string
  startDate: BusinessDate
  endDate: BusinessDate
} {
  const { year, month } = dateParts(date)
  return {
    monthId: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`,
    startDate: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`,
    endDate: dateFromUtc(new Date(Date.UTC(year, month, 0))),
  }
}

export function deriveArchiveResult(
  upVotes: number,
  downVotes: number,
  uniqueVoters = 0,
): LiangArchiveResult {
  assertCount(upVotes, 'invalid_vote_count', 'upVotes')
  assertCount(downVotes, 'invalid_vote_count', 'downVotes')
  assertCount(uniqueVoters, 'invalid_vote_count', 'uniqueVoters')
  const totalIncense = upVotes + downVotes
  if (uniqueVoters > totalIncense) {
    throw new DomainError('invalid_vote_count', 'archive uniqueVoters cannot exceed total accepted votes')
  }
  return {
    upVotes,
    downVotes,
    uniqueVoters,
    totalIncense,
    upRatio: totalIncense === 0 ? null : upVotes / totalIncense,
    downRatio: totalIncense === 0 ? null : downVotes / totalIncense,
    liangziState: deriveLiangziState(upVotes, downVotes),
  }
}

export function sumDayArchives(
  days: readonly Pick<LiangDayArchive, 'upVotes' | 'downVotes' | 'uniqueVoters'>[],
): LiangArchiveResult {
  let upVotes = 0
  let downVotes = 0
  let uniqueVoters = 0
  for (const day of days) {
    assertCount(day.upVotes, 'invalid_vote_count', 'upVotes')
    assertCount(day.downVotes, 'invalid_vote_count', 'downVotes')
    assertCount(day.uniqueVoters, 'invalid_vote_count', 'uniqueVoters')
    upVotes += day.upVotes
    downVotes += day.downVotes
    uniqueVoters += day.uniqueVoters
    if (!Number.isSafeInteger(upVotes) || !Number.isSafeInteger(downVotes) || !Number.isSafeInteger(uniqueVoters)) {
      throw new DomainError('invalid_vote_count', 'archive vote aggregate exceeds safe integer range')
    }
  }
  return deriveArchiveResult(upVotes, downVotes, uniqueVoters)
}

/** One-install / demo-seed proxy: do not multiply the same pilgrims across days. */
export function maxDayUniqueVoters(
  days: readonly Pick<LiangDayArchive, 'uniqueVoters'>[],
): number {
  return days.reduce((max, day) => Math.max(max, day.uniqueVoters), 0)
}

function temporaryPeriod(
  kind: TemporaryLiangPeriod['kind'],
  businessDate: BusinessDate,
  days: readonly LiangDayArchive[],
  uniqueVoters?: number,
): TemporaryLiangPeriod {
  assertBusinessDate(businessDate)
  const bounds = kind === 'week' ? isoWeekFor(businessDate) : monthFor(businessDate)
  const periodId = kind === 'week'
    ? isoWeekFor(businessDate).weekId
    : monthFor(businessDate).monthId
  const included = days
    .filter(day => day.businessDate >= bounds.startDate
      && day.businessDate <= bounds.endDate
      && day.businessDate < businessDate)
    .sort((left, right) => left.businessDate.localeCompare(right.businessDate))
  const summed = sumDayArchives(included)
  const result = uniqueVoters === undefined
    ? summed
    : deriveArchiveResult(summed.upVotes, summed.downVotes, uniqueVoters)
  return {
    kind,
    periodId,
    startDate: bounds.startDate,
    endDate: bounds.endDate,
    throughDate: included.at(-1)?.businessDate ?? null,
    coveredDays: included.length,
    status: included.length === 0 ? 'waiting' : 'temporary',
    ...result,
  }
}

export function deriveTemporaryWeek(
  businessDate: BusinessDate,
  days: readonly LiangDayArchive[],
  uniqueVoters?: number,
): TemporaryLiangPeriod {
  return temporaryPeriod('week', businessDate, days, uniqueVoters)
}

export function deriveTemporaryMonth(
  businessDate: BusinessDate,
  days: readonly LiangDayArchive[],
  uniqueVoters?: number,
): TemporaryLiangPeriod {
  return temporaryPeriod('month', businessDate, days, uniqueVoters)
}
