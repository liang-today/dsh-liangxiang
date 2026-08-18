/**
 * Liangxiang Backend `/v1` JSON contract, shared by the backend (which serves
 * it) and the DSH host half (which consumes it). Pure TypeScript: no Node, no
 * DSH, no React.
 *
 * Shape rules:
 *  - the wire carries RAW counts; ratios / Liangzi state / LiangQi progress are
 *    derived through `domain/` on both sides, so a payload that cannot satisfy
 *    the frozen invariants fails validation instead of rendering nonsense;
 *  - the snapshot additionally carries the backend's own derived ratios and
 *    `liangzi_state` because the contract mandates them — the host re-derives
 *    them from the same row and REJECTS the frame on disagreement, which is
 *    what keeps "ratios and state share one snapshot version" honest across
 *    the process boundary;
 *  - a vote body is the minimum intent only (`case_id`, `vote_type`,
 *    `request_id`). Identity travels in the installation header and personal
 *    accounting is never accepted from the caller (AGENTS.md §9).
 *
 * Trust: under Decision Gate A3 the installation id is a PSEUDONYMOUS
 * installation identifier and the token figure is an UNVERIFIABLE CLAIM. The
 * field names say so on purpose (`claimed_effective_tokens`, `claim_source`,
 * `claim_verified: false`) — nothing here may be relabelled as authenticated
 * identity or server-verified usage.
 */
import {
  ACTIVE_LIANGZI_STATES,
  DEFAULT_LIANGZI_THRESHOLDS,
  LIANGZI_STATES,
  deriveLiangziState,
  isVoteType,
  type LiangziState,
  type LiangziThresholdPolicy,
  type VoteRejectionReason,
  type VoteType,
} from '../domain/index.ts'
import { WireError } from './wire.ts'

export const BACKEND_API_PREFIX = '/v1'
export const BACKEND_SCHEMA_VERSION = 1

/** Frozen id of the shipped Liangzi threshold policy (50/70/85/95). */
export const LIANGZI_POLICY_VERSION = 'liangzi-v0.1-50-70-85-95'

/**
 * Authority modes. `VERIFIED_PRODUCTION` requires server-verifiable identity
 * AND server-verifiable Token usage; Decision Gate A = A3 (docs/043) means it
 * is NOT reachable today, so the backend refuses to boot in that mode.
 *
 * Community Ed25519 keys prove the *installation* holds a private key. They
 * do not verify DSH Token usage. The mode stays DEV_STAGING_ONLY.
 */
export const AUTHORITY_MODES = ['DEV_STAGING_ONLY', 'VERIFIED_PRODUCTION'] as const
export type BackendAuthorityMode = (typeof AUTHORITY_MODES)[number]

/** Pseudonymous installation id header (NOT DSH authentication). */
export const INSTALLATION_HEADER = 'x-liangxiang-installation'
/** Raw Ed25519 public key, base64url (32 bytes). */
export const PUBLIC_KEY_HEADER = 'x-liangxiang-public-key'
/** Ed25519 signature of `communityAuthMessage`, base64url. */
export const SIGNATURE_HEADER = 'x-liangxiang-signature'
/** Unix milliseconds used in the signed message. */
export const TIMESTAMP_HEADER = 'x-liangxiang-timestamp'
/** Optional SHA-256/base64url of local MAC set (sybil cost, spoofable). */
export const DEVICE_HEADER = 'x-liangxiang-device'
/** Shared community admission key when the server has LIANGXIANG_COMMUNITY_KEY. */
export const COMMUNITY_KEY_HEADER = 'x-liangxiang-community-key'

export interface V1AdmissionTicket {
  ticket_id: string
  secret: string
  remaining_claims: number
  expires_at: number
}

export interface V1AdmissionTicketsResponse {
  schema_version: typeof BACKEND_SCHEMA_VERSION
  server_time: number
  available_claims: number
  tickets: V1AdmissionTicket[]
}

export interface V1AdmissionClaimRequest {
  ticket_secret: string
  public_key: string
  device_fingerprint: string
}

export interface V1AdmissionClaimResponse {
  schema_version: typeof BACKEND_SCHEMA_VERSION
  claimed: boolean
  installation_id: string
  ticket_id: string | null
  server_time: number
}

/** Self-minted installation ids: uuid-ish, url-safe, bounded. */
const INSTALLATION_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/

/** Canonical string the Host signs and the backend verifies. */
export function communityAuthMessage(input: {
  method: string
  path: string
  timestamp: string
  bodySha256: string
  installationId: string
}): string {
  return [
    'liangxiang-v1',
    input.method.toUpperCase(),
    input.path,
    input.timestamp,
    input.bodySha256,
    input.installationId,
  ].join('\n')
}

/** The only token-claim provenance A3 can offer. */
export const CLAIM_SOURCE_HOST_OBSERVED = 'host_observed_unverified'

