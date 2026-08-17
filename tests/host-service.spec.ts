/**
 * FakeAuthoritativeLiangService P0 matrix: real token mapping, replay/restart
 * dedupe, multi-session aggregation, day rollover, vote transaction
 * (repeat/mixed/concurrency/idempotency/unique voters), snapshot cadence and
 * threshold crossing, personal/global decoupling.
 */
import { describe, expect, it } from 'vitest'
import {
  FakeAuthoritativeLiangService,
  type LiangPersistedState,
  type LiangPersistencePort,
  type LiangServiceConfig,
} from '../src/host/fake-service.ts'
import type { Clock } from '../src/shared/business-date.ts'

/** 2026-08-16 12:00 Asia/Shanghai (04:00 UTC). */
const NOON_SHANGHAI = Date.UTC(2026, 7, 16, 4, 0, 0)
/** 2026-08-17 00:30 Asia/Shanghai (16:30 UTC on the 16th). */
const AFTER_MIDNIGHT_SHANGHAI = Date.UTC(2026, 7, 16, 16, 30, 0)

function fakeClock(start: number): Clock & { set(ms: number): void, advance(ms: number): void } {
  let now = start
  return {
    now: () => now,
    set: (ms) => {
      now = ms
    },
    advance: (ms) => {
      now += ms
    },
  }
}

const BASE_CONFIG: LiangServiceConfig = {
  timezone: 'Asia/Shanghai',
  tokenPerIncense: 50_000,
  snapshotRefreshSeconds: 300,
  seed: 'empty',
  caseTitle: 'DeepSeek Harness 是夯还是拉',
}

function memoryState(): LiangPersistedState {
  return {
    watermarks: new Map(),
    dailyUsage: new Map(),
    ledgers: new Map(),
    aggregates: new Map(),
    votes: new Map(),
  }
}

/** In-memory persistence fake: writes land synchronously in `state`. */
function memoryPort(state: LiangPersistedState): LiangPersistencePort {
  return {
    load: () => Promise.resolve({
      watermarks: new Map(state.watermarks),
      dailyUsage: new Map(state.dailyUsage),
      ledgers: new Map(state.ledgers),
      aggregates: new Map(state.aggregates),
      votes: new Map(state.votes),
    }),
    putWatermark: (id, wm) => void state.watermarks.set(id, wm),
    putDailyUsage: (date, rec) => void state.dailyUsage.set(date, rec),
    putLedger: (date, rec) => void state.ledgers.set(date, rec),
    putAggregate: (caseId, agg) => void state.aggregates.set(caseId, agg),
    putVote: (requestId, rec) => void state.votes.set(requestId, rec),
    deleteVote: (requestId) => void state.votes.delete(requestId),
    deleteDailyUsage: (date) => void state.dailyUsage.delete(date),
  }
}

function readyService(config: Partial<LiangServiceConfig> = {}, clock = fakeClock(NOON_SHANGHAI)) {
  const service = new FakeAuthoritativeLiangService({ ...BASE_CONFIG, ...config }, clock, () => undefined)
  service.markReadyMemoryOnly('test')
  return { service, clock }
}

const FRESH = { kind: 'live', firstLiveSeq: 0 } as const
const CATCHUP = { kind: 'catchup' } as const

const buckets = (uncached: number, cacheRead: number, cacheWrite: number, output: number) => ({
  uncachedInputTokens: uncached,
  cacheReadTokens: cacheRead,
  cacheWriteTokens: cacheWrite,
  outputTokens: output,
})

describe('real token mapping (docs/041 fixture)', () => {
  it('10k uncached + 20k cacheRead + 5k cacheWrite + 15k output = 1 incense', () => {
    const { service } = readyService()
    service.observeUsage('s1', buckets(10_000, 20_000, 5_000, 15_000), FRESH)
    const state = service.getWireState()
    expect(state.accounting.inputTokensToday).toBe(35_000)
    expect(state.accounting.outputTokensToday).toBe(15_000)
    expect(state.personal.effectiveTokensToday).toBe(50_000)
  })

  it('catch-up values baseline (no retroactive incense)', () => {
    const { service } = readyService()
    service.observeUsage('old-session', buckets(100_000, 0, 0, 100_000), CATCHUP)
    expect(service.getWireState().personal.effectiveTokensToday).toBe(0)
    // …but growth after the baseline counts.
    service.observeUsage('old-session', buckets(120_000, 0, 0, 110_000), FRESH)
    expect(service.getWireState().personal.effectiveTokensToday).toBe(30_000)
  })

  it('resumed/forked sessions (firstLiveSeq > 0) baseline their borrowed history', () => {
    const { service } = readyService()
    service.observeUsage('fork', buckets(500_000, 0, 0, 500_000), { kind: 'live', firstLiveSeq: 88 })
    expect(service.getWireState().personal.effectiveTokensToday).toBe(0)
  })

  it('malformed projection payloads are skipped, not folded', () => {
    const { service } = readyService()
    service.observeUsage('s1', { uncachedInputTokens: -5, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }, FRESH)
    service.observeUsage('s1', 'garbage', FRESH)
    expect(service.getWireState().personal.effectiveTokensToday).toBe(0)
  })
})

