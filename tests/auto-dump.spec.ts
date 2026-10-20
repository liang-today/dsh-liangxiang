import { afterEach, describe, expect, it, vi } from 'vitest'
import { FakeAuthoritativeLiangService } from '../src/host/fake-service.ts'
import { AUTO_DUMP_PERIOD_MS, DayEndService } from '../src/host/day-end-service.ts'
import { VOTE_COUNT_MAX } from '../src/domain/index.ts'
import { DEFAULT_DAY_END, parseDayEndState, type DayEndState, type DayEndPersistence } from '../src/shared/day-end.ts'
import type { LiangHostService } from '../src/host/service.ts'

/** 11:00 Asia/Shanghai — mid-business-day, nowhere near the day-end window. */
const midday = Date.UTC(2026, 9, 19, 3, 0, 0)
/** 23:00 Asia/Shanghai — one hour before the 23:59 window, so both schedules run. */
const lateEvening = Date.UTC(2026, 9, 19, 15, 0, 0)
const live = new Set<DayEndService>()
afterEach(() => { for (const service of live) service.dispose(); live.clear(); vi.useRealTimers(); vi.restoreAllMocks() })

function setup(enabled = true, remaining = 0, start = midday) {
  vi.useFakeTimers()
  vi.setSystemTime(start)
  const clock = { now: () => Date.now() }
  const inner = new FakeAuthoritativeLiangService({ timezone: 'Asia/Shanghai', tokenPerIncense: 50_000,
    snapshotRefreshSeconds: 1, seed: 'empty', caseTitle: '日间自动倾炉测试', starterIncense: 0 }, clock, () => undefined)
  inner.markReadyMemoryOnly('test')
  if (remaining > 0) inner.creditSimulatedUsage(remaining * 50_000)
  let state: DayEndState = { ...structuredClone(DEFAULT_DAY_END), enabled }
  const persistence: DayEndPersistence = {
    getDayEndState: () => structuredClone(state),
    setDayEndState: vi.fn(async next => { state = structuredClone(next) }),
  }
  let changing = false
  const service = new DayEndService(inner, clock, () => changing, () => undefined)
  live.add(service)
  service.attachDayEndPersistence(persistence)
  service.startDayEnd()
  return { inner, service, persistence, state: () => state, changing: (value: boolean) => { changing = value } }
}