export interface V1TokenPolicy {
  token_per_incense: number
  /** Effective Token = Input + Output (AGENTS.md §5); no cache-read weighting. */
  effective_token_formula: 'input_plus_output'
}

export interface V1LiangziPolicy {
  version: string
  boundaries: [number, number, number, number]
}

export interface V1Case {
  id: string
  business_date: string
  title: string
  status: 'active' | 'closed'
  created_at: number
  token_per_incense: number
  liangzi_policy_version: string
}

/** Authoritative personal daily spend state (backend-owned). */
export interface V1PersonalState {
  business_date: string
  /** Unverifiable host-observed claim (A3), ratcheted monotonically. */
  claimed_effective_tokens: number
  claim_source: typeof CLAIM_SOURCE_HOST_OBSERVED
  /** Always false under A3 — the backend cannot verify the claim. */
  claim_verified: boolean
  earned_incense: number
  used_incense: number
  remaining_incense: number
  token_remainder: number
  tokens_to_next_incense: number
  token_per_incense: number
  /** CAS version of the daily row; bumps on every accepted spend/claim. */
  version: number
  updated_at: number
}

/** One published global snapshot: raw counts + derived view, one sequence. */
export interface V1Snapshot {
  case_id: string
  business_date: string
  up_votes: number
  down_votes: number
  total_incense: number
  unique_voters: number
  up_ratio: number | null
  down_ratio: number | null
  liangzi_state: LiangziState
  captured_at: number
  sequence: number
  policy_version: string
  /** Sum of accepted votes across every case (today included). */
  lifetime_incense: number
  /** Distinct installations that have ever had an accepted vote. */
  lifetime_voters: number
}

export interface V1Bootstrap {
  schema_version: typeof BACKEND_SCHEMA_VERSION
  authority_mode: BackendAuthorityMode
  server_time: number
  business_date: string
  business_timezone: string
  /** Monotonic immutable 梁祠 cursor; history arrays travel on `/v1/history`. */
  archive_version: number
  snapshot_refresh_seconds: number
  token_policy: V1TokenPolicy
  liangzi_policy: V1LiangziPolicy
  active_case: V1Case
  authoritative_personal_state: V1PersonalState
  global_snapshot: V1Snapshot
}

/** POST /v1/votes body — minimum business intent, nothing else. */
export interface V1VoteRequest {
  case_id: string
  vote_type: VoteType
  request_id: string
}

export interface V1VoteAccepted {
  status: 'accepted'
  request_id: string
  vote_type: VoteType
  used_incense: number
  remaining_incense: number
  /** True when this response replayed an earlier accepted vote (idempotency). */
  replayed: boolean
}

export interface V1VoteRejected {
  status: 'rejected'
  request_id: string
  reason: VoteRejectionReason
  message: string
}

export type V1VoteResult = V1VoteAccepted | V1VoteRejected

export interface V1VoteResponse {
  schema_version: typeof BACKEND_SCHEMA_VERSION
  result: V1VoteResult
  authoritative_personal_state: V1PersonalState
  snapshot_version: { sequence: number, captured_at: number }
  /**
   * The snapshot published by (or current as of) this vote. An accepted vote
   * publishes inside its own transaction, so this row already contains it —
   * that is what lets the panel move 梁位 on the click without a second round
   * trip, while still rendering ONE self-consistent snapshot version.
   */
  global_snapshot: V1Snapshot
}

/**
 * POST /v1/token-claims body. Deliberately NOT part of a "verified usage"
 * story: the host reports what it observed locally and the backend records it
 * as a claim it cannot check. `claim_business_date` lets the backend ignore a
 * claim computed for a different business day instead of misattributing it.
 */
export interface V1TokenClaimRequest {
  claimed_effective_tokens: number
  claim_business_date: string
}

export interface V1PersonalStateResponse {
  schema_version: typeof BACKEND_SCHEMA_VERSION
  business_date: string
  server_time: number
  active_case: V1Case
  authoritative_personal_state: V1PersonalState
  /** True when the claim was applied; false when it was stale/ignored. */
  claim_applied?: boolean
  /** Set when the claim was clamped as absurd (so it reads as a guard, not a bug). */
  claim_notice?: 'claim_capped_absurd'
}

export interface V1SnapshotResponse {
  schema_version: typeof BACKEND_SCHEMA_VERSION
  server_time: number
  business_date: string
  archive_version: number
  active_case: V1Case
  global_snapshot: V1Snapshot
}

/** Operator publish case title (CLI writes SQLite; HTTP /v1/admin/* is closed). */
export const CASE_TITLE_MAX_LENGTH = 120

export interface V1PublishCaseRequest {
  title: string
}

export interface V1PublishCaseResponse {
  schema_version: typeof BACKEND_SCHEMA_VERSION
  business_date: string
  server_time: number
  archived_case: V1Case | null
  active_case: V1Case
  global_snapshot: V1Snapshot
}