describe('model incense weight (Pro=1, Flash=0.5)', () => {
  it('100k Flash tokens earn one incense (Pro-equivalent 50k)', () => {
    const { service } = readyService()
    service.observeUsage('s1', buckets(100_000, 0, 0, 0), FRESH, 'deepseek-v4-flash')
    const state = service.getWireState()
    expect(state.personal.effectiveTokensToday).toBe(50_000)
    expect(state.personal.usedIncenseToday).toBe(0)
    expect(
      service.vote({ caseId: state.activeCase.id, voteType: 'up', requestId: 'req-flash-1' }).result.status,
    ).toBe('accepted')
  })

  it('50k Pro tokens still earn one incense', () => {
    const { service } = readyService()
    service.observeUsage('s1', buckets(50_000, 0, 0, 0), FRESH, 'deepseek-v4-pro')
    const state = service.getWireState()
    expect(state.personal.effectiveTokensToday).toBe(50_000)
    expect(
      service.vote({ caseId: state.activeCase.id, voteType: 'up', requestId: 'req-pro-1' }).result.status,
    ).toBe('accepted')
  })

  it('50k Flash tokens do not yet mint a stick', () => {
    const { service } = readyService()
    service.observeUsage('s1', buckets(50_000, 0, 0, 0), FRESH, 'deepseek-v4-flash')
    const state = service.getWireState()
    expect(state.personal.effectiveTokensToday).toBe(25_000)
    expect(
      service.vote({ caseId: state.activeCase.id, voteType: 'up', requestId: 'req-flash-half' }).result.status,
    ).toBe('rejected')
  })

  it('mixed Pro then Flash adds Pro-equivalent totals', () => {
    const { service } = readyService()
    service.observeUsage('s1', buckets(50_000, 0, 0, 0), FRESH, 'deepseek-v4-pro')
    service.observeUsage('s2', buckets(100_000, 0, 0, 0), FRESH, 'deepseek-v4-flash')
    expect(service.getWireState().personal.effectiveTokensToday).toBe(100_000)
  })
})

describe('replay / restart / multi-session', () => {
  it('replaying the same cumulative value never double counts', () => {
    const { service } = readyService()
    const sample = buckets(30_000, 10_000, 5_000, 5_000)
    service.observeUsage('s1', sample, FRESH)
    service.observeUsage('s1', sample, FRESH)
    service.observeUsage('s1', sample, FRESH)
    expect(service.getWireState().personal.effectiveTokensToday).toBe(50_000)
  })

  it('restart: a rehydrated service sees the persisted watermark and adds nothing', async () => {
    const stored = memoryState()
    const clock = fakeClock(NOON_SHANGHAI)
    const first = new FakeAuthoritativeLiangService(BASE_CONFIG, clock, () => undefined)
    await first.attachPersistence(memoryPort(stored))
    first.observeUsage('s1', buckets(40_000, 0, 0, 10_000), FRESH)
    expect(first.getWireState().personal.effectiveTokensToday).toBe(50_000)

    // "Restart": fresh service instance over the same medium; the projection
    // refolds to the same cumulative value.
    const second = new FakeAuthoritativeLiangService(BASE_CONFIG, clock, () => undefined)
    await second.attachPersistence(memoryPort(stored))
    second.observeUsage('s1', buckets(40_000, 0, 0, 10_000), CATCHUP)
    expect(second.getWireState().personal.effectiveTokensToday).toBe(50_000)
    // Growth after the restart still counts once.
    second.observeUsage('s1', buckets(43_000, 0, 0, 10_000), FRESH)
    expect(second.getWireState().personal.effectiveTokensToday).toBe(53_000)
  })

  it('aggregates multiple sessions into one day total', () => {
    const { service } = readyService()
    service.observeUsage('a', buckets(20_000, 0, 0, 10_000), FRESH)
    service.observeUsage('b', buckets(0, 10_000, 5_000, 5_000), FRESH)
    expect(service.getWireState().personal.effectiveTokensToday).toBe(50_000)
  })
})

