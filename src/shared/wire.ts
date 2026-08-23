/**
 * Host <-> Client wire contracts. The wire carries RAW counts only; both
 * sides derive ratios / Liangzi state / LiangQi progress through the domain
 * constructors, so snapshot consistency and accounting invariants hold by
 * construction and a payload that cannot satisfy them fails validation.
 *
 * Every payload is validated at the boundary (host validates request bodies,
 * client validates responses/frames) — no blind casts of remote data.
 */
import {
  assertRequestId,
  assertValidCase,
  assertVoteType,
  isVoteType,
  VOTE_COUNT_MAX,
  VOTE_COUNT_MIN,
  type DailyLiangCase,
  type VoteRejectionReason,
  type VoteResult,
  type VoteType,
} from '../domain/index.ts'

export const WIRE_SCHEMA_VERSION = 1

/**
 * Authority modes the host can serve, honestly named by contract:
 *
 *   LOCAL_FAKE_DEV     everything in-process (`FakeAuthoritativeLiangService`)
 *   DEV_STAGING_ONLY   the online backend is authority, but identity is a
 *                      pseudonymous installation id and the Token figure is an
 *                      unverifiable host claim (Decision Gate A3, docs/043)
 *
 * `VERIFIED_PRODUCTION` is deliberately absent: nothing in this build can honor
 * it, so it must not be representable on the wire.
 */
export const AUTHORITY_MODES = ['LOCAL_FAKE_DEV', 'DEV_STAGING_ONLY'] as const
export type AuthorityMode = (typeof AUTHORITY_MODES)[number]

/** Host-owned manual configuration; never inferred from network reachability. */
export type HostAuthorityPreference = 'online' | 'local'

export function isAuthorityMode(value: unknown): value is AuthorityMode {
  return typeof value === 'string' && (AUTHORITY_MODES as readonly string[]).includes(value)
}

/** Raw global counts of one published snapshot (ratios derived client-side). */
export interface WireGlobalCounts {
  caseId: string
  upVotes: number
  downVotes: number
  uniqueVoters: number
  capturedAt: number
  sequence: number
  /** All-time accepted votes across archived cases; defaults to today. */
  lifetimeIncense: number
  /** All-time unique voters across archived cases; defaults to today. */
  lifetimeVoters: number
}

/** Raw personal accounting (LiangQi progress derived via the domain fold). */
export interface WirePersonalCounts {
  effectiveTokensToday: number
  usedIncenseToday: number
  /** Authoritative spendable incense (server ledger), for the vote button. */
  remainingIncense: number
  tokenPerIncense: number
}

/** Local observed-usage diagnostics (never prompts/paths/keys). */
export interface WireAccounting {
  /** False when the DSH projection/session seams are absent. */
  available: boolean
  inputTokensToday: number
  outputTokensToday: number
  /** Epoch ms of the last observed usage change; null before any. */
  observedAt: number | null
  /** Backend guard notice (e.g. an absurd claim was clamped); null normally. */
  notice: string | null
}

/** One full state frame (GET /state and every SSE frame). */
export interface LiangxiangWireState {
  schemaVersion: typeof WIRE_SCHEMA_VERSION
  /** Monotonic; stale frames must be dropped by the client. */
  revision: number
  /**
   * Host process start identity. Revision is process-local: a new epoch
   * means the Host restarted and the client must accept a low revision.
   */
  hostEpoch: number
  authorityMode: AuthorityMode
  /**
   * Whether the selected authority can currently be reached. Local mode is
   * always available. In online mode a false value means the Host keeps
   * observing/persisting Token usage, but voting must remain disabled until
   * the backend reconnects and the personal ledger is reconciled.
   */
  authorityAvailable: boolean
  /** Short safe reason for the latest online-authority failure; never a secret. */
  authorityReason: string | null
  snapshotRefreshSeconds: number
  businessDate: string
  /** Scalar signal only; 梁祠 arrays use the separate `/api/history` route. */
  archiveVersion: number
  activeCase: DailyLiangCase
  global: WireGlobalCounts
  personal: WirePersonalCounts
  accounting: WireAccounting
}

/** POST /vote body — minimum intent only (no self-reported balances/identity). */
export interface WireVoteRequest {
  caseId: string
  voteType: VoteType
  requestId: string
  count?: number
}

/** POST /vote response: the business result plus the fresh full state. */
export interface WireVoteResponse {
  schemaVersion: typeof WIRE_SCHEMA_VERSION
  result: VoteResult
  state: LiangxiangWireState
}

/** Boundary-validation failure, discriminated by the offending field path. */
export class WireError extends Error {
  readonly field: string