/**
 * POST /v1/identity/rekey response. A device whose MAC fingerprint is already
 * bound to a previous installation can take over that binding after the re-key
 * cooldown; the previous identity (and its incense/votes) is orphaned — never
 * transferred. `rekeyed` is false when there was nothing to take over.
 */
export interface V1RekeyResponse {
  schema_version: typeof BACKEND_SCHEMA_VERSION
  rekeyed: boolean
  installation_id: string
  previous_installation_id: string | null
  server_time: number
}

/** POST /v1/admin/identity/unbind response (operator, community key). */
export interface V1UnbindResponse {
  schema_version: typeof BACKEND_SCHEMA_VERSION
  installation_id: string
  unbound: boolean
  server_time: number
}

/** Structured error codes (HTTP status is carried separately). */
export const V1_ERROR_CODES = [
  'invalid_request',
  'missing_installation',
  'invalid_signature',
  'admission_required',
  'admission_ticket_invalid',
  'admission_ticket_exhausted',
  'admission_rate_limited',
  'device_conflict',
  'rekey_cooldown',
  'identity_rate_limited',
  'unknown_route',
  'method_not_allowed',
  'stale_case',
  'case_not_active',
  'idempotency_conflict',
  'insufficient_incense',
  'not_ready',
  'internal_error',
] as const
export type V1ErrorCode = (typeof V1_ERROR_CODES)[number]

export interface V1ErrorBody {
  error: { code: V1ErrorCode, message: string, field?: string }
}

const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/

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

function requireBusinessDate(value: unknown, field: string): string {
  const text = requireString(value, field)
  if (!BUSINESS_DATE_PATTERN.test(text)) throw new WireError(field, 'expected YYYY-MM-DD')
  return text
}

function requireRatio(value: unknown, field: string): number | null {
  if (value === null) return null
  const ratio = requireFinite(value, field)
  if (ratio < 0 || ratio > 1) throw new WireError(field, 'expected a ratio in [0,1]')
  return ratio
}

/** Validate a pseudonymous installation id (header value). */
export function parseInstallationId(raw: unknown): string {
  const value = requireString(raw, 'installation_id')
  if (!INSTALLATION_ID_PATTERN.test(value)) {
    throw new WireError('installation_id', 'must match [A-Za-z0-9._-]{8,64}')
  }
  return value
}

export function isBackendAuthorityMode(value: unknown): value is BackendAuthorityMode {
  return typeof value === 'string' && (AUTHORITY_MODES as readonly string[]).includes(value)
}

function parseCase(raw: unknown, field: string): V1Case {
  const record = asRecord(raw, field)
  const status = requireString(record.status, `${field}.status`)
  if (status !== 'active' && status !== 'closed') {
    throw new WireError(`${field}.status`, 'expected active/closed')
  }
  const tokenPerIncense = requireCount(record.token_per_incense, `${field}.token_per_incense`)
  if (tokenPerIncense <= 0) throw new WireError(`${field}.token_per_incense`, 'must be positive')
  return {
    id: requireString(record.id, `${field}.id`),
    business_date: requireBusinessDate(record.business_date, `${field}.business_date`),
    title: requireString(record.title, `${field}.title`),
    status,
    created_at: requireFinite(record.created_at, `${field}.created_at`),
    token_per_incense: tokenPerIncense,
    liangzi_policy_version: requireString(record.liangzi_policy_version, `${field}.liangzi_policy_version`),
  }
}

/**
 * Validate an authoritative personal state, enforcing the frozen accounting
 * identities rather than trusting the sender's arithmetic.
 */
