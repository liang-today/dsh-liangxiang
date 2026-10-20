import { randomUUID } from 'node:crypto'
import { EMPTY_LOCAL_INCENSE, recordLocalIncenseVote, rollLocalIncenseDay, VOTE_COUNT_MAX, VOTE_REFILL_PER_MINUTE } from '../domain/index.ts'
import type { Clock } from '../shared/business-date.ts'
import { DEFAULT_DAY_END, parseDayEndPreferences, parseDayEndState, type DayEndPersistence, type DayEndPreferences, type DayEndState, type DayEndJob } from '../shared/day-end.ts'
import type { LiangxiangWireState, WireVoteRequest } from '../shared/wire.ts'
import { AuthoritySlot } from './authority-slot.ts'
import type { LiangHostService, VoteOutcome } from './service.ts'

const START_BEFORE_END_MS = 60_000
const STOP_BEFORE_END_MS = 5_000
const MANUAL_IDLE_MS = 2_000
const GESTURE_LEASE_MS = 5_000
const RETRY_MS = 5_000
export const AUTO_DUMP_PERIOD_MS = VOTE_COUNT_MAX / VOTE_REFILL_PER_MINUTE * 60_000
interface ScheduleContext { authority: LiangHostService, businessDate: string, caseId: string, generation: number }

/** Timed ordinary dumps and one closing dump share one durable intent per mode. */
export class DayEndService extends AuthoritySlot {
  private state: DayEndState = structuredClone(DEFAULT_DAY_END)
  private persistence: DayEndPersistence | null = null
  private settingsRevision = 0
  private mutations: Promise<void> = Promise.resolve()
  private votes: Promise<unknown> = Promise.resolve()
  private manualPending = 0
  private lastManualAt = Number.NEGATIVE_INFINITY
  private gestureUntil = 0
  private retryAt = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private unsubscribe: (() => void) | null = null
  private stopped = false
  private running = false
  private scheduling = false
  private periodicReadyAt = 0
  private scheduleKey = ''
  private scheduledAuthority: LiangHostService | null = null
  private generation = 0

  constructor(inner: LiangHostService, private readonly clock: Clock,
    private readonly changingMode: () => boolean, private readonly warn: (message: string) => void) {
    super(inner)
  }

  override use(next: LiangHostService, disposePrevious = true): void {
    if (next !== this.current) {
      this.generation += 1
      this.periodicReadyAt = 0
    }
    super.use(next, disposePrevious)
  }

  attachDayEndPersistence(port: DayEndPersistence): void {
    this.persistence = port
    this.state = parseDayEndState(port.getDayEndState() ?? DEFAULT_DAY_END)
    this.generation += 1
    this.settingsRevision += 1
    this.emit()
  }

  override getWireState(): LiangxiangWireState {
    const wire = super.getWireState()
    const ledger = this.state.incense?.[wire.authorityMode === 'LOCAL_FAKE_DEV' ? 'local' : 'online']
    const timedIncense = ledger === undefined ? undefined
      : ledger.businessDate === wire.businessDate ? ledger : { ...rollLocalIncenseDay(ledger), businessDate: wire.businessDate }
    return { ...wire, ...(timedIncense === undefined ? {} : { timedIncense }), revision: wire.revision + this.settingsRevision,
      dayEnd: { enabled: this.state.enabled, voteType: this.state.voteType, available: this.persistence !== null } }
  }

  async setDayEndPreferences(raw: DayEndPreferences): Promise<void> {
    const preferences = parseDayEndPreferences(raw)
    await this.save(s => ({ ...s, ...preferences, cadenceVersion: 1 }))
  }

  /** Cover the 1.5s hold before it becomes a vote request. Cancellation expires. */
  noteManualGesture(): void {
    this.gestureUntil = this.clock.now() + GESTURE_LEASE_MS
    this.schedule()
  }

  private save(change: (state: DayEndState) => DayEndState): Promise<void> {
    const run = this.mutations.then(async () => {
      if (this.persistence === null || this.stopped) throw new Error('定时设置尚未加载，请稍后重试')
      const next = change(this.state)
      await this.persistence.setDayEndState(next)
      if (this.state.enabled !== next.enabled) {
        this.generation += 1
        this.periodicReadyAt = 0
      }
      this.state = next
      this.settingsRevision += 1
      this.emit()
    })
    this.mutations = run.catch(() => undefined)
    return run
  }

