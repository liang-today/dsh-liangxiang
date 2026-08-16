/**
 * Backend transaction semantics (A3 / DEV_STAGING_ONLY): token claims, atomic
 * spend, idempotency, unique voters, business-date rollover, snapshot cadence
 * and versioning, and the personal/global separation.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { deriveLiangziState } from '../src/domain/index.ts'
import { parseV1Bootstrap, parseV1Snapshot, parseV1VoteResponse } from '../src/shared/backend-v1.ts'
import { createBackendFixture, DAY_MS, FIXED_NOW, type BackendFixture } from './helpers/backend.ts'

const INSTALLATION = 'install-aaaa-0001'
const OTHER = 'install-bbbb-0002'

let fixture: BackendFixture | null = null

function boot(env: Record<string, string | undefined> = {}): BackendFixture {
  fixture?.close()
  fixture = createBackendFixture(env)
  return fixture
}

afterEach(() => {
  fixture?.close()
  fixture = null
})

function vote(f: BackendFixture, installation: string, voteType: 'up' | 'down', requestId: string) {
  return f.service.vote(installation, {
    case_id: f.service.ensureActiveCase().id,
    vote_type: voteType,
    request_id: requestId,
  })
}

describe('bootstrap and token claims', () => {
  it('opens one active case per business date and publishes a zero-vote snapshot', () => {
    const f = boot()
    const bootstrap = parseV1Bootstrap(f.service.bootstrap(INSTALLATION))
    expect(bootstrap.authority_mode).toBe('DEV_STAGING_ONLY')
    expect(bootstrap.business_date).toBe('2026-08-16')
    expect(bootstrap.active_case.id).toBe('case-2026-08-16')
    expect(bootstrap.global_snapshot.sequence).toBe(1)
    expect(bootstrap.global_snapshot.up_ratio).toBeNull()
    expect(bootstrap.global_snapshot.down_ratio).toBeNull()
    expect(bootstrap.global_snapshot.liangzi_state).toBe('waiting')
    expect(bootstrap.authoritative_personal_state.remaining_incense).toBe(0)
    // A3 honesty markers travel with every personal payload.
    expect(bootstrap.authoritative_personal_state.claim_verified).toBe(false)
    expect(bootstrap.authoritative_personal_state.claim_source).toBe('host_observed_unverified')
  })

  it.each([
    [0, 0],
    [49_999, 0],
    [50_000, 1],
    [99_999, 1],
    [100_000, 2],
    [397_000, 7],
    [500_000, 10],
    [1_000_000, 20],
  ])('claim of %d tokens earns %d incense', (tokens, earned) => {
    const f = boot()
    const response = f.service.applyTokenClaim(INSTALLATION, {
      claimed_effective_tokens: tokens,
      claim_business_date: '2026-08-16',
    })
    expect(response.authoritative_personal_state.earned_incense).toBe(earned)
    expect(response.authoritative_personal_state.remaining_incense).toBe(earned)
  })

  it('ratchets the claim monotonically: a smaller claim cannot rewind a balance', () => {
    const f = boot()
    f.service.applyTokenClaim(INSTALLATION, {
      claimed_effective_tokens: 250_000,
      claim_business_date: '2026-08-16',
    })
    const shrunk = f.service.applyTokenClaim(INSTALLATION, {
      claimed_effective_tokens: 10_000,
      claim_business_date: '2026-08-16',
    })
    expect(shrunk.claim_applied).toBe(false)
    expect(shrunk.authoritative_personal_state.claimed_effective_tokens).toBe(250_000)
    expect(shrunk.authoritative_personal_state.earned_incense).toBe(5)
  })

  it('ignores a claim computed for a different business date', () => {
    const f = boot()
    const response = f.service.applyTokenClaim(INSTALLATION, {
      claimed_effective_tokens: 500_000,
      claim_business_date: '2026-08-15',
    })
    expect(response.claim_applied).toBe(false)
    expect(response.authoritative_personal_state.claimed_effective_tokens).toBe(0)
    expect(response.business_date).toBe('2026-08-16')
  })
})

describe('vote transaction', () => {
  it('spends exactly one incense per accepted vote and leaves token progress alone', () => {
    const f = boot()
    f.grantIncense(INSTALLATION, 5, 47_000)
    const before = f.service.dailyState(INSTALLATION).authoritative_personal_state
    expect(before.remaining_incense).toBe(5)
    expect(before.token_remainder).toBe(47_000)

    const response = parseV1VoteResponse(vote(f, INSTALLATION, 'up', 'req-000000001'))
    expect(response.result.status).toBe('accepted')
    const after = response.authoritative_personal_state
    expect(after.remaining_incense).toBe(4)
    expect(after.used_incense).toBe(1)
    // Spending must not rewind progress towards the next stick.
    expect(after.token_remainder).toBe(47_000)
    expect(after.tokens_to_next_incense).toBe(before.tokens_to_next_incense)
  })

  it('allows repeated and mixed directions until the shared pool is empty', () => {
    const f = boot()
    f.grantIncense(INSTALLATION, 5)
    const directions = ['up', 'up', 'down', 'up', 'down'] as const
    directions.forEach((direction, index) => {
      const response = vote(f, INSTALLATION, direction, `req-mix-${index}0000`)
      expect(response.result.status).toBe('accepted')
    })
    const sixth = vote(f, INSTALLATION, 'up', 'req-mix-sixth000')
    expect(sixth.result).toMatchObject({ status: 'rejected', reason: 'insufficient_incense' })
    expect(sixth.authoritative_personal_state.remaining_incense).toBe(0)
  })

  it('replays the same request id without a second spend', () => {
    const f = boot()
    f.grantIncense(INSTALLATION, 3)
    const first = parseV1VoteResponse(vote(f, INSTALLATION, 'up', 'req-idem-00001'))
    const replay = parseV1VoteResponse(vote(f, INSTALLATION, 'up', 'req-idem-00001'))
    expect(first.result).toMatchObject({ status: 'accepted', replayed: false })
    expect(replay.result).toMatchObject({ status: 'accepted', replayed: true })
    expect(replay.authoritative_personal_state.used_incense).toBe(1)
    expect(replay.authoritative_personal_state.remaining_incense).toBe(2)
  })

  it('rejects the same request id with a conflicting payload', () => {
    const f = boot()
    f.grantIncense(INSTALLATION, 3)
    vote(f, INSTALLATION, 'up', 'req-conflict-01')
    const conflict = vote(f, INSTALLATION, 'down', 'req-conflict-01')
    expect(conflict.result).toMatchObject({ status: 'rejected', reason: 'idempotency_conflict' })
    expect(conflict.authoritative_personal_state.used_incense).toBe(1)
  })

  it('scopes idempotency per installation', () => {
    const f = boot()
    f.grantIncense(INSTALLATION, 1)
    f.grantIncense(OTHER, 1)
    expect(vote(f, INSTALLATION, 'up', 'req-shared-0001').result.status).toBe('accepted')
    expect(vote(f, OTHER, 'up', 'req-shared-0001').result.status).toBe('accepted')
  })

  it('counts a unique voter once, regardless of how many votes it casts', () => {
    const f = boot()
    f.grantIncense(INSTALLATION, 3)
    f.grantIncense(OTHER, 1)
    vote(f, INSTALLATION, 'up', 'req-uv-000001')
    vote(f, INSTALLATION, 'down', 'req-uv-000002')
    vote(f, INSTALLATION, 'up', 'req-uv-000003')
    vote(f, OTHER, 'up', 'req-uv-000004')
    const stats = f.store.statsFor(f.service.ensureActiveCase().id)
    expect(stats).toMatchObject({ up_votes: 3, down_votes: 1, unique_voters: 2 })
  })

  it('rejects a stale or unknown case id', () => {
    const f = boot()
    f.grantIncense(INSTALLATION, 2)
    const stale = f.service.vote(INSTALLATION, {
      case_id: 'case-2026-08-15',
      vote_type: 'up',
      request_id: 'req-stale-0001',
    })
    expect(stale.result).toMatchObject({ status: 'rejected', reason: 'stale_case' })
    expect(stale.authoritative_personal_state.used_incense).toBe(0)
  })

  it('refuses to overspend even when the guard is hit directly at the store level', () => {
    const f = boot()
    f.grantIncense(INSTALLATION, 1)
    const date = f.service.businessDate()
    expect(f.store.spendOneIncense(INSTALLATION, date, FIXED_NOW)).toBe(true)
    expect(f.store.spendOneIncense(INSTALLATION, date, FIXED_NOW)).toBe(false)
    expect(f.store.incenseFor(INSTALLATION, date)?.used_incense).toBe(1)
  })
})

describe('global snapshot', () => {
  it('publishes within a second by default so a voter sees their own vote', () => {
    const f = boot() // helper default: 1s cadence
    f.grantIncense(INSTALLATION, 2)
    const before = parseV1Snapshot(f.service.snapshotResponse().global_snapshot)
    vote(f, INSTALLATION, 'up', 'req-realtime-001')
    f.clock.advance(1_000)
    const after = parseV1Snapshot(f.service.snapshotResponse().global_snapshot)
    expect(after.sequence).toBe(before.sequence + 1)
    expect(after.total_incense).toBe(1)
  })

  it('bounds the stored snapshot history instead of growing forever at 1s', () => {
    const f = boot()
    const caseRow = f.service.ensureActiveCase()
    f.grantIncense(INSTALLATION, 60)
    for (let i = 0; i < 60; i += 1) {
      vote(f, INSTALLATION, 'up', `req-hist-${String(i).padStart(6, '0')}`)
      f.clock.advance(1_000)
      f.service.tick()
    }
    const latest = f.store.latestSnapshot(caseRow.id)
    expect(latest?.sequence).toBeGreaterThan(50)
    // Retention keeps the newest SNAPSHOT_HISTORY_LIMIT rows; with 61 published
    // rows nothing is pruned yet, but the pruning statement must be wired.
    expect(f.store.pruneSnapshots(caseRow.id, 5)).toBeGreaterThan(0)
    expect(f.store.latestSnapshot(caseRow.id)?.sequence).toBe(latest?.sequence)
  })

  it('keeps the published ratio at the cadence while the personal balance moves now', () => {
    const f = boot({ LIANGBIAO_SNAPSHOT_SECONDS: '300' })
    f.grantIncense(INSTALLATION, 2)
    const before = parseV1Snapshot(f.service.snapshotResponse().global_snapshot)
    vote(f, INSTALLATION, 'up', 'req-cadence-001')
    const immediately = parseV1Snapshot(f.service.snapshotResponse().global_snapshot)
    // Raw aggregate moved; the public snapshot has not been re-published yet.
    expect(f.store.statsFor(f.service.ensureActiveCase().id)?.up_votes).toBe(1)
    expect(immediately.sequence).toBe(before.sequence)
    expect(immediately.total_incense).toBe(0)

    f.clock.advance(300_000)
    const published = parseV1Snapshot(f.service.snapshotResponse().global_snapshot)
    expect(published.sequence).toBe(before.sequence + 1)
    expect(published.total_incense).toBe(1)
    expect(published.up_ratio).toBe(1)
    expect(published.liangzi_state).toBe('liang_zu')
  })

  it.each([
    [59, 41, 'liang_gong'],
    [60, 40, 'liang_zong'],
    [69, 31, 'liang_zong'],
    [70, 30, 'liang_shen'],
    [79, 21, 'liang_shen'],
    [80, 20, 'liang_sheng'],
    [89, 11, 'liang_sheng'],
    [90, 10, 'liang_zu'],
    [100, 0, 'liang_zu'],
  ])('publishes %d up / %d down as %s from one sequence', (upVotes, downVotes, expected) => {
    const f = boot()
    const caseRow = f.service.ensureActiveCase()
    f.store.applyAcceptedVoteToStats(caseRow.id, 'up', false, FIXED_NOW)
    // Seed the aggregate directly: this test is about publication, not spending.
    f.store.transaction(() => {
      f.store.insertSnapshot({
        case_id: caseRow.id,
        sequence: 2,
        business_date: caseRow.business_date,
        up_votes: upVotes,
        down_votes: downVotes,
        unique_voters: 1,
        policy_version: 'liangzi-v0.1-60-70-80-90',
        captured_at: FIXED_NOW,
      })
    })
    const snapshot = parseV1Snapshot(f.service.snapshotResponse().global_snapshot)
    expect(snapshot.sequence).toBe(2)
    expect(snapshot.liangzi_state).toBe(expected)
    // The published view is self-consistent: state matches the counts beside it.
    expect(deriveLiangziState(snapshot.up_votes, snapshot.down_votes)).toBe(snapshot.liangzi_state)
    expect(snapshot.up_ratio).toBeCloseTo(upVotes / (upVotes + downVotes), 12)
  })

  it('changing the personal claim never changes the Liangzi state', () => {
    const f = boot()
    f.grantIncense(INSTALLATION, 4)
    vote(f, INSTALLATION, 'up', 'req-indep-0001')
    f.clock.advance(2_000)
    const before = parseV1Snapshot(f.service.snapshotResponse().global_snapshot)
    f.service.applyTokenClaim(INSTALLATION, {
      claimed_effective_tokens: 5_000_000,
      claim_business_date: f.service.businessDate(),
    })
    const after = parseV1Snapshot(f.service.snapshotResponse().global_snapshot)
    expect(after.sequence).toBe(before.sequence)
    expect(after.liangzi_state).toBe(before.liangzi_state)
    expect(after.up_ratio).toBe(before.up_ratio)
  })
})

describe('business date rollover', () => {
  it('opens a new case, resets used incense, and leaks nothing from yesterday', () => {
    const f = boot()
    f.grantIncense(INSTALLATION, 2)
    vote(f, INSTALLATION, 'up', 'req-day1-00001')
    const yesterday = f.service.ensureActiveCase()
    expect(yesterday.business_date).toBe('2026-08-16')

    f.clock.advance(DAY_MS)
    const today = f.service.ensureActiveCase()
    expect(today.business_date).toBe('2026-08-17')
    expect(today.id).not.toBe(yesterday.id)
    expect(f.store.caseById(yesterday.id)?.status).toBe('closed')

    const state = f.service.dailyState(INSTALLATION).authoritative_personal_state
    expect(state.business_date).toBe('2026-08-17')
    expect(state.claimed_effective_tokens).toBe(0)
    expect(state.used_incense).toBe(0)
    expect(state.remaining_incense).toBe(0)

    const snapshot = parseV1Snapshot(f.service.snapshotResponse().global_snapshot)
    expect(snapshot.case_id).toBe(today.id)
    expect(snapshot.total_incense).toBe(0)
    expect(snapshot.liangzi_state).toBe('waiting')
    // Yesterday's aggregate stays on yesterday's case.
    expect(f.store.statsFor(yesterday.id)?.up_votes).toBe(1)
  })

  it('rejects a retry of yesterday`s case id after the rollover', () => {
    const f = boot()
    f.grantIncense(INSTALLATION, 2)
    const yesterdayCaseId = f.service.ensureActiveCase().id
    f.clock.advance(DAY_MS)
    f.grantIncense(INSTALLATION, 2)
    const stale = f.service.vote(INSTALLATION, {
      case_id: yesterdayCaseId,
      vote_type: 'up',
      request_id: 'req-rollover-01',
    })
    expect(stale.result).toMatchObject({ status: 'rejected', reason: 'case_not_active' })
  })

  it('derives the business date from the server clock and configured timezone only', () => {
    const utc = createBackendFixture({ LIANGBIAO_BUSINESS_TZ: 'UTC' })
    try {
      // 2026-08-16 04:00 UTC is already 12:00 in Shanghai; both are day 16.
      expect(utc.service.businessDate()).toBe('2026-08-16')
      // 22:00 UTC on the 16th is 06:00 on the 17th in Shanghai.
      utc.clock.set(Date.UTC(2026, 7, 16, 22, 0, 0))
      expect(utc.service.businessDate()).toBe('2026-08-16')
      const shanghai = createBackendFixture({ LIANGBIAO_BUSINESS_TZ: 'Asia/Shanghai' }, Date.UTC(2026, 7, 16, 22, 0, 0))
      try {
        expect(shanghai.service.businessDate()).toBe('2026-08-17')
      } finally {
        shanghai.close()
      }
    } finally {
      utc.close()
    }
  })
})