export function parseV1PersonalState(raw: unknown, field = 'authoritative_personal_state'): V1PersonalState {
  const record = asRecord(raw, field)
  const tokenPerIncense = requireCount(record.token_per_incense, `${field}.token_per_incense`)
  if (tokenPerIncense <= 0) throw new WireError(`${field}.token_per_incense`, 'must be positive')
  const claimed = requireCount(record.claimed_effective_tokens, `${field}.claimed_effective_tokens`)
  const used = requireCount(record.used_incense, `${field}.used_incense`)
  const earned = requireCount(record.earned_incense, `${field}.earned_incense`)
  const remaining = requireCount(record.remaining_incense, `${field}.remaining_incense`)
  const remainder = requireCount(record.token_remainder, `${field}.token_remainder`)
  const toNext = requireCount(record.tokens_to_next_incense, `${field}.tokens_to_next_incense`)
  if (earned !== Math.floor(claimed / tokenPerIncense)) {
    throw new WireError(`${field}.earned_incense`, 'does not match floor(claimed / token_per_incense)')
  }
  if (used > earned) throw new WireError(`${field}.used_incense`, 'used exceeds earned')
  if (remaining !== earned - used) {
    throw new WireError(`${field}.remaining_incense`, 'does not match earned - used')
  }
  if (remainder !== claimed % tokenPerIncense) {
    throw new WireError(`${field}.token_remainder`, 'does not match claimed % token_per_incense')
  }
  if (toNext !== tokenPerIncense - remainder) {
    throw new WireError(`${field}.tokens_to_next_incense`, 'does not match token_per_incense - remainder')
  }
  if (record.claim_source !== CLAIM_SOURCE_HOST_OBSERVED) {
    throw new WireError(`${field}.claim_source`, `expected ${CLAIM_SOURCE_HOST_OBSERVED}`)
  }
  if (record.claim_verified !== false) {
    // A3: nothing in this deployment can honestly set this to true.
    throw new WireError(`${field}.claim_verified`, 'must be false under DEV_STAGING_ONLY')
  }
  return {
    business_date: requireBusinessDate(record.business_date, `${field}.business_date`),
    claimed_effective_tokens: claimed,
    claim_source: CLAIM_SOURCE_HOST_OBSERVED,
    claim_verified: false,
    earned_incense: earned,
    used_incense: used,
    remaining_incense: remaining,
    token_remainder: remainder,
    tokens_to_next_incense: toNext,
    token_per_incense: tokenPerIncense,
    version: requireCount(record.version, `${field}.version`),
    updated_at: requireFinite(record.updated_at, `${field}.updated_at`),
  }
}

/**
 * Validate a published snapshot. Ratios must match the raw counts in the SAME
 * payload (AGENTS.md §12: never mix a stale ratio with a fresh Liangzi state).
 * `liangzi_state` is then derived with *this* binary's threshold policy. A
 * rolling deploy can leave the server on an older band table (e.g. 20% steps
 * painting 梁神 at 45% while this client expects 梁工); rejecting that frame
 * 502s an already-accepted vote and freezes 梁位. Counts stay authoritative;
 * the label is recomputed locally.
 */
export function parseV1Snapshot(
  raw: unknown,
  field = 'global_snapshot',
  policy: LiangziThresholdPolicy = DEFAULT_LIANGZI_THRESHOLDS,
): V1Snapshot {
  const record = asRecord(raw, field)
  const upVotes = requireCount(record.up_votes, `${field}.up_votes`)
  const downVotes = requireCount(record.down_votes, `${field}.down_votes`)
  const totalIncense = requireCount(record.total_incense, `${field}.total_incense`)
  const uniqueVoters = requireCount(record.unique_voters, `${field}.unique_voters`)
  if (totalIncense !== upVotes + downVotes) {
    throw new WireError(`${field}.total_incense`, 'does not match up_votes + down_votes')
  }
  if (uniqueVoters > totalIncense) {
    throw new WireError(`${field}.unique_voters`, 'exceeds total accepted votes')
  }
  const liangziState = requireString(record.liangzi_state, `${field}.liangzi_state`)
  if (!(LIANGZI_STATES as readonly string[]).includes(liangziState)) {
    throw new WireError(`${field}.liangzi_state`, `unknown state ${liangziState}`)
  }
  const upRatio = requireRatio(record.up_ratio, `${field}.up_ratio`)
  const downRatio = requireRatio(record.down_ratio, `${field}.down_ratio`)
  if (totalIncense === 0) {
    if (upRatio !== null || downRatio !== null) {
      throw new WireError(`${field}.up_ratio`, 'zero votes must publish null ratios, never a fake 50/50')
    }
  } else {
    if (upRatio === null || downRatio === null) {
      throw new WireError(`${field}.up_ratio`, 'non-zero votes must publish both ratios')
    }
    if (Math.abs(upRatio - upVotes / totalIncense) > 1e-9) {
      throw new WireError(`${field}.up_ratio`, 'does not match up_votes / total_incense')
    }
    if (Math.abs(downRatio - downVotes / totalIncense) > 1e-9) {
      throw new WireError(`${field}.down_ratio`, 'does not match down_votes / total_incense')
    }
  }
  const derived = deriveLiangziState(upVotes, downVotes, policy)
  return {
    case_id: requireString(record.case_id, `${field}.case_id`),
    business_date: requireBusinessDate(record.business_date, `${field}.business_date`),
    up_votes: upVotes,
    down_votes: downVotes,
    total_incense: totalIncense,
    unique_voters: uniqueVoters,
    up_ratio: upRatio,
    down_ratio: downRatio,
    liangzi_state: derived,
    captured_at: requireFinite(record.captured_at, `${field}.captured_at`),
    sequence: requireCount(record.sequence, `${field}.sequence`),
    policy_version: requireString(record.policy_version, `${field}.policy_version`),
    lifetime_incense: record.lifetime_incense === undefined
      ? totalIncense
      : requireCount(record.lifetime_incense, `${field}.lifetime_incense`),
    lifetime_voters: record.lifetime_voters === undefined
      ? uniqueVoters
      : requireCount(record.lifetime_voters, `${field}.lifetime_voters`),
  }
}

