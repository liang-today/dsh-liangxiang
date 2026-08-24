/**
 * FakeAuthoritativeLiangService P0 matrix: real token mapping, replay/restart
 * dedupe, multi-session aggregation, day rollover, vote transaction
 * (repeat/mixed/concurrency/idempotency/unique voters), snapshot cadence and
 * threshold crossing, personal/global decoupling.
 */
import { describe, expect, it } from 'vitest'
import { deriveLiangziState } from '../src/domain/index.ts'
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
    caseIndexes: new Map(),
    dayArchives: new Map(),
    weekArchives: new Map(),
    monthArchives: new Map(),
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
      caseIndexes: new Map(state.caseIndexes),
      dayArchives: new Map(state.dayArchives),
      weekArchives: new Map(state.weekArchives),
      monthArchives: new Map(state.monthArchives),
    }),
    flush: () => Promise.resolve(),
    putWatermark: (id, wm) => void state.watermarks.set(id, wm),
    putDailyUsage: (date, rec) => void state.dailyUsage.set(date, rec),
    putLedger: (date, rec) => void state.ledgers.set(date, rec),
    putAggregate: (caseId, agg) => void state.aggregates.set(caseId, agg),
    putVote: (requestId, rec) => void state.votes.set(requestId, rec),
    putCaseIndex: (date, rec) => void state.caseIndexes.set(date, rec),
    putDayArchive: (date, archive) => void state.dayArchives.set(date, archive),
    putWeekArchive: (weekId, archive) => void state.weekArchives.set(weekId, archive),
    putMonthArchive: (monthId, archive) => void state.monthArchives.set(monthId, archive),
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
    service.observeUsage('s1', buckets(10_000, 20_000, 5_000, 15_000), FRESH, 'deepseek-v4-pro')
    const state = service.getWireState()
    expect(state.accounting.inputTokensToday).toBe(35_000)
    expect(state.accounting.outputTokensToday).toBe(15_000)
    expect(state.personal.effectiveTokensToday).toBe(50_000)
  })

  it('catch-up values baseline (no retroactive incense)', () => {
    const { service } = readyService()
    service.observeUsage('old-session', buckets(100_000, 0, 0, 100_000), CATCHUP, 'deepseek-v4-pro')
    expect(service.getWireState().personal.effectiveTokensToday).toBe(0)
    // …but growth after the baseline counts.
    service.observeUsage('old-session', buckets(120_000, 0, 0, 110_000), FRESH, 'deepseek-v4-pro')
    expect(service.getWireState().personal.effectiveTokensToday).toBe(30_000)
  })

  it('resumed/forked sessions (firstLiveSeq > 0) baseline their borrowed history', () => {
    const { service } = readyService()
    service.observeUsage('fork', buckets(500_000, 0, 0, 500_000), { kind: 'live', firstLiveSeq: 88 }, 'deepseek-v4-pro')
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
    service.observeUsage('s1', sample, FRESH, 'deepseek-v4-pro')
    service.observeUsage('s1', sample, FRESH, 'deepseek-v4-pro')
    service.observeUsage('s1', sample, FRESH, 'deepseek-v4-pro')
    expect(service.getWireState().personal.effectiveTokensToday).toBe(50_000)
  })

  it('restart: a rehydrated service sees the persisted watermark and adds nothing', async () => {
    const stored = memoryState()
    const clock = fakeClock(NOON_SHANGHAI)
    const first = new FakeAuthoritativeLiangService(BASE_CONFIG, clock, () => undefined)
    await first.attachPersistence(memoryPort(stored))
    first.observeUsage('s1', buckets(40_000, 0, 0, 10_000), FRESH, 'deepseek-v4-pro')
    expect(first.getWireState().personal.effectiveTokensToday).toBe(50_000)

    // "Restart": fresh service instance over the same medium; the projection
    // refolds to the same cumulative value.
    const second = new FakeAuthoritativeLiangService(BASE_CONFIG, clock, () => undefined)
    await second.attachPersistence(memoryPort(stored))
    second.observeUsage('s1', buckets(40_000, 0, 0, 10_000), CATCHUP, 'deepseek-v4-pro')
    expect(second.getWireState().personal.effectiveTokensToday).toBe(50_000)
    // Growth after the restart still counts once.
    second.observeUsage('s1', buckets(43_000, 0, 0, 10_000), FRESH, 'deepseek-v4-pro')
    expect(second.getWireState().personal.effectiveTokensToday).toBe(53_000)
  })

  it('aggregates multiple sessions into one day total', () => {
    const { service } = readyService()
    service.observeUsage('a', buckets(20_000, 0, 0, 10_000), FRESH, 'deepseek-v4-pro')
    service.observeUsage('b', buckets(0, 10_000, 5_000, 5_000), FRESH, 'deepseek-v4-pro')
    expect(service.getWireState().personal.effectiveTokensToday).toBe(50_000)
  })
})