  override vote(intent: WireVoteRequest): Promise<VoteOutcome> {
    this.manualPending += 1
    this.lastManualAt = this.clock.now()
    const authority = this.current
    return this.enqueue(authority, async () => {
      const result = await authority.vote(intent)
      return { result: result.result, state: this.getWireState() }
    }).finally(() => {
      this.manualPending -= 1
      this.gestureUntil = 0
      this.lastManualAt = this.clock.now()
      this.schedule()
    })
  }

  private enqueue<T>(authority: LiangHostService, task: () => Promise<T>): Promise<T> {
    const run = this.votes.then(() => {
      if (this.stopped || this.current !== authority || this.changingMode()) throw new Error('上香模式已切换，请重试')
      return task()
    })
    this.votes = run.catch(() => undefined)
    return run
  }

  startDayEnd(): () => void {
    this.unsubscribe?.()
    this.unsubscribe = this.subscribe(() => this.schedule())
    this.schedule()
    return () => this.stopDayEnd()
  }

  private schedule(): void {
    if (this.scheduling) return
    this.scheduling = true
    try { this.updateSchedule() } finally { this.scheduling = false }
  }

  private updateSchedule(): void {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    if (this.stopped || this.running || !this.state.enabled || this.persistence === null || !this.isReady) return
    const timing = this.current.dayEndTiming?.()
    if (timing == null) return
    const wire = this.getWireState()
    const mode = wire.authorityMode === 'LOCAL_FAKE_DEV' ? 'local' : 'online'
    const key = `${mode}:${timing.businessDate}:${wire.activeCase.id}`
    if (this.scheduleKey !== key || this.scheduledAuthority !== this.current) {
      this.scheduleKey = key
      this.scheduledAuthority = this.current
      this.periodicReadyAt = 0
      this.retryAt = 0
    }
    const job = this.state.jobs[mode]?.businessDate === timing.businessDate ? this.state.jobs[mode] : undefined
    const closing = timing.now >= timing.endsAt - START_BEFORE_END_MS
    const done = job?.done && job.kind !== 'periodic'
    let delay = Math.max(0, timing.endsAt - START_BEFORE_END_MS - timing.now)
    if (!closing && (job === undefined || job.kind === 'periodic')) {
      if (job?.kind === 'periodic' && !job.done) delay = 0
      else if (wire.personal.remainingIncense >= VOTE_COUNT_MAX) {
        if (this.periodicReadyAt === 0) this.periodicReadyAt = this.clock.now() + AUTO_DUMP_PERIOD_MS
        delay = Math.min(delay, Math.max(0, this.periodicReadyAt - this.clock.now()))
      } else this.periodicReadyAt = 0
    }
    if ((closing && done) || timing.now >= timing.endsAt - STOP_BEFORE_END_MS) delay = Math.max(RETRY_MS, timing.endsAt - timing.now + 1_000)
    else if (!wire.authorityAvailable || this.changingMode() || this.manualPending > 0) delay = Math.max(delay, RETRY_MS)
    delay = Math.max(delay, this.retryAt - this.clock.now(), this.gestureUntil - this.clock.now(), this.lastManualAt + MANUAL_IDLE_MS - this.clock.now())
    const context: ScheduleContext = { authority: this.current, businessDate: timing.businessDate,
      caseId: wire.activeCase.id, generation: this.generation }
    this.timer = setTimeout(() => { this.timer = null; void this.runDayEnd(context) }, Math.max(1, delay))
  }

  private inWindow(context: ScheduleContext): boolean {
    const { authority } = context
    const timing = authority.dayEndTiming?.()
    const wire = authority.getWireState()
    return !this.stopped && this.state.enabled && this.current === authority && !this.changingMode()
      && this.generation === context.generation && wire.businessDate === context.businessDate
      && wire.activeCase.id === context.caseId && timing?.businessDate === context.businessDate
      && timing.now < timing.endsAt - STOP_BEFORE_END_MS
  }