function parseTokenPolicy(raw: unknown, field: string): V1TokenPolicy {
  const record = asRecord(raw, field)
  const tokenPerIncense = requireCount(record.token_per_incense, `${field}.token_per_incense`)
  if (tokenPerIncense <= 0) throw new WireError(`${field}.token_per_incense`, 'must be positive')
  if (record.effective_token_formula !== 'input_plus_output') {
    throw new WireError(`${field}.effective_token_formula`, 'expected input_plus_output')
  }
  return { token_per_incense: tokenPerIncense, effective_token_formula: 'input_plus_output' }
}

function parseLiangziPolicy(raw: unknown, field: string): V1LiangziPolicy {
  const record = asRecord(raw, field)
  const boundaries = record.boundaries
  if (!Array.isArray(boundaries) || boundaries.length !== ACTIVE_LIANGZI_STATES.length - 1) {
    throw new WireError(`${field}.boundaries`, 'expected exactly 4 boundaries')
  }
  const parsed = boundaries.map((value, index) => {
    const ratio = requireFinite(value, `${field}.boundaries[${index}]`)
    if (ratio <= 0 || ratio >= 1) throw new WireError(`${field}.boundaries[${index}]`, 'expected a ratio in (0,1)')
    return ratio
  })
  for (let i = 1; i < parsed.length; i += 1) {
    if ((parsed[i] as number) <= (parsed[i - 1] as number)) {
      throw new WireError(`${field}.boundaries`, 'must be strictly ascending')
    }
  }
  return {
    version: requireString(record.version, `${field}.version`),
    boundaries: parsed as [number, number, number, number],
  }
}

/** Validate a bootstrap payload (host boundary). */
export function parseV1Bootstrap(raw: unknown): V1Bootstrap {
  const record = asRecord(raw, 'bootstrap')
  if (record.schema_version !== BACKEND_SCHEMA_VERSION) {
    throw new WireError('bootstrap.schema_version', `unsupported schema version ${String(record.schema_version)}`)
  }
  const authorityMode = record.authority_mode
  if (!isBackendAuthorityMode(authorityMode)) {
    throw new WireError('bootstrap.authority_mode', `unknown authority mode ${String(authorityMode)}`)
  }
  const liangziPolicy = parseLiangziPolicy(record.liangzi_policy, 'bootstrap.liangzi_policy')
  const snapshot = parseV1Snapshot(record.global_snapshot, 'bootstrap.global_snapshot', {
    boundaries: liangziPolicy.boundaries,
  })
  const refresh = requireCount(record.snapshot_refresh_seconds, 'bootstrap.snapshot_refresh_seconds')
  if (refresh <= 0) throw new WireError('bootstrap.snapshot_refresh_seconds', 'must be positive')
  return {
    schema_version: BACKEND_SCHEMA_VERSION,
    authority_mode: authorityMode,
    server_time: requireFinite(record.server_time, 'bootstrap.server_time'),
    business_date: requireBusinessDate(record.business_date, 'bootstrap.business_date'),
    business_timezone: requireString(record.business_timezone, 'bootstrap.business_timezone'),
    archive_version: record.archive_version === undefined
      ? 0
      : requireCount(record.archive_version, 'bootstrap.archive_version'),
    snapshot_refresh_seconds: refresh,
    token_policy: parseTokenPolicy(record.token_policy, 'bootstrap.token_policy'),
    liangzi_policy: liangziPolicy,
    active_case: parseCase(record.active_case, 'bootstrap.active_case'),
    authoritative_personal_state: parseV1PersonalState(
      record.authoritative_personal_state,
      'bootstrap.authoritative_personal_state',
    ),
    global_snapshot: snapshot,
  }
}

const REJECTION_REASONS: readonly VoteRejectionReason[] = [
  'insufficient_incense',
  'case_not_active',
  'stale_case',
  'idempotency_conflict',
  'invalid_intent',
]

function parseVoteResult(raw: unknown, field: string): V1VoteResult {
  const record = asRecord(raw, field)
  const requestId = requireString(record.request_id, `${field}.request_id`)
  if (record.status === 'accepted') {
    if (!isVoteType(record.vote_type)) {
      throw new WireError(`${field}.vote_type`, 'expected "up" or "down"')
    }
    if (typeof record.replayed !== 'boolean') {
      throw new WireError(`${field}.replayed`, 'expected a boolean')
    }
    return {
      status: 'accepted',
      request_id: requestId,
      vote_type: record.vote_type,
      used_incense: requireCount(record.used_incense, `${field}.used_incense`),
      remaining_incense: requireCount(record.remaining_incense, `${field}.remaining_incense`),
      replayed: record.replayed,
    }
  }
  if (record.status === 'rejected') {
    const reason = record.reason
    if (typeof reason !== 'string' || !REJECTION_REASONS.includes(reason as VoteRejectionReason)) {
      throw new WireError(`${field}.reason`, `unknown rejection reason ${String(reason)}`)
    }
    return {
      status: 'rejected',
      request_id: requestId,
      reason: reason as VoteRejectionReason,
      message: requireString(record.message, `${field}.message`),
    }
  }
  throw new WireError(`${field}.status`, `expected accepted/rejected, got ${String(record.status)}`)
}