describe('day rollover', () => {
  it('a new business date opens a fresh WAITING case; nothing leaks', () => {
    const { service, clock } = readyService()
    service.observeUsage('s1', buckets(100_000, 0, 0, 0), FRESH, 'deepseek-v4-pro')
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
    service.observeUsage('s1', buckets(150_000, 0, 0, 0), FRESH, 'deepseek-v4-pro')
    expect(service.getWireState().personal.effectiveTokensToday).toBe(50_000)
  })

  it('persists the selected local case and resumes it after restart', async () => {
    const stored = memoryState()
    const clock = fakeClock(NOON_SHANGHAI)
    const first = new FakeAuthoritativeLiangService(BASE_CONFIG, clock, () => undefined)
    await first.attachPersistence(memoryPort(stored))
    first.cycleLocalCase()
    const selected = first.getWireState().activeCase

    const second = new FakeAuthoritativeLiangService(BASE_CONFIG, clock, () => undefined)
    await second.attachPersistence(memoryPort(stored))
    expect(second.getWireState().activeCase).toMatchObject({ id: selected.id, title: selected.title })
  })

  it('recovers and persists local 梁祠 archives when restart crosses midnight', async () => {
    const stored = memoryState()
    const firstClock = fakeClock(NOON_SHANGHAI)
    const first = new FakeAuthoritativeLiangService(BASE_CONFIG, firstClock, () => undefined)
    await first.attachPersistence(memoryPort(stored))
    first.observeUsage('s1', buckets(50_000, 0, 0, 0), FRESH, 'deepseek-v4-pro')
    const caseId = first.getWireState().activeCase.id
    first.vote({ caseId, voteType: 'up', requestId: 'req-local-archive-restart' })

    const second = new FakeAuthoritativeLiangService(BASE_CONFIG, fakeClock(AFTER_MIDNIGHT_SHANGHAI), () => undefined)
    await second.attachPersistence(memoryPort(stored))
    const afterRestart = second.history()
    expect(afterRestart.archive_version).toBe(1)
    expect(afterRestart.days).toHaveLength(1)
    expect(afterRestart.days[0]).toMatchObject({ business_date: '2026-08-16', up_votes: 1, down_votes: 0 })

    const third = new FakeAuthoritativeLiangService(BASE_CONFIG, fakeClock(AFTER_MIDNIGHT_SHANGHAI), () => undefined)
    await third.attachPersistence(memoryPort(stored))
    expect(third.history()).toEqual(afterRestart)
  })

  it('builds a recovered completed week only after every stored day is materialized', async () => {
    const stored = memoryState()
    stored.aggregates.set('local-2026-08-10-0', { upVotes: 2, downVotes: 0, uniqueVoters: 1 })
    stored.aggregates.set('local-2026-08-11-0', { upVotes: 0, downVotes: 3, uniqueVoters: 1 })
    const service = new FakeAuthoritativeLiangService(
      BASE_CONFIG,
      fakeClock(AFTER_MIDNIGHT_SHANGHAI),
      () => undefined,
    )
    await service.attachPersistence(memoryPort(stored))

    const history = service.history()
    expect(history.days).toHaveLength(2)
    expect(history.weeks).toHaveLength(1)
    expect(history.weeks[0]).toMatchObject({
      week_id: '2026-W33',
      covered_days: 2,
      up_votes: 2,
      down_votes: 3,
    })
  })
})

