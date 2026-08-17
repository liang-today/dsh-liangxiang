/**
 * `/v1/history` contract shared by backend and Host.
 *
 * The wire keeps immutable raw vote counts. Ratios and Liangzi state are
 * re-derived after strict validation so an archive cannot carry a percentage
 * or portrait that disagrees with its counts.
 */
import {
  LIANG_ARCHIVE_AGGREGATION_POLICY_VERSION,
  LIANG_ARCHIVE_SCHEMA_VERSION,
  deriveArchiveResult,
  isBusinessDate,
  isoWeekFor,
  monthFor,
  type LiangDayArchive,
  type LiangHistoryArchive,
  type LiangMonthArchive,
  type LiangWeekArchive,
} from '../domain/index.ts'
import { BACKEND_SCHEMA_VERSION, LIANGZI_POLICY_VERSION } from './backend-v1.ts'
import { WireError } from './wire.ts'

export interface V1HistoryDay {
  business_date: string
  case_count: number
  case_titles: string[]
  up_votes: number
  down_votes: number
  finalized_at: number
  archive_version: number
  aggregation_policy_version: string
  liangzi_policy_version: string
}

export interface V1HistoryWeek {
  week_id: string
  start_date: string
  end_date: string
  covered_days: number
  up_votes: number
  down_votes: number
  finalized_at: number
  archive_version: number
  aggregation_policy_version: string
  liangzi_policy_version: string
}

export interface V1HistoryMonth {
  month_id: string
  start_date: string
  end_date: string
  covered_days: number
  up_votes: number
  down_votes: number
  finalized_at: number
  archive_version: number
  aggregation_policy_version: string
  liangzi_policy_version: string
}

export interface V1HistoryResponse {
  schema_version: typeof BACKEND_SCHEMA_VERSION
  archive_schema_version: typeof LIANG_ARCHIVE_SCHEMA_VERSION
  archive_version: number
  business_date: string
  business_timezone: string
  /** true for the initial archive; false for `after_version` deltas. */
  full: boolean
  /** Host-only degraded marker. The backend normally returns false. */
  stale: boolean
  days: V1HistoryDay[]
  weeks: V1HistoryWeek[]
  months: V1HistoryMonth[]
}

export interface ParsedHistoryArchive extends LiangHistoryArchive {
  full: boolean
}

function record(raw: unknown, field: string): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new WireError(field, 'expected an object')
  }
  return raw as Record<string, unknown>
}

function string(raw: unknown, field: string): string {
  if (typeof raw !== 'string' || raw.length === 0) throw new WireError(field, 'expected a non-empty string')
  return raw
}

function count(raw: unknown, field: string): number {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 0) {
    throw new WireError(field, 'expected a non-negative safe integer')
  }
  return raw
}

function positiveCount(raw: unknown, field: string): number {
  const value = count(raw, field)
  if (value === 0) throw new WireError(field, 'expected a positive safe integer')
  return value
}

function finite(raw: unknown, field: string): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) throw new WireError(field, 'expected a finite number')
  return raw
}

function date(raw: unknown, field: string): string {
  const value = string(raw, field)
  if (!isBusinessDate(value)) throw new WireError(field, 'expected a real YYYY-MM-DD calendar date')
  return value
}

function boolean(raw: unknown, field: string): boolean {
  if (typeof raw !== 'boolean') throw new WireError(field, 'expected a boolean')
  return raw
}

function policy(raw: unknown, field: string, expected: string): string {
  const value = string(raw, field)
  if (value !== expected) throw new WireError(field, `unsupported policy ${value}`)
  return value
}

function array(raw: unknown, field: string): unknown[] {
  if (!Array.isArray(raw)) throw new WireError(field, 'expected an array')
  return raw
}

function parseDay(raw: unknown, field: string, envelopeVersion: number): LiangDayArchive {
  const value = record(raw, field)
  const businessDate = date(value.business_date, `${field}.business_date`)
  const caseCount = positiveCount(value.case_count, `${field}.case_count`)
  const titles = array(value.case_titles, `${field}.case_titles`).map((title, index) =>
    string(title, `${field}.case_titles[${index}]`))
  if (titles.length !== caseCount) {
    throw new WireError(`${field}.case_titles`, 'length must match case_count')
  }
  const archiveVersion = positiveCount(value.archive_version, `${field}.archive_version`)
  if (archiveVersion > envelopeVersion) {
    throw new WireError(`${field}.archive_version`, 'cannot exceed the response archive_version')
  }
  return {
    businessDate,
    caseCount,
    caseTitles: titles,
    finalizedAt: finite(value.finalized_at, `${field}.finalized_at`),
    archiveVersion,
    aggregationPolicyVersion: policy(
      value.aggregation_policy_version,
      `${field}.aggregation_policy_version`,
      LIANG_ARCHIVE_AGGREGATION_POLICY_VERSION,
    ),
    liangziPolicyVersion: policy(
      value.liangzi_policy_version,
      `${field}.liangzi_policy_version`,
      LIANGZI_POLICY_VERSION,
    ),
    ...deriveArchiveResult(
      count(value.up_votes, `${field}.up_votes`),
      count(value.down_votes, `${field}.down_votes`),
    ),
  }
}