/**
 * Vote body without requiring `global_snapshot`. Older staging binaries
 * accepted the vote and omitted the snapshot; the host then 502'd even
 * though the incense was already spent. The client stitches a snapshot
 * from GET /v1/snapshot when this envelope has none.
 */
export interface V1VoteEnvelope {
  schema_version: typeof BACKEND_SCHEMA_VERSION
  result: V1VoteResult
  authoritative_personal_state: V1PersonalState
  snapshot_version: { sequence: number, captured_at: number } | null
  global_snapshot: V1Snapshot | null
}

/** True when a vote parse failed only because the snapshot fields are absent. */
export function isMissingVoteSnapshotError(error: unknown): boolean {
  if (!(error instanceof WireError)) return false
  return error.field === 'voteResponse.global_snapshot' || error.field === 'voteResponse.snapshot_version'
}

/** Parse result + personal state; snapshot fields are optional. */
export function parseV1VoteEnvelope(raw: unknown): V1VoteEnvelope {
  const record = asRecord(raw, 'voteResponse')
  if (record.schema_version !== BACKEND_SCHEMA_VERSION) {
    throw new WireError('voteResponse.schema_version', `unsupported schema version ${String(record.schema_version)}`)
  }
  const personal = parseV1PersonalState(
    record.authoritative_personal_state,
    'voteResponse.authoritative_personal_state',
  )
  const result = parseVoteResult(record.result, 'voteResponse.result')
  if (result.status === 'accepted') {
    if (result.used_incense !== personal.used_incense || result.remaining_incense !== personal.remaining_incense) {
      throw new WireError('voteResponse.result', 'accepted counters disagree with the personal state in the same response')
    }
  }
  let snapshot: V1Snapshot | null = null
  if (record.global_snapshot !== undefined && record.global_snapshot !== null) {
    snapshot = parseV1Snapshot(record.global_snapshot, 'voteResponse.global_snapshot')
  }
  let snapshotVersion: V1VoteEnvelope['snapshot_version'] = null
  if (record.snapshot_version !== undefined && record.snapshot_version !== null) {
    const version = asRecord(record.snapshot_version, 'voteResponse.snapshot_version')
    snapshotVersion = {
      sequence: requireCount(version.sequence, 'voteResponse.snapshot_version.sequence'),
      captured_at: requireFinite(version.captured_at, 'voteResponse.snapshot_version.captured_at'),
    }
  }
  if (snapshot !== null && snapshotVersion !== null && snapshot.sequence !== snapshotVersion.sequence) {
    throw new WireError('voteResponse.snapshot_version', 'sequence disagrees with the snapshot in the same response')
  }
  return {
    schema_version: BACKEND_SCHEMA_VERSION,
    result,
    authoritative_personal_state: personal,
    snapshot_version: snapshotVersion,
    global_snapshot: snapshot,
  }
}

/** Attach a published snapshot to a vote envelope (recovery path). */
export function completeV1VoteResponse(envelope: V1VoteEnvelope, snapshot: V1Snapshot): V1VoteResponse {
  return {
    schema_version: envelope.schema_version,
    result: envelope.result,
    authoritative_personal_state: envelope.authoritative_personal_state,
    snapshot_version: { sequence: snapshot.sequence, captured_at: snapshot.captured_at },
    global_snapshot: snapshot,
  }
}

/** Validate a complete vote response (host boundary). */
export function parseV1VoteResponse(raw: unknown): V1VoteResponse {
  const envelope = parseV1VoteEnvelope(raw)
  if (envelope.global_snapshot === null) {
    throw new WireError('voteResponse.global_snapshot', 'expected an object')
  }
  if (envelope.snapshot_version === null) {
    throw new WireError('voteResponse.snapshot_version', 'expected an object')
  }
  return {
    schema_version: envelope.schema_version,
    result: envelope.result,
    authoritative_personal_state: envelope.authoritative_personal_state,
    snapshot_version: envelope.snapshot_version,
    global_snapshot: envelope.global_snapshot,
  }
}