describe('intraday automatic dump', () => {
  it('requires one new opt-in for legacy day-end settings while retaining direction and receipts', async () => {
    const s = setup(true, 1_500)
    const legacy = { enabled: true, voteType: 'down' as const, jobs: { local: {
      businessDate: '2026-10-18', caseId: 'legacy-case', requestId: 'legacy-intent', voteType: 'down' as const, count: 8, done: false,
    } } }
    expect(parseDayEndState(legacy)).toMatchObject({ enabled: false, voteType: 'down', cadenceVersion: 1 })
    expect(parseDayEndState(legacy).jobs).toEqual(legacy.jobs)
    s.service.attachDayEndPersistence({ ...s.persistence, getDayEndState: () => legacy })
    const vote = vi.spyOn(s.inner as LiangHostService, 'vote')
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS * 2)
    expect(vote).not.toHaveBeenCalled()
    await s.service.setDayEndPreferences({ enabled: false, voteType: 'up' })
    expect(s.service.getWireState().dayEnd?.enabled).toBe(false)
    await s.service.setDayEndPreferences({ enabled: true, voteType: 'down' })
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS)
    expect(vote).toHaveBeenCalledTimes(1)
    expect(vote.mock.calls[0]?.[0].voteType).toBe('down')
  })

  it('rechecks the full-request threshold after refreshing authority', async () => {
    const s = setup(true, VOTE_COUNT_MAX)
    const original = s.inner.vote.bind(s.inner)
    vi.spyOn(s.inner, 'refreshNow').mockImplementationOnce(() => {
      original({ caseId: s.inner.getWireState().activeCase.id, voteType: 'down', requestId: 'external-manual', count: 1 })
    })
    const vote = vi.spyOn(s.inner as LiangHostService, 'vote')
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS)
    expect(vote).not.toHaveBeenCalled()
    expect(s.inner.getWireState().personal.remainingIncense).toBe(499)
    expect(s.state().jobs).toEqual({})
  })

  it.each(['refresh', 'persist'] as const)('does not cross business midnight during slow %s', async stage => {
    const s = setup(true, 1_500)
    let release: (() => void) | undefined
    const held = new Promise<void>(resolve => { release = resolve })
    if (stage === 'refresh') vi.spyOn(s.inner, 'refreshNow').mockImplementationOnce(async () => { await held })
    else {
      const save = vi.mocked(s.persistence.setDayEndState).getMockImplementation()!
      vi.mocked(s.persistence.setDayEndState).mockImplementationOnce(async next => { await held; await save(next) })
    }
    const vote = vi.spyOn(s.inner as LiangHostService, 'vote')
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS)
    vi.setSystemTime(Date.UTC(2026, 9, 19, 16, 0, 1))
    s.inner.refreshNow()
    s.inner.creditSimulatedUsage(10 * 50_000)
    release?.()
    await vi.advanceTimersByTimeAsync(1)
    expect(vote).not.toHaveBeenCalled()
    expect(s.inner.getWireState()).toMatchObject({ businessDate: '2026-10-20', personal: { usedIncenseToday: 0, remainingIncense: 10 } })
  })

  it('invalidates a timer after disable/re-enable instead of immediately voting', async () => {
    const s = setup(true, 1_500)
    const vote = vi.spyOn(s.inner as LiangHostService, 'vote')
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS - 1)
    await s.service.setDayEndPreferences({ enabled: false, voteType: 'up' })
    await s.service.setDayEndPreferences({ enabled: true, voteType: 'up' })
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS - 1)
    expect(vote).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(vote).toHaveBeenCalledTimes(1)
  })

  it('blocks periodic voting if its intent cannot be persisted', async () => {
    const s = setup(true, 1_500)
    vi.mocked(s.persistence.setDayEndState).mockRejectedValue(new Error('storage unavailable'))
    const vote = vi.spyOn(s.inner as LiangHostService, 'vote')
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS + 10_000)
    expect(vote).not.toHaveBeenCalled()
  })

  it('invalidates slow automatic work across a switch away and back to the same authority', async () => {
    const s = setup(true, 1_500)
    let release: (() => void) | undefined
    const held = new Promise<void>(resolve => { release = resolve })
    vi.spyOn(s.inner, 'refreshNow').mockImplementationOnce(async () => { await held })
    const vote = vi.spyOn(s.inner as LiangHostService, 'vote')
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS)
    const other = new FakeAuthoritativeLiangService({ timezone: 'Asia/Shanghai', tokenPerIncense: 50_000,
      snapshotRefreshSeconds: 1, seed: 'empty', caseTitle: 'Other mode', starterIncense: 0 }, { now: () => Date.now() }, () => undefined)
    s.service.use(other, false)
    s.service.use(s.inner, false)
    release?.()
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS - 1)
    expect(vote).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(vote).toHaveBeenCalledTimes(1)
  })

  it('reconciles an uncertain periodic receipt before the extra closing intent', async () => {
    const s = setup(true, 1_500, Date.UTC(2026, 9, 19, 15, 48))
    const original = s.inner.vote.bind(s.inner)
    const vote = vi.spyOn(s.inner as LiangHostService, 'vote').mockImplementationOnce(intent => {
      original(intent)
      throw new Error('receipt lost')
    })
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS)
    const periodic = vote.mock.calls[0]?.[0]
    s.service.dispose()
    vi.setSystemTime(Date.UTC(2026, 9, 19, 15, 59))
    const restart = new DayEndService(s.inner, { now: () => Date.now() }, () => false, () => undefined)
    live.add(restart)
    restart.attachDayEndPersistence(s.persistence)
    restart.startDayEnd()
    await vi.advanceTimersByTimeAsync(2)
    expect(vote).toHaveBeenCalledTimes(3)
    expect(vote.mock.calls[1]?.[0]).toEqual(periodic)
    expect(vote.mock.calls[2]?.[0].requestId).not.toBe(periodic?.requestId)
    expect(s.state().jobs.local).toMatchObject({ kind: 'closing', done: true })
  })

  it('uses just the closing attempt when a periodic timer coincides with 23:59', async () => {
    const s = setup(true, 1_500, Date.UTC(2026, 9, 19, 15, 49))
    const vote = vi.spyOn(s.inner as LiangHostService, 'vote')
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS)
    expect(vote).toHaveBeenCalledTimes(1)
    expect(s.state().jobs.local).toMatchObject({ kind: 'closing', done: true })
    await vi.advanceTimersByTimeAsync(55_000)
    expect(vote).toHaveBeenCalledTimes(1)
  })

  it('stays off, and stays quiet below one full request, while the switch is off', async () => {
    const off = setup(false, 1_500)
    const offVote = vi.spyOn(off.inner as LiangHostService, 'vote')
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS * 3)
    expect(offVote).not.toHaveBeenCalled()
  })

  it('never fires while the balance cannot fill one whole request', async () => {
    const s = setup(true, VOTE_COUNT_MAX - 1)
    const vote = vi.spyOn(s.inner as LiangHostService, 'vote')
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS * 3)
    expect(vote).not.toHaveBeenCalled()
    expect(s.inner.getWireState().personal.remainingIncense).toBe(VOTE_COUNT_MAX - 1)
  })

  it('sends one full request per refill period instead of looping over sticks', async () => {
    const s = setup(true, 1_500)
    const vote = vi.spyOn(s.inner as LiangHostService, 'vote')
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS)
    expect(vote).toHaveBeenCalledTimes(1)
    expect(vote.mock.calls[0]?.[0]).toMatchObject({ count: VOTE_COUNT_MAX, voteType: 'up' })
    // The bucket refill period is the whole pacing rule: nothing fires earlier.
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS - 1)
    expect(vote).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(vote).toHaveBeenCalledTimes(2)
  })

  it('persists one exact periodic intent before sending', async () => {
    const s = setup(true, 1_500)
    const original = s.inner.vote.bind(s.inner)
    const vote = vi.spyOn(s.inner as LiangHostService, 'vote').mockImplementation(intent => {
      expect(s.state().jobs.local).toMatchObject({ requestId: intent.requestId, kind: 'periodic', done: false })
      return original(intent)
    })
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS * 2)
    expect(vote).toHaveBeenCalledTimes(2)
    expect(s.state().jobs.local).toMatchObject({ kind: 'periodic', done: true })
    expect(vote.mock.calls[0]?.[0].requestId).not.toBe(vote.mock.calls[1]?.[0].requestId)
  })

  it('gives active manual work priority and honours the 2s quiet window', async () => {
    const s = setup(true, 1_500)
    const vote = vi.spyOn(s.inner as LiangHostService, 'vote')
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS - 1_000)
    expect(vote).not.toHaveBeenCalled()
    await s.service.vote({ caseId: s.inner.getWireState().activeCase.id, voteType: 'down', requestId: 'manual-one', count: 1 })
    expect(vote).toHaveBeenCalledTimes(1)
    // Due now, but the manual shot landed 1s ago: the loop must wait it out.
    await vi.advanceTimersByTimeAsync(1_000)
    expect(vote).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_001)
    expect(vote).toHaveBeenCalledTimes(2)
    expect(vote.mock.calls[1]?.[0]).toMatchObject({ voteType: 'up' })
  })

  it('retries a lost receipt with its durable ID even after restart or a direction change', async () => {
    const s = setup(true, 1_500)
    const original = s.inner.vote.bind(s.inner)
    const vote = vi.spyOn(s.inner as LiangHostService, 'vote').mockImplementationOnce(intent => {
      original(intent)
      throw new Error('receipt lost')
    })
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS)
    const first = vote.mock.calls[0]?.[0]
    expect(s.state().jobs.local?.done).toBe(false)
    const spent = s.inner.getWireState().personal.usedIncenseToday
    s.service.dispose()
    // Retain the authority to model a Host wrapper restart with the same ledger.
    const restart = new DayEndService(s.inner, { now: () => Date.now() }, () => false, () => undefined)
    live.add(restart)
    restart.attachDayEndPersistence(s.persistence)
    await restart.setDayEndPreferences({ enabled: true, voteType: 'down' })
    restart.startDayEnd()
    await vi.advanceTimersByTimeAsync(1)
    expect(vote).toHaveBeenCalledTimes(2)
    expect(vote.mock.calls[1]?.[0]).toEqual(first)
    expect(s.inner.getWireState().personal.usedIncenseToday).toBe(spent)
    expect(s.state().jobs.local?.done).toBe(true)
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS)
    expect(vote).toHaveBeenCalledTimes(3)
    expect(vote.mock.calls[2]?.[0].voteType).toBe('down')
  })

  it('re-arms from a new balance after draining below one request', async () => {
    const s = setup(true, 1_500)
    const vote = vi.spyOn(s.inner as LiangHostService, 'vote')
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS * 3)
    const drained = vote.mock.calls.length
    expect(s.inner.getWireState().personal.remainingIncense).toBeLessThan(VOTE_COUNT_MAX)
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS * 2)
    expect(vote).toHaveBeenCalledTimes(drained)
    s.inner.creditSimulatedUsage(VOTE_COUNT_MAX * 50_000)
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS)
    expect(vote).toHaveBeenCalledTimes(drained + 1)
  })

  it('overlays the day-end shot: the loop drains the day, the window takes the tail', async () => {
    const s = setup(true, 1_500, lateEvening)
    const vote = vi.spyOn(s.inner as LiangHostService, 'vote')
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS * 3)
    expect(vote).toHaveBeenCalledTimes(3)
    expect(s.inner.getWireState().personal.remainingIncense).toBeLessThan(VOTE_COUNT_MAX)
    expect(s.state().jobs.local).toMatchObject({ kind: 'periodic', done: true })
    // 59 minutes later the day-end window opens and sends what the loop left.
    await vi.advanceTimersByTimeAsync(59 * 60_000 - AUTO_DUMP_PERIOD_MS * 3)
    expect(vote).toHaveBeenCalledTimes(4)
    expect(vote.mock.calls[3]?.[0]).toMatchObject({ count: 450 })
    expect(s.state().jobs.local?.done).toBe(true)
    expect(s.inner.getWireState().personal.remainingIncense).toBe(0)
  })
})