function parseWeek(raw: unknown, field: string, envelopeVersion: number): LiangWeekArchive {
  const value = record(raw, field)
  const startDate = date(value.start_date, `${field}.start_date`)
  const endDate = date(value.end_date, `${field}.end_date`)
  const expected = isoWeekFor(startDate)
  const weekId = string(value.week_id, `${field}.week_id`)
  if (weekId !== expected.weekId || startDate !== expected.startDate || endDate !== expected.endDate) {
    throw new WireError(field, 'week id/bounds do not form one ISO Monday-Sunday week')
  }
  const archiveVersion = positiveCount(value.archive_version, `${field}.archive_version`)
  if (archiveVersion > envelopeVersion) throw new WireError(`${field}.archive_version`, 'exceeds response version')
  return {
    weekId,
    startDate,
    endDate,
    coveredDays: positiveCount(value.covered_days, `${field}.covered_days`),
    finalizedAt: finite(value.finalized_at, `${field}.finalized_at`),
    archiveVersion,
    aggregationPolicyVersion: policy(
      value.aggregation_policy_version,
      `${field}.aggregation_policy_version`,
      LIANG_ARCHIVE_AGGREGATION_POLICY_VERSION,
    ),
    liangziPolicyVersion: policy(
      value.liangzi_policy_version,
      `${field}.liangzi_policy_version`,
      LIANGZI_POLICY_VERSION,
    ),
    ...deriveArchiveResult(
      count(value.up_votes, `${field}.up_votes`),
      count(value.down_votes, `${field}.down_votes`),
    ),
  }
}

function parseMonth(raw: unknown, field: string, envelopeVersion: number): LiangMonthArchive {
  const value = record(raw, field)
  const startDate = date(value.start_date, `${field}.start_date`)
  const endDate = date(value.end_date, `${field}.end_date`)
  const expected = monthFor(startDate)
  const monthId = string(value.month_id, `${field}.month_id`)
  if (monthId !== expected.monthId || startDate !== expected.startDate || endDate !== expected.endDate) {
    throw new WireError(field, 'month id/bounds do not form one calendar month')
  }
  const archiveVersion = positiveCount(value.archive_version, `${field}.archive_version`)
  if (archiveVersion > envelopeVersion) throw new WireError(`${field}.archive_version`, 'exceeds response version')
  return {
    monthId,
    startDate,
    endDate,
    coveredDays: positiveCount(value.covered_days, `${field}.covered_days`),
    finalizedAt: finite(value.finalized_at, `${field}.finalized_at`),
    archiveVersion,
    aggregationPolicyVersion: policy(
      value.aggregation_policy_version,
      `${field}.aggregation_policy_version`,
      LIANG_ARCHIVE_AGGREGATION_POLICY_VERSION,
    ),
    liangziPolicyVersion: policy(
      value.liangzi_policy_version,
      `${field}.liangzi_policy_version`,
      LIANGZI_POLICY_VERSION,
    ),
    ...deriveArchiveResult(
      count(value.up_votes, `${field}.up_votes`),
      count(value.down_votes, `${field}.down_votes`),
    ),
  }
}

function ensureUnique<T>(items: readonly T[], key: (item: T) => string, field: string): void {
  const seen = new Set<string>()
  for (const item of items) {
    const id = key(item)
    if (seen.has(id)) throw new WireError(field, `duplicate archive key ${id}`)
    seen.add(id)
  }
}