describe('vote transaction', () => {
  function fundedService(sticks: number) {
    const { service, clock } = readyService()
    service.observeUsage('s1', buckets(sticks * 50_000, 0, 0, 0), FRESH, 'deepseek-v4-pro')
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

  it('dumps the remaining pool in one accepted request', () => {
    const { service, caseId } = fundedService(12)
    const outcome = service.vote({ caseId, voteType: 'down', requestId: 'req-dump-local', count: 12 })
    expect(outcome.result).toMatchObject({
      status: 'accepted',
      spentIncense: 12,
      usedIncenseToday: 12,
      remainingIncense: 0,
    })
    expect(service.getWireState().personal.usedIncenseToday).toBe(12)
    expect(service.getWireState().personal.remainingIncense).toBe(0)
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

  it('idempotency: same request id + same payload does not spend again', () => {
    const { service, caseId } = fundedService(3)
    const first = service.vote({ caseId, voteType: 'up', requestId: 'req-idem-1' })
    service.vote({ caseId, voteType: 'down', requestId: 'req-later-1' })
    const replay = service.vote({ caseId, voteType: 'up', requestId: 'req-idem-1' })
    expect(first.result).toMatchObject({ status: 'accepted', usedIncenseToday: 1, remainingIncense: 2, spentIncense: 1 })
    expect(replay.result).toMatchObject({ status: 'accepted', usedIncenseToday: 2, remainingIncense: 1, spentIncense: 0 })
    service.tick()
    const state = service.getWireState()
    expect(state.personal.usedIncenseToday).toBe(2)
    expect(state.global.upVotes).toBe(1)
    expect(state.global.downVotes).toBe(1)
    expect(state.global.uniqueVoters).toBe(1)
  })

  it('idempotency conflict: same request id + different count is rejected', () => {
    const { service, caseId } = fundedService(5)
    service.vote({ caseId, voteType: 'up', requestId: 'req-count-1', count: 2 })
    const conflict = service.vote({ caseId, voteType: 'up', requestId: 'req-count-1', count: 3 })
    expect(conflict.result.status).toBe('rejected')
    if (conflict.result.status === 'rejected') expect(conflict.result.reason).toBe('idempotency_conflict')
    expect(service.getWireState().personal.usedIncenseToday).toBe(2)
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

  it('counts the local player once again after manually cycling to another case', () => {
    const { service, caseId } = fundedService(2)
    service.vote({ caseId, voteType: 'up', requestId: 'req-first-case' })
    service.cycleLocalCase()
    const nextCaseId = service.getWireState().activeCase.id
    service.vote({ caseId: nextCaseId, voteType: 'down', requestId: 'req-next-case' })
    service.tick()
    expect(service.getWireState().global.uniqueVoters).toBe(1)
  })
})

describe('published snapshot cadence + decoupling', () => {
  it('a vote moves personal state immediately but the published global waits for tick()', () => {
    const { service } = readyService({ seed: 'demo' })
    service.observeUsage('s1', buckets(100_000, 0, 0, 0), FRESH, 'deepseek-v4-pro')
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

  it('threshold crossing arrives with the snapshot: 84.2105% -> 85%', async () => {
    const stored = memoryState()
    stored.aggregates.set('local-2026-08-16-0', { upVotes: 16, downVotes: 3, uniqueVoters: 8 })
    const clock = fakeClock(NOON_SHANGHAI)
    const service = new FakeAuthoritativeLiangService(BASE_CONFIG, clock, () => undefined)
    await service.attachPersistence(memoryPort(stored))
    service.observeUsage('s1', buckets(50_000, 0, 0, 0), FRESH, 'deepseek-v4-pro')
    const caseId = service.getWireState().activeCase.id

    expect(service.getWireState().global.upVotes).toBe(16)
    expect(deriveLiangziState(16, 3)).toBe('liang_shen')
    service.vote({ caseId, voteType: 'up', requestId: 'req-cross-01' })
    service.tick()
    const state = service.getWireState()
    expect(state.global.upVotes).toBe(17)
    expect(state.global.upVotes / (state.global.upVotes + state.global.downVotes)).toBe(0.85)
    expect(deriveLiangziState(state.global.upVotes, state.global.downVotes)).toBe('liang_sheng')
    // Personal ring progress did not move with the vote.
    expect(state.personal.effectiveTokensToday).toBe(50_000)
    expect(state.personal.usedIncenseToday).toBe(1)
  })

  it('personal token growth alone never republishes different global counts', () => {
    const { service } = readyService({ seed: 'demo' })
    const before = service.getWireState().global
    service.observeUsage('s1', buckets(500_000, 0, 0, 0), FRESH, 'deepseek-v4-pro')
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
    service.observeUsage('s1', buckets(50_000, 0, 0, 0), FRESH, 'deepseek-v4-pro')
    expect(service.getWireState().personal.effectiveTokensToday).toBe(0)
    await service.attachPersistence(memoryPort(memoryState()))
    expect(service.getWireState().personal.effectiveTokensToday).toBe(50_000)
  })

  it('keeps a catch-up baseline when a later live event arrives before ready', async () => {
    const service = new FakeAuthoritativeLiangService(BASE_CONFIG, fakeClock(NOON_SHANGHAI), () => undefined)
    service.observeUsage('s1', buckets(50_000, 0, 0, 0), CATCHUP, 'deepseek-v4-pro')
    service.observeUsage('s1', buckets(100_000, 0, 0, 0), FRESH, 'deepseek-v4-pro')
    await service.attachPersistence(memoryPort(memoryState()))
    expect(service.getWireState().personal.effectiveTokensToday).toBe(50_000)
  })

  it('does not double-count when memory-only observations later attach an empty disk', async () => {
    const service = new FakeAuthoritativeLiangService(BASE_CONFIG, fakeClock(NOON_SHANGHAI), () => undefined)
    service.markReadyMemoryOnly('test')
    service.observeUsage('s1', buckets(50_000, 0, 0, 0), FRESH, 'deepseek-v4-pro')
    expect(service.getWireState().personal.effectiveTokensToday).toBe(50_000)
    await service.attachPersistence(memoryPort(memoryState()))
    service.observeUsage('s1', buckets(50_000, 0, 0, 0), FRESH, 'deepseek-v4-pro')
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