/** Validate a snapshot response (host boundary). */
export function parseV1SnapshotResponse(raw: unknown): V1SnapshotResponse {
  const record = asRecord(raw, 'snapshotResponse')
  if (record.schema_version !== BACKEND_SCHEMA_VERSION) {
    throw new WireError('snapshotResponse.schema_version', `unsupported schema version ${String(record.schema_version)}`)
  }
  return {
    schema_version: BACKEND_SCHEMA_VERSION,
    server_time: requireFinite(record.server_time, 'snapshotResponse.server_time'),
    business_date: requireBusinessDate(record.business_date, 'snapshotResponse.business_date'),
    archive_version: record.archive_version === undefined
      ? 0
      : requireCount(record.archive_version, 'snapshotResponse.archive_version'),
    active_case: parseCase(record.active_case, 'snapshotResponse.active_case'),
    global_snapshot: parseV1Snapshot(record.global_snapshot, 'snapshotResponse.global_snapshot'),
  }
}

/** Validate a personal-state response (host boundary). */
export function parseV1PersonalStateResponse(raw: unknown): V1PersonalStateResponse {
  const record = asRecord(raw, 'personalResponse')
  if (record.schema_version !== BACKEND_SCHEMA_VERSION) {
    throw new WireError('personalResponse.schema_version', `unsupported schema version ${String(record.schema_version)}`)
  }
  const claimApplied = record.claim_applied
  if (claimApplied !== undefined && typeof claimApplied !== 'boolean') {
    throw new WireError('personalResponse.claim_applied', 'expected a boolean')
  }
  const claimNotice = record.claim_notice
  if (claimNotice !== undefined && claimNotice !== 'claim_capped_absurd') {
    throw new WireError('personalResponse.claim_notice', 'expected claim_capped_absurd or absent')
  }
  const parsed: V1PersonalStateResponse = {
    schema_version: BACKEND_SCHEMA_VERSION,
    business_date: requireBusinessDate(record.business_date, 'personalResponse.business_date'),
    server_time: requireFinite(record.server_time, 'personalResponse.server_time'),
    active_case: parseCase(record.active_case, 'personalResponse.active_case'),
    authoritative_personal_state: parseV1PersonalState(
      record.authoritative_personal_state,
      'personalResponse.authoritative_personal_state',
    ),
  }
  if (claimApplied !== undefined) parsed.claim_applied = claimApplied
  if (claimNotice !== undefined) parsed.claim_notice = claimNotice
  return parsed
}

/** Validate a vote request body (backend boundary). */
export function parseV1VoteRequest(raw: unknown): V1VoteRequest {
  const record = asRecord(raw, 'vote')
  const caseId = requireString(record.case_id, 'vote.case_id')
  if (!isVoteType(record.vote_type)) {
    throw new WireError('vote.vote_type', `expected "up" or "down", got ${String(record.vote_type)}`)
  }
  const requestId = requireString(record.request_id, 'vote.request_id')
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    throw new WireError('vote.request_id', 'must match [A-Za-z0-9._-]{8,128}')
  }
  // Self-reported authority is a contract violation, not a field to ignore:
  // failing loudly keeps a future client from quietly re-introducing it.
  for (const forbidden of [
    'user_id',
    'installation_id',
    'effective_tokens',
    'claimed_effective_tokens',
    'earned_incense',
    'used_incense',
    'remaining_incense',
    'liangzi_state',
    'liang_qi_fill',
  ]) {
    if (forbidden in record) {
      throw new WireError(`vote.${forbidden}`, 'client-declared authority is not accepted')
    }
  }
  return { case_id: caseId, vote_type: record.vote_type as VoteType, request_id: requestId }
}

/** Validate a token-claim body (backend boundary). */
export function parseV1TokenClaimRequest(raw: unknown): V1TokenClaimRequest {
  const record = asRecord(raw, 'claim')
  return {
    claimed_effective_tokens: requireCount(record.claimed_effective_tokens, 'claim.claimed_effective_tokens'),
    claim_business_date: requireBusinessDate(record.claim_business_date, 'claim.claim_business_date'),
  }
}

/** Public available-ticket response (Host boundary). */
export function parseV1AdmissionTicketsResponse(raw: unknown): V1AdmissionTicketsResponse {
  const record = asRecord(raw, 'admissionTickets')
  if (record.schema_version !== BACKEND_SCHEMA_VERSION) {
    throw new WireError('admissionTickets.schema_version', `unsupported schema version ${String(record.schema_version)}`)
  }
  if (!Array.isArray(record.tickets)) throw new WireError('admissionTickets.tickets', 'expected an array')
  const tickets = record.tickets.map((item, index) => {
    const ticket = asRecord(item, `admissionTickets.tickets[${index}]`)
    const remaining = requireCount(ticket.remaining_claims, `admissionTickets.tickets[${index}].remaining_claims`)
    if (remaining < 1) throw new WireError(`admissionTickets.tickets[${index}].remaining_claims`, 'must be positive')
    return {
      ticket_id: requireString(ticket.ticket_id, `admissionTickets.tickets[${index}].ticket_id`),
      secret: requireString(ticket.secret, `admissionTickets.tickets[${index}].secret`),
      remaining_claims: remaining,
      expires_at: requireFinite(ticket.expires_at, `admissionTickets.tickets[${index}].expires_at`),
    }
  })
  return {
    schema_version: BACKEND_SCHEMA_VERSION,
    server_time: requireFinite(record.server_time, 'admissionTickets.server_time'),
    available_claims: requireCount(record.available_claims, 'admissionTickets.available_claims'),
    tickets,
  }
}