  private canPrepareVote(context: ScheduleContext): boolean {
    return this.manualPending === 0
      && this.clock.now() >= Math.max(this.gestureUntil, this.lastManualAt + MANUAL_IDLE_MS)
      && this.inWindow(context)
  }

  private async runDayEnd(context: ScheduleContext): Promise<void> {
    if (this.running || !this.inWindow(context)) { this.schedule(); return }
    this.running = true
    const { authority } = context
    try {
      await this.enqueue(authority, async () => {
        if (!this.canPrepareVote(context)) return
        await authority.refreshNow?.()
        if (!this.canPrepareVote(context)) return
        const wire = authority.getWireState()
        if (!wire.authorityAvailable) return
        const mode = wire.authorityMode === 'LOCAL_FAKE_DEV' ? 'local' : 'online'
        let job = this.state.jobs[mode]
        const timing = authority.dayEndTiming?.()
        if (timing == null) return
        const closing = timing.now >= timing.endsAt - START_BEFORE_END_MS
        const today = job?.businessDate === wire.businessDate
        if (today && job?.done && job.kind !== 'periodic') return
        const pending = today && job && !job.done
        if (!pending) {
          if (!closing && (this.periodicReadyAt === 0 || this.clock.now() < this.periodicReadyAt || wire.personal.remainingIncense < VOTE_COUNT_MAX)) {
            this.periodicReadyAt = 0
            return
          }
          const count = Math.min(VOTE_COUNT_MAX, wire.personal.remainingIncense)
          if (count < 1) { this.retryAt = this.clock.now() + RETRY_MS; return }
          job = { businessDate: wire.businessDate, caseId: wire.activeCase.id,
            requestId: randomUUID(), voteType: this.state.voteType, count, done: false, kind: closing ? 'closing' : 'periodic' }
          const prepared = job
          // Persist the exact intent BEFORE sending. Restart/uncertain retry
          // reuses its ID, direction, case and count, even if preferences change.
          await this.save(s => ({ ...s, jobs: { ...s.jobs, [mode]: prepared } }))
        }
        if (job === undefined || job.done || !this.canPrepareVote(context)) return
        // A legacy closing receipt is never replayed during the daytime.
        if (job.kind !== 'periodic' && !closing) return
        const outcome = await authority.vote({ caseId: job.caseId, voteType: job.voteType, requestId: job.requestId, count: job.count })
        if (outcome.result.status === 'accepted' || outcome.result.status === 'rejected') {
          const completed: DayEndJob = { ...job, done: true }
          const accepted = outcome.result.status === 'accepted'
            ? outcome.result.acceptedIncense ?? outcome.result.spentIncense ?? 1 : 0
          if (!Number.isSafeInteger(accepted) || accepted < 0 || accepted > job.count) throw new Error('invalid accepted incense count')
          await this.save(s => {
            if (s.jobs[mode]?.requestId !== completed.requestId || s.jobs[mode]?.done) return s
            const previous = s.incense?.[mode]
            const ledger = previous === undefined ? { ...EMPTY_LOCAL_INCENSE }
              : previous.businessDate === completed.businessDate ? previous : rollLocalIncenseDay(previous)
            return { ...s, jobs: { ...s.jobs, [mode]: completed },
              incense: { ...s.incense, [mode]: { ...recordLocalIncenseVote(ledger, completed.voteType, accepted), businessDate: completed.businessDate } } }
          })
          if (job.kind === 'periodic') this.periodicReadyAt = this.clock.now() + AUTO_DUMP_PERIOD_MS
        }
      })
    } catch {
      // No private request/identity/transport details in diagnostics.
      this.warn('[dsh-liangxiang] timed incense paused; the same intent may retry before day close')
      this.retryAt = this.clock.now() + RETRY_MS
    } finally {
      this.running = false
      this.schedule()
    }
  }

  private stopDayEnd(): void {
    this.stopped = true
    this.unsubscribe?.()
    this.unsubscribe = null
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
  }

  override dispose(): void { this.stopDayEnd(); super.dispose() }
}
