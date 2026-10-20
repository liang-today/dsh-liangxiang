import { VOTE_COUNT_MAX, type VoteType, type LocalIncenseLedger } from '../domain/index.ts'

export const DAY_END_ACTION_HEADER = 'x-liangxiang-day-end-action'
export const DAY_END_ACTION_VALUE = 'explicit'

export interface DayEndPreferences { enabled: boolean, voteType: VoteType }
export interface DayEndJob {
  businessDate: string
  caseId: string
  requestId: string
  voteType: VoteType
  count: number
  done: boolean
  /** Missing on legacy receipts, which always represent the closing dump. */
  kind?: 'periodic' | 'closing'
}
export interface TimedIncenseLedger extends LocalIncenseLedger { businessDate: string }
export interface DayEndState extends DayEndPreferences {
  /** Host-local accepted automatic votes; never sent to the community. */
  incense?: { online?: TimedIncenseLedger, local?: TimedIncenseLedger }
  /** Expanded automatic voting requires an explicit opt-in after upgrade. */
  cadenceVersion?: 1
  jobs: { online?: DayEndJob, local?: DayEndJob }
}
export interface DayEndPersistence {
  getDayEndState(): DayEndState | null
  setDayEndState(state: DayEndState): Promise<void>
}
export interface DayEndTiming { now: number, endsAt: number, businessDate: string }
export const DEFAULT_DAY_END: DayEndState = { enabled: false, voteType: 'up', cadenceVersion: 1, jobs: {} }

/** Strict boundary validation, shared by storage and the same-origin API. */
export function parseDayEndPreferences(raw: unknown): DayEndPreferences {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('expected day-end preferences')
  const r = raw as Record<string, unknown>
  if (r.cadenceVersion !== undefined && r.cadenceVersion !== 1) throw new Error('invalid incense cadence version')
  if (typeof r.enabled !== 'boolean' || (r.voteType !== 'up' && r.voteType !== 'down')) throw new Error('invalid day-end preferences')
  return { enabled: r.enabled, voteType: r.voteType }
}

export function parseDayEndState(raw: unknown): DayEndState {
  const prefs = parseDayEndPreferences(raw)
  const r = raw as Record<string, unknown>
  if (typeof r.jobs !== 'object' || r.jobs === null || Array.isArray(r.jobs)) throw new Error('invalid day-end jobs')
  const jobs: DayEndState['jobs'] = {}
  for (const mode of ['online', 'local'] as const) {
    const job = (r.jobs as Record<string, unknown>)[mode]
    if (job === undefined) continue
    if (typeof job !== 'object' || job === null) throw new Error('invalid day-end job')
    const j = job as Record<string, unknown>
    if (typeof j.businessDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(j.businessDate)
      || typeof j.caseId !== 'string' || !j.caseId.length
      || typeof j.requestId !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(j.requestId)
      || (j.voteType !== 'up' && j.voteType !== 'down') || typeof j.done !== 'boolean'
      || !Number.isSafeInteger(j.count) || (j.count as number) < 1 || (j.count as number) > VOTE_COUNT_MAX) throw new Error('invalid day-end job')
    if (j.kind !== undefined && j.kind !== 'periodic' && j.kind !== 'closing') throw new Error('invalid incense job kind')
    jobs[mode] = { businessDate: j.businessDate, caseId: j.caseId, requestId: j.requestId, voteType: j.voteType, count: j.count as number, done: j.done,
      ...(j.kind === undefined ? {} : { kind: j.kind }) }
  }
  const incense: NonNullable<DayEndState['incense']> = {}
  if (r.incense !== undefined) {
    if (typeof r.incense !== 'object' || r.incense === null || Array.isArray(r.incense)) throw new Error('invalid timed incense')
    for (const mode of ['online', 'local'] as const) {
      const raw = (r.incense as Record<string, unknown>)[mode]
      if (raw === undefined) continue
      const counts = parseTimedIncenseLedger(raw)
      incense[mode] = counts
    }
  }
  return { ...prefs, enabled: r.cadenceVersion === 1 && prefs.enabled, cadenceVersion: 1, jobs,
    ...(r.incense === undefined ? {} : { incense }) }
}

export function parseTimedIncenseLedger(raw: unknown): TimedIncenseLedger {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('invalid timed incense ledger')
  const r = raw as Record<string, unknown>
  if (typeof r.businessDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.businessDate)) throw new Error('invalid timed incense date')
  const count = (key: string): number => {
    const value = r[key]
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('invalid timed incense count')
    return value
  }
  const ledger = { businessDate: r.businessDate, lifetimeUp: count('lifetimeUp'), lifetimeDown: count('lifetimeDown'),
    todayUp: count('todayUp'), todayDown: count('todayDown') }
  if (ledger.todayUp > ledger.lifetimeUp || ledger.todayDown > ledger.lifetimeDown) throw new Error('invalid timed incense totals')
  return ledger
}
