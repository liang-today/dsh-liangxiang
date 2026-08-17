/**
 * DailyLiangCase — normally one active binary case per business date.
 * Real uniqueness enforcement belongs to the future backend; the domain only
 * carries the vocabulary and validation.
 */
import { DomainError } from './errors.ts'
import { assertTokenPerIncense } from './tokens.ts'

/** Calendar day in the business timezone, ISO `YYYY-MM-DD`. */
export type BusinessDate = string

const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function isBusinessDate(value: unknown): value is BusinessDate {
  if (typeof value !== 'string' || !BUSINESS_DATE_PATTERN.test(value)) return false
  const [yearText, monthText, dayText] = value.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const instant = new Date(Date.UTC(year, month - 1, day))
  return instant.getUTCFullYear() === year
    && instant.getUTCMonth() === month - 1
    && instant.getUTCDate() === day
}

export function assertBusinessDate(value: unknown): asserts value is BusinessDate {
  if (!isBusinessDate(value)) {
    throw new DomainError('invalid_business_date', `business date must be YYYY-MM-DD, got ${String(value)}`)
  }
}

export type CaseStatus = 'scheduled' | 'active' | 'closed'

export interface DailyLiangCase {
  id: string
  businessDate: BusinessDate
  /** Product copy, e.g. `DeepSeek Harness 是夯还是拉`. */
  title: string
  status: CaseStatus
  /** Epoch milliseconds. */
  createdAt: number
  /** Case-scoped token policy (default 50,000). */
  tokenPerIncense: number
}

/** Validate a case (the parameter is named `value`: 梁相 has no Candidate concept). */
export function assertValidCase(value: DailyLiangCase): void {
  if (typeof value.id !== 'string' || value.id.length === 0) {
    throw new DomainError('invalid_policy', 'case id must be a non-empty string')
  }
  assertBusinessDate(value.businessDate)
  if (typeof value.title !== 'string' || value.title.length === 0) {
    throw new DomainError('invalid_policy', 'case title must be a non-empty string')
  }
  if (value.status !== 'scheduled' && value.status !== 'active' && value.status !== 'closed') {
    throw new DomainError('invalid_policy', `unknown case status: ${String(value.status)}`)
  }
  assertTokenPerIncense(value.tokenPerIncense)
}