describe('day rollover', () => {
  it('a new business date opens a fresh WAITING case; nothing leaks', () => {
    const { service, clock } = readyService()
    service.observeUsage('s1', buckets(100_000, 0, 0, 0), FRESH)
    const caseBefore = service.getWireState().activeCase.id
    expect(service.vote({ caseId: caseBefore, voteType: 'up', requestId: 'req-rollover-1' }).result.status).toBe('accepted')

    clock.set(AFTER_MIDNIGHT_SHANGHAI)
    const state = service.getWireState()
    expect(state.businessDate).toBe('2026-08-17')
    expect(state.activeCase.id).not.toBe(caseBefore)
    expect(state.personal.effectiveTokensToday).toBe(0)
    expect(state.personal.usedIncenseToday).toBe(0)
    expect(state.global.upVotes).toBe(0)
    expect(state.global.caseId).toBe(state.activeCase.id)

    // Stale case votes are rejected after rollover.
    const stale = service.vote({ caseId: caseBefore, voteType: 'up', requestId: 'req-rollover-2' })
    expect(stale.result.status).toBe('rejected')
    if (stale.result.status === 'rejected') expect(stale.result.reason).toBe('stale_case')

    // Growth observed after midnight belongs to the new date only.
    service.observeUsage('s1', buckets(150_000, 0, 0, 0), FRESH)
    expect(service.getWireState().personal.effectiveTokensToday).toBe(50_000)
  })
})

describe('vote transaction', () => {
  function fundedService(sticks: number) {
    const { service, clock } = readyService()
    service.observeUsage('s1', buckets(sticks * 50_000, 0, 0, 0), FRESH)
    return { service, clock, caseId: service.getWireState().activeCase.id }
  }

  it('repeated and mixed voting shares one pool; the pool bound is exact', () => {
    const { service, caseId } = fundedService(5)
    const directions = ['up', 'down', 'up', 'up', 'down'] as const
    directions.forEach((voteType, index) => {
      const outcome = service.vote({ caseId, voteType, requestId: `req-mixed-${index}` })
      expect(outcome.result.status).toBe('accepted')
    })
    const sixth = service.vote({ caseId, voteType: 'up', requestId: 'req-mixed-6' })
    expect(sixth.result.status).toBe('rejected')
    if (sixth.result.status === 'rejected') expect(sixth.result.reason).toBe('insufficient_incense')
    const state = service.getWireState()
    expect(state.personal.usedIncenseToday).toBe(5)
  })

  it('remaining=1 with 10 concurrent distinct requests accepts at most one', async () => {
    const { service, caseId } = fundedService(1)
    const outcomes = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        Promise.resolve().then(() => service.vote({ caseId, voteType: 'up', requestId: `req-conc-${index}` }))),
    )
    const accepted = outcomes.filter((outcome) => outcome.result.status === 'accepted')
    expect(accepted).toHaveLength(1)
    expect(service.getWireState().personal.usedIncenseToday).toBe(1)
  })

  it('idempotency: same request id + same payload replays the original result', () => {
    const { service, caseId } = fundedService(3)
    const first = service.vote({ caseId, voteType: 'up', requestId: 'req-idem-1' })
    const replay = service.vote({ caseId, voteType: 'up', requestId: 'req-idem-1' })
    expect(replay.result).toEqual(first.result)
    // Exactly one spend, one global vote, one unique voter.
    service.tick()
    const state = service.getWireState()
    expect(state.personal.usedIncenseToday).toBe(1)
    expect(state.global.upVotes).toBe(1)
    expect(state.global.uniqueVoters).toBe(1)
  })

  it('idempotency conflict: same request id + different direction is rejected', () => {
    const { service, caseId } = fundedService(3)
    service.vote({ caseId, voteType: 'up', requestId: 'req-idem-2' })
    const conflict = service.vote({ caseId, voteType: 'down', requestId: 'req-idem-2' })
    expect(conflict.result.status).toBe('rejected')
    if (conflict.result.status === 'rejected') expect(conflict.result.reason).toBe('idempotency_conflict')
  })

  it('unique voters increment only on the first accepted vote', () => {
    const { service, caseId } = fundedService(3)
    service.vote({ caseId, voteType: 'up', requestId: 'req-unique-1' })
    service.vote({ caseId, voteType: 'down', requestId: 'req-unique-2' })
    service.tick()
    expect(service.getWireState().global.uniqueVoters).toBe(1)
  })
})