  constructor(field: string, message: string) {
    super(`${field}: ${message}`)
    this.name = 'WireError'
    this.field = field
  }
}

function asRecord(raw: unknown, field: string): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new WireError(field, 'expected an object')
  }
  return raw as Record<string, unknown>
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WireError(field, 'expected a non-empty string')
  }
  return value
}

function requireCount(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new WireError(field, 'expected a non-negative safe integer')
  }
  return value
}

function requireFinite(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new WireError(field, 'expected a finite number')
  }
  return value
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new WireError(field, 'expected a boolean')
  return value
}

const REJECTION_REASONS: readonly VoteRejectionReason[] = [
  'insufficient_incense',
  'case_not_active',
  'stale_case',
  'idempotency_conflict',
  'invalid_intent',
]

function parseCase(raw: unknown, field: string): DailyLiangCase {
  const record = asRecord(raw, field)
  const parsed: DailyLiangCase = {
    id: requireString(record.id, `${field}.id`),
    businessDate: requireString(record.businessDate, `${field}.businessDate`),
    title: requireString(record.title, `${field}.title`),
    status: requireString(record.status, `${field}.status`) as DailyLiangCase['status'],
    createdAt: requireFinite(record.createdAt, `${field}.createdAt`),
    tokenPerIncense: requireCount(record.tokenPerIncense, `${field}.tokenPerIncense`),
  }
  try {
    assertValidCase(parsed)
  } catch (error) {
    throw new WireError(field, error instanceof Error ? error.message : String(error))
  }
  return parsed
}

/** Validate one full state frame (domain invariants enforced downstream). */
export function parseWireState(raw: unknown): LiangxiangWireState {
  const record = asRecord(raw, 'state')
  if (record.schemaVersion !== WIRE_SCHEMA_VERSION) {
    throw new WireError('state.schemaVersion', `unsupported schema version ${String(record.schemaVersion)}`)
  }
  if (!isAuthorityMode(record.authorityMode)) {
    throw new WireError('state.authorityMode', `unknown authority mode ${String(record.authorityMode)}`)
  }
  const authorityMode = record.authorityMode
  const globalRecord = asRecord(record.global, 'state.global')
  const personalRecord = asRecord(record.personal, 'state.personal')
  const accountingRecord = asRecord(record.accounting, 'state.accounting')
  const uniqueVoters = requireCount(globalRecord.uniqueVoters, 'state.global.uniqueVoters')
  const upVotes = requireCount(globalRecord.upVotes, 'state.global.upVotes')
  const downVotes = requireCount(globalRecord.downVotes, 'state.global.downVotes')
  if (uniqueVoters > upVotes + downVotes) {
    throw new WireError('state.global.uniqueVoters', 'uniqueVoters exceeds total votes')
  }
  const personal: WirePersonalCounts = {
    effectiveTokensToday: requireCount(personalRecord.effectiveTokensToday, 'state.personal.effectiveTokensToday'),
    usedIncenseToday: requireCount(personalRecord.usedIncenseToday, 'state.personal.usedIncenseToday'),
    remainingIncense: requireCount(personalRecord.remainingIncense, 'state.personal.remainingIncense'),
    tokenPerIncense: requireCount(personalRecord.tokenPerIncense, 'state.personal.tokenPerIncense'),
  }
  if (personal.tokenPerIncense <= 0) {
    throw new WireError('state.personal.tokenPerIncense', 'must be positive')
  }
  if (personal.usedIncenseToday > Math.floor(personal.effectiveTokensToday / personal.tokenPerIncense)) {
    throw new WireError('state.personal.usedIncenseToday', 'used exceeds earned')
  }
  return {
    schemaVersion: WIRE_SCHEMA_VERSION,
    revision: requireCount(record.revision, 'state.revision'),
    hostEpoch: requireCount(record.hostEpoch, 'state.hostEpoch'),
    authorityMode,
    // Backward-compatible for one rolling client/Host upgrade: old Host
    // frames predate this additive field and were implicitly available.
    authorityAvailable: record.authorityAvailable === undefined
      ? true
      : requireBoolean(record.authorityAvailable, 'state.authorityAvailable'),
    authorityReason: record.authorityReason === undefined || record.authorityReason === null
      ? null
      : requireString(record.authorityReason, 'state.authorityReason'),
    snapshotRefreshSeconds: requireCount(record.snapshotRefreshSeconds, 'state.snapshotRefreshSeconds'),
    businessDate: requireString(record.businessDate, 'state.businessDate'),
    archiveVersion: record.archiveVersion === undefined
      ? 0
      : requireCount(record.archiveVersion, 'state.archiveVersion'),
    activeCase: parseCase(record.activeCase, 'state.activeCase'),
    global: {
      caseId: requireString(globalRecord.caseId, 'state.global.caseId'),
      upVotes,
      downVotes,
      uniqueVoters,
      capturedAt: requireFinite(globalRecord.capturedAt, 'state.global.capturedAt'),
      sequence: requireCount(globalRecord.sequence, 'state.global.sequence'),
      lifetimeIncense: globalRecord.lifetimeIncense === undefined
        ? upVotes + downVotes
        : requireCount(globalRecord.lifetimeIncense, 'state.global.lifetimeIncense'),
      lifetimeVoters: globalRecord.lifetimeVoters === undefined
        ? uniqueVoters
        : requireCount(globalRecord.lifetimeVoters, 'state.global.lifetimeVoters'),
    },
    personal,
    accounting: {
      available: requireBoolean(accountingRecord.available, 'state.accounting.available'),
      inputTokensToday: requireCount(accountingRecord.inputTokensToday, 'state.accounting.inputTokensToday'),
      outputTokensToday: requireCount(accountingRecord.outputTokensToday, 'state.accounting.outputTokensToday'),
      observedAt: accountingRecord.observedAt === null
        ? null
        : requireFinite(accountingRecord.observedAt, 'state.accounting.observedAt'),
      notice: accountingRecord.notice == null
        ? null
        : requireString(accountingRecord.notice, 'state.accounting.notice'),
    },
  }
}

