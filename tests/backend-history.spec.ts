import { describe, expect, it } from 'vitest'
import { deriveTemporaryMonth, deriveTemporaryWeek } from '../src/domain/index.ts'
import { parseV1HistoryResponse } from '../src/shared/index.ts'
import { createBackendFixture, DAY_MS } from './helpers/backend.ts'

function vote(
  f: ReturnType<typeof createBackendFixture>,
  installationId: string,
  voteType: 'up' | 'down',
  requestId: string,
): void {
  const caseId = f.service.ensureActiveCase().id
  expect(f.service.vote(installationId, {
    case_id: caseId,
    vote_type: voteType,
    request_id: requestId,
  }).result.status).toBe('accepted')
}

describe('梁祠 backend archive', () => {
  it('freezes all same-day cases once, then exposes full and version deltas', () => {
    const f = createBackendFixture()
    try {
      const installation = 'history-install-01'
      f.service.ensureActiveCase()
      f.grantIncense(installation, 2)
      vote(f, installation, 'up', 'history-vote-0001')
      f.service.publishCase('同日第二梁案')
      vote(f, installation, 'down', 'history-vote-0002')

      f.clock.advance(DAY_MS)
      const today = f.service.ensureActiveCase()
      const full = parseV1HistoryResponse(f.service.historyResponse())
      expect(full).toMatchObject({ full: true, archiveVersion: 1, businessDate: today.business_date })
      expect(full.days).toHaveLength(1)
      expect(full.days[0]).toMatchObject({
        businessDate: '2026-08-16',
        caseCount: 2,
        caseTitles: ['DeepSeek Harness 是夯还是拉', '同日第二梁案'],
        upVotes: 1,
        downVotes: 1,
        totalIncense: 2,
        liangziState: 'liang_zong',
      })
      expect(full.weeks[0]).toMatchObject({
        weekId: '2026-W33',
        coveredDays: 1,
        upVotes: 1,
        downVotes: 1,
      })
      expect(full.months).toHaveLength(0)
      expect(full.days.some(day => day.businessDate === today.business_date)).toBe(false)

      // The current Monday has no completed day in its own week. The current
      // month may use yesterday, but still never today.
      expect(deriveTemporaryWeek(full.businessDate, full.days)).toMatchObject({ status: 'waiting' })
      expect(deriveTemporaryMonth(full.businessDate, full.days)).toMatchObject({
        status: 'temporary',
        throughDate: '2026-08-16',
        upVotes: 1,
        downVotes: 1,
      })

      expect(f.service.ensureActiveCase().id).toBe(today.id)
      expect(f.store.archiveVersion()).toBe(1)
      const delta = parseV1HistoryResponse(f.service.historyResponse(1))
      expect(delta).toMatchObject({ full: false, archiveVersion: 1 })
      expect(delta.days).toEqual([])
      expect(delta.weeks).toEqual([])
      expect(delta.months).toEqual([])
    } finally {
      f.close()
    }
  })

  it('preserves a zero-vote ended day as 待开梁/-- rather than missing data', () => {
    const f = createBackendFixture()
    try {
      f.service.ensureActiveCase()
      f.clock.advance(DAY_MS)
      f.service.ensureActiveCase()
      const history = parseV1HistoryResponse(f.service.historyResponse())
      expect(history.days[0]).toMatchObject({
        totalIncense: 0,
        upRatio: null,
        downRatio: null,
        liangziState: 'waiting',
      })
    } finally {
      f.close()
    }
  })

  it('writes the completed month only after its calendar boundary', () => {
    const august31AtNoonShanghai = Date.UTC(2026, 7, 31, 4, 0, 0)
    const f = createBackendFixture({}, august31AtNoonShanghai)
    try {
      const installation = 'history-install-02'
      f.service.ensureActiveCase()
      f.grantIncense(installation, 3)
      vote(f, installation, 'up', 'history-month-001')
      vote(f, installation, 'up', 'history-month-002')
      vote(f, installation, 'down', 'history-month-003')
      expect(parseV1HistoryResponse(f.service.historyResponse()).months).toHaveLength(0)

      f.clock.advance(DAY_MS)
      f.service.ensureActiveCase()
      const history = parseV1HistoryResponse(f.service.historyResponse())
      expect(history.months).toHaveLength(1)
      expect(history.months[0]).toMatchObject({
        monthId: '2026-08',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        coveredDays: 1,
        upVotes: 2,
        downVotes: 1,
      })
    } finally {
      f.close()
    }
  })

  it('operator wipe removes 梁祠 history without touching today', () => {
    const f = createBackendFixture()
    try {
      const installation = 'history-wipe-01'
      f.service.ensureActiveCase()
      f.grantIncense(installation, 1)
      vote(f, installation, 'up', 'history-wipe-0001')

      f.clock.advance(DAY_MS)
      const today = f.service.ensureActiveCase()
      expect(parseV1HistoryResponse(f.service.historyResponse()).days).toHaveLength(1)

      const cleared = f.service.clearHistoryArchives()
      expect(cleared).toMatchObject({
        business_date: today.business_date,
        days: 1,
        weeks: 1,
        months: 0,
        closed_cases: 1,
      })
      const empty = parseV1HistoryResponse(f.service.historyResponse())
      expect(empty.days).toEqual([])
      expect(empty.weeks).toEqual([])
      expect(empty.months).toEqual([])
      expect(empty.archiveVersion).toBe(0)
      expect(f.service.ensureActiveCase().id).toBe(today.id)

      f.clock.advance(DAY_MS)
      f.service.ensureActiveCase()
      const after = parseV1HistoryResponse(f.service.historyResponse())
      expect(after.days).toHaveLength(1)
      expect(after.days[0]?.businessDate).toBe(today.business_date)
    } finally {
      f.close()
    }
  })
})
