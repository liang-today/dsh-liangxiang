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
  return typeof value === 'string' && BUSINESS_DATE_PATTERN.test(value)
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

export function assertValidCase(candidate: DailyLiangCase): void {
  if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
    throw new DomainError('invalid_policy', 'case id must be a non-empty string')
  }
  assertBusinessDate(candidate.businessDate)
  if (typeof candidate.title !== 'string' || candidate.title.length === 0) {
    throw new DomainError('invalid_policy', 'case title must be a non-empty string')
  }
  if (candidate.status !== 'scheduled' && candidate.status !== 'active' && candidate.status !== 'closed') {
    throw new DomainError('invalid_policy', `unknown case status: ${String(candidate.status)}`)
  }
  assertTokenPerIncense(candidate.tokenPerIncense)
}