describe('published snapshot cadence + decoupling', () => {
  it('a vote moves personal state immediately but the published global waits for tick()', () => {
    const { service } = readyService({ seed: 'demo' })
    service.observeUsage('s1', buckets(100_000, 0, 0, 0), FRESH)
    const caseId = service.getWireState().activeCase.id
    const before = service.getWireState()
    expect(before.global.upVotes).toBe(10_665)

    const outcome = service.vote({ caseId, voteType: 'up', requestId: 'req-cadence-1' })
    expect(outcome.result.status).toBe('accepted')
    // Personal spend is immediate; the published snapshot has not moved.
    expect(outcome.state.personal.usedIncenseToday).toBe(1)
    expect(outcome.state.global.upVotes).toBe(10_665)
    expect(outcome.state.global.sequence).toBe(before.global.sequence)

    service.tick()
    const after = service.getWireState()
    expect(after.global.upVotes).toBe(10_666)
    expect(after.global.sequence).toBeGreaterThan(before.global.sequence)
  })

  it('threshold crossing arrives with the snapshot: 79.x% -> 80%', async () => {
    const stored = memoryState()
    stored.aggregates.set('local-2026-08-16-0', { upVotes: 79, downVotes: 20, uniqueVoters: 30 })
    const clock = fakeClock(NOON_SHANGHAI)
    const service = new FakeAuthoritativeLiangService(BASE_CONFIG, clock, () => undefined)
    await service.attachPersistence(memoryPort(stored))
    service.observeUsage('s1', buckets(50_000, 0, 0, 0), FRESH)
    const caseId = service.getWireState().activeCase.id

    // 79/99 = 79.8% -> 梁神 band under the 50/70/85/95 policy.
    expect(service.getWireState().global.upVotes).toBe(79)
    service.vote({ caseId, voteType: 'up', requestId: 'req-cross-01' })
    service.tick()
    const state = service.getWireState()
    expect(state.global.upVotes).toBe(80)
    expect(state.global.upVotes / (state.global.upVotes + state.global.downVotes)).toBe(0.8)
    // Personal ring progress did not move with the vote.
    expect(state.personal.effectiveTokensToday).toBe(50_000)
    expect(state.personal.usedIncenseToday).toBe(1)
  })

  it('personal token growth alone never republishes different global counts', () => {
    const { service } = readyService({ seed: 'demo' })
    const before = service.getWireState().global
    service.observeUsage('s1', buckets(500_000, 0, 0, 0), FRESH)
    service.tick()
    const after = service.getWireState().global
    expect(after.upVotes).toBe(before.upVotes)
    expect(after.downVotes).toBe(before.downVotes)
    expect(after.sequence).toBe(before.sequence)
  })

  it('cycles the prepared local 今日梁案 list', () => {
    const { service } = readyService()
    const first = service.getWireState().activeCase
    expect(first.title).toBe('DeepSeek Harness 是夯还是拉')
    service.cycleLocalCase()
    const second = service.getWireState().activeCase
    expect(second.title).not.toBe(first.title)
    expect(second.id).not.toBe(first.id)
  })

  it('empty seed publishes a zero-vote snapshot (WAITING semantics)', () => {
    const { service } = readyService()
    const global = service.getWireState().global
    expect(global.upVotes).toBe(0)
    expect(global.downVotes).toBe(0)
    expect(global.uniqueVoters).toBe(0)
  })
})

describe('hydration guards', () => {
  it('clamps a persisted ledger that exceeds earned incense (loudly, not fatally)', async () => {
    const stored = memoryState()
    stored.ledgers.set('2026-08-16', { usedIncense: 3 })
    // No daily usage stored -> earned 0.
    const warnings: string[] = []
    const service = new FakeAuthoritativeLiangService(BASE_CONFIG, fakeClock(NOON_SHANGHAI), (message) => warnings.push(message))
    await service.attachPersistence(memoryPort(stored))
    expect(service.getWireState().personal.usedIncenseToday).toBe(0)
    expect(warnings.some((message) => message.includes('clamping'))).toBe(true)
  })

  it('observations arriving before readiness are folded once ready', async () => {
    const clock = fakeClock(NOON_SHANGHAI)
    const service = new FakeAuthoritativeLiangService(BASE_CONFIG, clock, () => undefined)
    service.observeUsage('s1', buckets(50_000, 0, 0, 0), FRESH)
    expect(service.getWireState().personal.effectiveTokensToday).toBe(0)
    await service.attachPersistence(memoryPort(memoryState()))
    expect(service.getWireState().personal.effectiveTokensToday).toBe(50_000)
  })

  it('credits simulated tokens without a DSH session', () => {
    const { service } = readyService()
    service.creditSimulatedUsage(50_000)
    expect(service.getWireState().personal.effectiveTokensToday).toBe(50_000)
    service.creditSimulatedUsage(50_000)
    expect(service.getWireState().personal.effectiveTokensToday).toBe(100_000)
    expect(service.getWireState().personal.usedIncenseToday).toBe(0)
  })
})