/** Signed first-install admission body (backend boundary). */
export function parseV1AdmissionClaimRequest(raw: unknown): V1AdmissionClaimRequest {
  const record = asRecord(raw, 'admissionClaim')
  for (const key of Object.keys(record)) {
    if (!['ticket_secret', 'public_key', 'device_fingerprint'].includes(key)) {
      throw new WireError(`admissionClaim.${key}`, 'unknown field')
    }
  }
  return {
    ticket_secret: requireString(record.ticket_secret, 'admissionClaim.ticket_secret'),
    public_key: requireString(record.public_key, 'admissionClaim.public_key'),
    device_fingerprint: requireString(record.device_fingerprint, 'admissionClaim.device_fingerprint'),
  }
}

/** Validate a successful first-install admission response. */
export function parseV1AdmissionClaimResponse(raw: unknown): V1AdmissionClaimResponse {
  const record = asRecord(raw, 'admissionClaimResponse')
  if (record.schema_version !== BACKEND_SCHEMA_VERSION) {
    throw new WireError('admissionClaimResponse.schema_version', `unsupported schema version ${String(record.schema_version)}`)
  }
  if (typeof record.claimed !== 'boolean') {
    throw new WireError('admissionClaimResponse.claimed', 'expected a boolean')
  }
  const ticketId = record.ticket_id
  if (ticketId !== null && typeof ticketId !== 'string') {
    throw new WireError('admissionClaimResponse.ticket_id', 'expected a string or null')
  }
  return {
    schema_version: BACKEND_SCHEMA_VERSION,
    claimed: record.claimed,
    installation_id: parseInstallationId(record.installation_id),
    ticket_id: ticketId,
    server_time: requireFinite(record.server_time, 'admissionClaimResponse.server_time'),
  }
}

/** Validate a successful same-device identity replacement response. */
export function parseV1RekeyResponse(raw: unknown): V1RekeyResponse {
  const record = asRecord(raw, 'rekeyResponse')
  if (record.schema_version !== BACKEND_SCHEMA_VERSION) {
    throw new WireError('rekeyResponse.schema_version', `unsupported schema version ${String(record.schema_version)}`)
  }
  if (typeof record.rekeyed !== 'boolean') {
    throw new WireError('rekeyResponse.rekeyed', 'expected a boolean')
  }
  const previousInstallationId = record.previous_installation_id
  if (previousInstallationId !== null && typeof previousInstallationId !== 'string') {
    throw new WireError('rekeyResponse.previous_installation_id', 'expected a string or null')
  }
  return {
    schema_version: BACKEND_SCHEMA_VERSION,
    rekeyed: record.rekeyed,
    installation_id: parseInstallationId(record.installation_id),
    previous_installation_id: previousInstallationId,
    server_time: requireFinite(record.server_time, 'rekeyResponse.server_time'),
  }
}

/** Validate an operator publish body (backend boundary). */
export function parseV1PublishCaseRequest(raw: unknown): V1PublishCaseRequest {
  const record = asRecord(raw, 'publish')
  const title = requireString(record.title, 'publish.title').trim()
  if (title.length === 0) throw new WireError('publish.title', 'expected a non-empty string')
  if (title.length > CASE_TITLE_MAX_LENGTH) {
    throw new WireError('publish.title', `must be at most ${CASE_TITLE_MAX_LENGTH} characters`)
  }
  if ([...title].some((char) => char.charCodeAt(0) < 32)) {
    throw new WireError('publish.title', 'must not contain control characters')
  }
  return { title }
}

/** Validate a publish response (host / curl boundary). */
export function parseV1PublishCaseResponse(raw: unknown): V1PublishCaseResponse {
  const record = asRecord(raw, 'publishResponse')
  if (record.schema_version !== BACKEND_SCHEMA_VERSION) {
    throw new WireError('publishResponse.schema_version', `unsupported schema version ${String(record.schema_version)}`)
  }
  const archived = record.archived_case
  return {
    schema_version: BACKEND_SCHEMA_VERSION,
    business_date: requireBusinessDate(record.business_date, 'publishResponse.business_date'),
    server_time: requireFinite(record.server_time, 'publishResponse.server_time'),
    archived_case: archived === null ? null : parseCase(archived, 'publishResponse.archived_case'),
    active_case: parseCase(record.active_case, 'publishResponse.active_case'),
    global_snapshot: parseV1Snapshot(record.global_snapshot, 'publishResponse.global_snapshot'),
  }
}
