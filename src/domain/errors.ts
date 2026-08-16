/**
 * Discriminated domain errors. Every invalid input fails loudly with a stable
 * `code` so boundaries (host routes, client store, tests) can branch without
 * string-matching messages.
 */

export type DomainErrorCode =
  | 'invalid_token_count'
  | 'invalid_incense_count'
  | 'invalid_vote_count'
  | 'used_exceeds_earned'
  | 'invalid_policy'
  | 'invalid_vote_type'
  | 'invalid_request_id'
  | 'invalid_business_date'
  | 'insufficient_incense'

export class DomainError extends Error {
  readonly code: DomainErrorCode

  constructor(code: DomainErrorCode, message: string) {
    super(message)
    this.name = 'DomainError'
    this.code = code
  }
}

/** Non-negative safe integer guard shared by all count-like inputs. */
export function assertCount(value: number, code: DomainErrorCode, label: string): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new DomainError(code, `${label} must be a non-negative safe integer, got ${String(value)}`)
  }
}