/** Validate a vote request body (host boundary). */
export function parseWireVoteRequest(raw: unknown): WireVoteRequest {
  const record = asRecord(raw, 'vote')
  const caseId = requireString(record.caseId, 'vote.caseId')
  const voteType = record.voteType
  if (!isVoteType(voteType)) {
    throw new WireError('vote.voteType', `expected "up" or "down", got ${String(voteType)}`)
  }
  const requestId = requireString(record.requestId, 'vote.requestId')
  try {
    assertRequestId(requestId)
  } catch {
    throw new WireError('vote.requestId', 'must match [A-Za-z0-9._-]{8,128}')
  }
  let count: number | undefined
  if (record.count !== undefined) {
    count = requireCount(record.count, 'vote.count')
    if (count < VOTE_COUNT_MIN || count > VOTE_COUNT_MAX) {
      throw new WireError('vote.count', `expected an integer in [${VOTE_COUNT_MIN}, ${VOTE_COUNT_MAX}]`)
    }
  }
  return count === undefined ? { caseId, voteType, requestId } : { caseId, voteType, requestId, count }
}

/** Validate a vote result payload (client boundary). */
export function parseWireVoteResult(raw: unknown): VoteResult {
  const record = asRecord(raw, 'result')
  const requestId = requireString(record.requestId, 'result.requestId')
  if (record.status === 'accepted') {
    try {
      assertVoteType(record.voteType)
    } catch {
      throw new WireError('result.voteType', 'expected "up" or "down"')
    }
    return {
      status: 'accepted',
      requestId,
      voteType: record.voteType as VoteType,
      usedIncenseToday: requireCount(record.usedIncenseToday, 'result.usedIncenseToday'),
      remainingIncense: requireCount(record.remainingIncense, 'result.remainingIncense'),
      spentIncense: record.spentIncense === undefined
        ? 1
        : requireCount(record.spentIncense, 'result.spentIncense'),
    }
  }
  if (record.status === 'rejected') {
    const reason = record.reason
    if (typeof reason !== 'string' || !REJECTION_REASONS.includes(reason as VoteRejectionReason)) {
      throw new WireError('result.reason', `unknown rejection reason ${String(reason)}`)
    }
    return {
      status: 'rejected',
      requestId,
      reason: reason as VoteRejectionReason,
      message: requireString(record.message, 'result.message'),
    }
  }
  throw new WireError('result.status', `expected accepted/rejected, got ${String(record.status)}`)
}

/** Validate a full vote response (client boundary). */
export function parseWireVoteResponse(raw: unknown): WireVoteResponse {
  const record = asRecord(raw, 'voteResponse')
  if (record.schemaVersion !== WIRE_SCHEMA_VERSION) {
    throw new WireError('voteResponse.schemaVersion', `unsupported schema version ${String(record.schemaVersion)}`)
  }
  return {
    schemaVersion: WIRE_SCHEMA_VERSION,
    result: parseWireVoteResult(record.result),
    state: parseWireState(record.state),
  }
}