export function parseV1HistoryResponse(raw: unknown): ParsedHistoryArchive {
  const value = record(raw, 'historyResponse')
  if (value.schema_version !== BACKEND_SCHEMA_VERSION) {
    throw new WireError('historyResponse.schema_version', `unsupported schema version ${String(value.schema_version)}`)
  }
  if (value.archive_schema_version !== LIANG_ARCHIVE_SCHEMA_VERSION) {
    throw new WireError(
      'historyResponse.archive_schema_version',
      `unsupported archive schema version ${String(value.archive_schema_version)}`,
    )
  }
  const archiveVersion = count(value.archive_version, 'historyResponse.archive_version')
  const days = array(value.days, 'historyResponse.days').map((item, index) =>
    parseDay(item, `historyResponse.days[${index}]`, archiveVersion))
  const weeks = array(value.weeks, 'historyResponse.weeks').map((item, index) =>
    parseWeek(item, `historyResponse.weeks[${index}]`, archiveVersion))
  const months = array(value.months, 'historyResponse.months').map((item, index) =>
    parseMonth(item, `historyResponse.months[${index}]`, archiveVersion))
  ensureUnique(days, item => item.businessDate, 'historyResponse.days')
  ensureUnique(weeks, item => item.weekId, 'historyResponse.weeks')
  ensureUnique(months, item => item.monthId, 'historyResponse.months')
  return {
    archiveVersion,
    businessDate: date(value.business_date, 'historyResponse.business_date'),
    businessTimezone: string(value.business_timezone, 'historyResponse.business_timezone'),
    full: boolean(value.full, 'historyResponse.full'),
    stale: boolean(value.stale, 'historyResponse.stale'),
    days,
    weeks,
    months,
  }
}

function replaceByKey<T>(current: readonly T[], incoming: readonly T[], key: (item: T) => string): T[] {
  const values = new Map(current.map(item => [key(item), item]))
  for (const item of incoming) values.set(key(item), item)
  return [...values.values()]
}

/** Merge one immutable version delta into a Host/client last-known-good cache. */
export function mergeHistoryArchive(
  current: LiangHistoryArchive | null,
  incoming: ParsedHistoryArchive,
): LiangHistoryArchive {
  if (current === null || incoming.full) {
    return { ...incoming, days: [...incoming.days], weeks: [...incoming.weeks], months: [...incoming.months] }
  }
  if (incoming.archiveVersion < current.archiveVersion) return current
  return {
    archiveVersion: incoming.archiveVersion,
    businessDate: incoming.businessDate,
    businessTimezone: incoming.businessTimezone,
    stale: incoming.stale,
    days: replaceByKey(current.days, incoming.days, item => item.businessDate)
      .sort((left, right) => left.businessDate.localeCompare(right.businessDate)),
    weeks: replaceByKey(current.weeks, incoming.weeks, item => item.weekId)
      .sort((left, right) => left.startDate.localeCompare(right.startDate)),
    months: replaceByKey(current.months, incoming.months, item => item.monthId)
      .sort((left, right) => left.startDate.localeCompare(right.startDate)),
  }
}

export function historyArchiveToV1(
  history: LiangHistoryArchive,
  full: boolean,
): V1HistoryResponse {
  return {
    schema_version: BACKEND_SCHEMA_VERSION,
    archive_schema_version: LIANG_ARCHIVE_SCHEMA_VERSION,
    archive_version: history.archiveVersion,
    business_date: history.businessDate,
    business_timezone: history.businessTimezone,
    full,
    stale: history.stale,
    days: history.days.map(day => ({
      business_date: day.businessDate,
      case_count: day.caseCount,
      case_titles: [...day.caseTitles],
      up_votes: day.upVotes,
      down_votes: day.downVotes,
      finalized_at: day.finalizedAt,
      archive_version: day.archiveVersion,
      aggregation_policy_version: day.aggregationPolicyVersion,
      liangzi_policy_version: day.liangziPolicyVersion,
    })),
    weeks: history.weeks.map(week => ({
      week_id: week.weekId,
      start_date: week.startDate,
      end_date: week.endDate,
      covered_days: week.coveredDays,
      up_votes: week.upVotes,
      down_votes: week.downVotes,
      finalized_at: week.finalizedAt,
      archive_version: week.archiveVersion,
      aggregation_policy_version: week.aggregationPolicyVersion,
      liangzi_policy_version: week.liangziPolicyVersion,
    })),
    months: history.months.map(month => ({
      month_id: month.monthId,
      start_date: month.startDate,
      end_date: month.endDate,
      covered_days: month.coveredDays,
      up_votes: month.upVotes,
      down_votes: month.downVotes,
      finalized_at: month.finalizedAt,
      archive_version: month.archiveVersion,
      aggregation_policy_version: month.aggregationPolicyVersion,
      liangzi_policy_version: month.liangziPolicyVersion,
    })),
  }
}

export function emptyHistoryArchive(businessDate: string, businessTimezone: string): LiangHistoryArchive {
  if (!isBusinessDate(businessDate)) throw new WireError('business_date', 'expected a real YYYY-MM-DD date')
  return {
    archiveVersion: 0,
    businessDate,
    businessTimezone,
    stale: false,
    days: [],
    weeks: [],
    months: [],
  }
}
