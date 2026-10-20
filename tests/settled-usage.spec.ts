import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachUsageObservation } from '../src/compat/dsh/usage-observer.ts'
import { RequestUsageSettler, isSettledUsageBatch, type DshUsageEvent, type SettledUsageBatch } from '../src/compat/dsh/settled-usage.ts'
import type { DshSessionEventSource, DshSessionProjections, DshSessionRef } from '../src/compat/dsh/host-services.ts'
import { UsageProjection } from '../src/host/usage-projection.ts'
import { createBusinessDateProvider } from '../src/shared/business-date.ts'
import { DEFAULT_INCENSE_WEIGHT_POLICY, incenseWeightRows } from '../src/domain/index.ts'
import { nativeUsageSession, nativeUsageFold, sample, finalMessage, usageStream } from './helpers/dsh-usage.ts'
import { mergeUsageWatermark, type SessionUsageWatermark, type DailyUsageRecord } from '../src/host/usage-ledger.ts'

const now = Date.UTC(2026, 9, 12, 4)
const date = '2026-10-12'
const clock = { now: () => now }
const sink = { putWatermark: () => undefined, putDailyUsage: () => undefined, deleteDailyUsage: () => undefined }
const projection = () => new UsageProjection({ clock, dates: createBusinessDateProvider('Asia/Shanghai'), warn: () => undefined })
const projections: DshSessionProjections = { snapshot: () => ({ asOfSeq: -1, values: {} }), onChanged: () => () => undefined }
beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(now) })
afterEach(() => { vi.restoreAllMocks() })

function feed(initial: readonly DshSessionRef[] = [], usage = projection()) {
  let listener: ((session: DshSessionRef, event: DshUsageEvent) => void) | null = null
  const source: DshSessionEventSource = { on: (_name, callback) => {
    listener = callback
    return () => { listener = null }
  } }
  const batches: SettledUsageBatch[] = []
  const dispose = attachUsageObservation(projections, { list: () => [...initial] }, (id, batch, origin) => {
    expect(isSettledUsageBatch(batch)).toBe(true)
    batches.push(batch as SettledUsageBatch)
    usage.observe(id, batch, origin)
  }, source)
  return { usage, batches, dispose, append(session: ReturnType<typeof nativeUsageSession>, type: string, data: unknown) {
    const event = type === 'assistant/message' ? session.append(type, data, { surfaceOp: 'append' }) : session.append(type, data)
    listener?.(session, event)
    return event
  } }
}

describe('real pinned DSH request settlement', () => {
  it('does not mint a high embedded sample; final lower usage and all cache buckets match the real tokenUsage fold', () => {
    const session = nativeUsageSession()
    const f = feed([session])
    f.append(session, 'step/start', { turn: 1, step: 1 })
    f.append(session, 'request/context', { provider: 'deepseek-official', model: 'deepseek-flash' })
    expect(f.usage.effectiveTokensFor(date)).toBe(0)
    f.append(session, 'assistant/message', {
      ...finalMessage(sample(10_000, 15_000, 20_000, 5_000)),
      stream: usageStream(sample(100_000, 20_000)),
    })
    expect(f.usage.effectiveTokensFor(date)).toBe(25_000) // final 50K Flash ×0.5; tools need not finish first
    f.append(session, 'step/end', { turn: 1, step: 1 })
    expect(nativeUsageFold(session.snapshotEvents())).toEqual({ uncachedInputTokens: 10_000, outputTokens: 15_000, cacheReadTokens: 20_000, cacheWriteTokens: 5_000 })
    expect(f.usage.effectiveTokensFor(date)).toBe(25_000)
    f.dispose()
  })

  it('keeps each billed retry once and does not invent a cancelled scheduled retry', () => {
    const session = nativeUsageSession()
    const f = feed([session])
    f.append(session, 'step/start', { turn: 1, step: 1 })
    f.append(session, 'request/context', { provider: 'deepseek-official', model: 'deepseek-flash' })
    f.append(session, 'assistant/attempt', { turn: 1, step: 1, stream: usageStream(sample(50_000)) })
    expect(f.usage.effectiveTokensFor(date)).toBe(25_000)
    f.append(session, 'llm/retry', { turn: 1, step: 1 })
    expect(f.usage.effectiveTokensFor(date)).toBe(25_000)
    f.append(session, 'llm/retry-started', { turn: 1, step: 1, retry: 1 })
    f.append(session, 'assistant/message', {
      ...finalMessage(sample(40_000)),
      stream: usageStream(sample(100_000)),
    })
    f.append(session, 'step/end', { turn: 1, step: 1 })
    expect(nativeUsageFold(session.snapshotEvents()).uncachedInputTokens).toBe(90_000)
    expect(f.usage.effectiveTokensFor(date)).toBe(45_000)
    const once = f.batches.at(-1)
    f.usage.observe(session.id, once, { kind: 'live', firstLiveSeq: 0 })
    expect(f.usage.effectiveTokensFor(date)).toBe(45_000)
    f.dispose()
  })

  it('attributes mixed requests to their own source even if the latest route changes', () => {
    const session = nativeUsageSession()
    const f = feed([session])
    f.append(session, 'step/start', { turn: 1, step: 1 })
    f.append(session, 'request/context', { provider: 'third-party', model: 'deepseek-v4-flash' })
    f.append(session, 'assistant/message', finalMessage(sample(100_000), 'deepseek-v4-flash', 'third-party'))
    f.append(session, 'request/context', { provider: 'deepseek-official', model: 'deepseek-v4-pro' })
    f.append(session, 'step/end', { turn: 1, step: 1 })
    f.append(session, 'step/start', { turn: 1, step: 2 })
    f.append(session, 'assistant/message', finalMessage(sample(50_000), 'deepseek-v4-pro', 'deepseek-official', 2))
    f.append(session, 'step/end', { turn: 1, step: 2 })
    expect(f.usage.effectiveTokensFor(date)).toBe(100_000)
    f.dispose()
  })

  it('settles V4.1 Flash aliases, Pro routes and unknown routes per attempt and never replays their credit', () => {
    const session = nativeUsageSession('v41-rates')
    const f = feed([session])
    const models = ['deepseek-flash', 'DeepSeek-V4.1-Flash-1017', 'DEEPSEEK-V4.1-PRO[1M]', 'unlisted-route']
    for (const [index, model] of models.entries()) {
      const step = index + 1
      f.append(session, 'step/start', { turn: 1, step })
      // Final source identity wins over a session route changed by a model picker.
      f.append(session, 'request/context', { provider: 'deepseek-official', model: 'deepseek-v4-pro' })
      f.append(session, 'assistant/message', finalMessage(sample(40_000, 10_000, 30_000, 20_000), model, 'deepseek-official', step))
      f.append(session, 'step/end', { turn: 1, step })
    }
    expect(nativeUsageFold(session.snapshotEvents())).toEqual({
      uncachedInputTokens: 160_000, outputTokens: 40_000, cacheReadTokens: 120_000, cacheWriteTokens: 80_000,
    })
    expect(f.usage.effectiveTokensFor(date)).toBe(250_000)
    for (const batch of f.batches) f.usage.observe(session.id, batch, { kind: 'catchup' })
    expect(f.usage.effectiveTokensFor(date)).toBe(250_000)
    f.dispose()
  })

  it('baselines legacy history and an in-flight attempt, then credits only new work', () => {
    const session = nativeUsageSession()
    session.append('step/start', { turn: 1, step: 1 })
    const f = feed([session])
    f.append(session, 'assistant/message', finalMessage(sample(80_000)))
    f.append(session, 'step/end', { turn: 1, step: 1 })
    expect(f.usage.effectiveTokensFor(date)).toBe(0)
    f.append(session, 'step/start', { turn: 1, step: 2 })
    f.append(session, 'assistant/message', finalMessage(sample(50_000), 'deepseek-flash', 'deepseek-official', 2))
    f.append(session, 'step/end', { turn: 1, step: 2 })
    expect(f.usage.effectiveTokensFor(date)).toBe(25_000)
    f.dispose()
  })

  it('resumes from the persisted settlement cursor without repricing or replaying credit', () => {
    const session = nativeUsageSession()
    const usage = projection()
    const watermarks = new Map()
    const daily = new Map()
    usage.hydrate(watermarks, daily, { ...sink, putWatermark: (id, row) => watermarks.set(id, row), putDailyUsage: (day, row) => daily.set(day, row) })
    const f = feed([session], usage)
    f.append(session, 'step/start', { turn: 1, step: 1 })
    f.append(session, 'assistant/message', finalMessage(sample(50_000)))
    f.append(session, 'step/end', { turn: 1, step: 1 })
    f.dispose()
    const restored = projection()
    restored.hydrate(watermarks, daily, sink)
    const resumed = feed([session], restored)
    expect(restored.effectiveTokensFor(date)).toBe(25_000)
    resumed.append(session, 'step/start', { turn: 1, step: 2 })
    resumed.append(session, 'assistant/message', finalMessage(sample(50_000), 'deepseek-flash', 'deepseek-official', 2))
    resumed.append(session, 'step/end', { turn: 1, step: 2 })
    expect(restored.effectiveTokensFor(date)).toBe(50_000)
    resumed.dispose()
  })

  it('does not count an unmatched final sample without a request lifecycle', () => {
    const fold = new RequestUsageSettler()
    expect(fold.consume({ seq: 0, time: now, type: 'assistant/message', data: finalMessage(sample(50_000)) })).toBeNull()
    expect(fold.consume({ seq: 1, time: now, type: 'step/end', data: { turn: 1, step: 1 } })).toBeNull()
  })

  it('does not mint an inherited fork prefix, but credits its own new request', () => {
    const parent = nativeUsageSession('parent')
    parent.append('step/start', { turn: 1, step: 1 })
    parent.append('assistant/message', finalMessage(sample(50_000)), { surfaceOp: 'append' })
    parent.append('step/end', { turn: 1, step: 1 })
    const fork = nativeUsageSession('fork', parent.snapshotEvents())
    const f = feed()
    f.append(fork, 'step/start', { turn: 1, step: 2 })
    f.append(fork, 'assistant/message', finalMessage(sample(50_000), 'deepseek-flash', 'deepseek-official', 2))
    expect(f.usage.effectiveTokensFor(date)).toBe(25_000)
    f.dispose()
  })

  it('does not mint a scheduled retry that never starts, and keeps final usage when cancelled', () => {
    const session = nativeUsageSession()
    const f = feed([session])
    f.append(session, 'step/start', { turn: 1, step: 1 })
    f.append(session, 'request/context', { provider: 'deepseek-official', model: 'deepseek-flash' })
    f.append(session, 'assistant/attempt', { turn: 1, step: 1, stream: usageStream(sample(50_000)) })
    f.append(session, 'llm/retry', { turn: 1, step: 1 })
    f.append(session, 'step/end', { turn: 1, step: 1 })
    expect(f.usage.effectiveTokensFor(date)).toBe(25_000)
    f.dispose()
  })

  it('keeps the last provider sample when the final message has no new usage', () => {
    const session = nativeUsageSession()
    const f = feed([session])
    f.append(session, 'step/start', { turn: 1, step: 1 })
    f.append(session, 'assistant/message', { ...finalMessage(undefined), stream: usageStream(sample(50_000)) })
    expect(f.usage.effectiveTokensFor(date)).toBe(25_000)
    expect(nativeUsageFold(session.snapshotEvents()).uncachedInputTokens).toBe(50_000)
    f.dispose()
  })

  it('uses the last embedded provider sample on current DSH, with final usage taking precedence', () => {
    const session = nativeUsageSession()
    const f = feed([session])
    f.append(session, 'step/start', { turn: 1, step: 1 })
    f.append(session, 'assistant/message', {
      ...finalMessage(undefined, 'deepseek-v4.1-flash-1017'),
      stream: usageStream(sample(200_000), sample(100_000)),
    })
    expect(f.usage.effectiveTokensFor(date)).toBe(50_000)
    f.append(session, 'step/start', { turn: 1, step: 2 })
    f.append(session, 'assistant/message', {
      ...finalMessage(sample(50_000), 'deepseek-v4-pro', 'deepseek-official', 2),
      stream: usageStream(sample(200_000)),
    })
    expect(f.usage.effectiveTokensFor(date)).toBe(100_000)
    expect(nativeUsageFold(session.snapshotEvents()).uncachedInputTokens).toBe(150_000)
    f.dispose()
  })

  it('settles an embedded failed attempt once without requiring legacy chunk events', () => {
    const session = nativeUsageSession()
    const f = feed([session])
    f.append(session, 'step/start', { turn: 1, step: 1 })
    f.append(session, 'request/context', { provider: 'deepseek-official', model: 'deepseek-flash' })
    f.append(session, 'assistant/attempt', { turn: 1, step: 1, stream: usageStream(sample(80_000), sample(40_000)) })
    f.append(session, 'llm/retry', { turn: 1, step: 1 })
    f.append(session, 'step/end', { turn: 1, step: 1 })
    expect(f.usage.effectiveTokensFor(date)).toBe(20_000)
    expect(nativeUsageFold(session.snapshotEvents()).uncachedInputTokens).toBe(40_000)
    f.dispose()
  })

  it.each([undefined, 1])('preserves earned usage through format %s migration and restart with the real observer', (sessionFormat) => {
    const session = nativeUsageSession()
    session.append('step/start', { turn: 1, step: 1 })
    session.append('assistant/message', finalMessage(sample(100_000)), { surfaceOp: 'append' })
    session.append('step/end', { turn: 1, step: 1 })
    const watermarks = new Map<string, SessionUsageWatermark>([[session.id, {
      inputHwm: 100_000, outputHwm: 0, settledOffset: 100, baselineOffset: 0,
      ...(sessionFormat === undefined ? {} : { sessionFormat }),
    }]])
    const daily = new Map<string, DailyUsageRecord>([[date, { inputTokens: 50_000, outputTokens: 0, weightCarry: 0, observedAt: now }]])
    const persisted = { ...sink,
      putWatermark: (id: string, row: SessionUsageWatermark) => watermarks.set(id, row),
      putDailyUsage: (day: string, row: DailyUsageRecord) => daily.set(day, row),
    }
    const usage = projection()
    usage.hydrate(watermarks, daily, persisted)
    const f = feed([session], usage)
    expect(usage.effectiveTokensFor(date)).toBe(50_000)
    expect(watermarks.get(session.id)).toMatchObject({
      settledOffset: session.snapshotEvents().length,
      baselineOffset: session.snapshotEvents().length,
      sessionFormat: session.header?.version,
    })
    f.append(session, 'step/start', { turn: 1, step: 2 })
    f.append(session, 'assistant/message', {
      ...finalMessage(undefined, undefined, undefined, 2), stream: usageStream(sample(50_000)),
    })
    expect(usage.effectiveTokensFor(date)).toBe(75_000)
    f.dispose()
    const restored = projection()
    restored.hydrate(watermarks, daily, persisted)
    const resumed = feed([session], restored)
    expect(restored.effectiveTokensFor(date)).toBe(75_000)
    resumed.append(session, 'step/end', { turn: 1, step: 2 })
    resumed.append(session, 'step/start', { turn: 1, step: 3 })
    resumed.append(session, 'assistant/message', finalMessage(sample(50_000), undefined, undefined, 3))
    expect(restored.effectiveTokensFor(date)).toBe(100_000)
    resumed.dispose()
  })
})

describe('legacy DSH chunk compatibility', () => {
  it('replaces provisional samples and credits each legacy retry only once', () => {
    const fold = new RequestUsageSettler()
    const events = [
      { type: 'step/start', data: { turn: 1, step: 1 } },
      { type: 'request/context', data: { provider: 'deepseek-official', model: 'deepseek-pro' } },
      { type: 'assistant/chunk', data: { turn: 1, step: 1, chunk: { type: 'usage', usage: sample(50_000) } } },
      { type: 'llm/retry', data: { turn: 1, step: 1 } },
      { type: 'llm/retry-started', data: { turn: 1, step: 1, retry: 1 } },
      { type: 'assistant/chunk', data: { turn: 1, step: 1, chunk: { type: 'usage', usage: sample(100_000) } } },
      { type: 'assistant/message', data: finalMessage(sample(40_000), 'deepseek-pro') },
      { type: 'step/end', data: { turn: 1, step: 1 } },
    ].map((event, seq) => ({ ...event, seq, time: now }))
    const requests = events.flatMap(event => {
      const settled = fold.consume(event)
      return settled === null ? [] : [settled]
    })
    expect(requests.map(request => request.inputTokens)).toEqual([50_000, 40_000])
    expect(requests.every(request => request.model === 'deepseek-pro')).toBe(true)
    for (const event of events) expect(fold.consume(event)).toBeNull()
  })
})

describe('static rules and durable daily accounting', () => {
  const batch = (startOffset: number, endOffset: number): SettledUsageBatch => ({ kind: 'settled-requests', throughOffset: endOffset, requests: [{ startOffset, endOffset, endedAt: now, provider: 'deepseek-official', model: 'deepseek-v4.2-flash', inputTokens: 50_000, outputTokens: 0 }] })

  it('baselines renumbered Session migrations without replaying credit or retaining the old cursor', () => {
    const usage = projection()
    usage.hydrate(new Map([['s', { inputHwm: 50_000, outputHwm: 0, settledOffset: 100, baselineOffset: 0 }]]), new Map(), sink)
    usage.observe('s', { ...batch(1, 4), sessionFormat: 4 }, { kind: 'catchup' })
    expect(usage.effectiveTokensFor(date)).toBe(0)
    usage.observe('s', { ...batch(5, 8), sessionFormat: 4 }, { kind: 'live', firstLiveSeq: 4 })
    expect(usage.effectiveTokensFor(date)).toBe(25_000)
    const merged = mergeUsageWatermark(
      { inputHwm: 100_000, outputHwm: 0, settledOffset: 8, baselineOffset: 4, sessionFormat: 4 },
      { inputHwm: 50_000, outputHwm: 0, settledOffset: 100, baselineOffset: 0 },
    )
    expect(merged).toMatchObject({ settledOffset: 8, baselineOffset: 4, sessionFormat: 4 })
  })

  it('uses the same static rules for current and future Flash versions and their tooltip', () => {
    const usage = projection()
    usage.observe('s', batch(1, 4), { kind: 'live', firstLiveSeq: 0 })
    expect(usage.effectiveTokensFor(date)).toBe(25_000)
    usage.observe('s', batch(5, 8), { kind: 'live', firstLiveSeq: 0 })
    expect(usage.effectiveTokensFor(date)).toBe(50_000)
    expect(usage.weightPolicyFor()).toEqual(DEFAULT_INCENSE_WEIGHT_POLICY)
    expect(incenseWeightRows(usage.weightPolicyFor(), 50_000)).toContainEqual({ model: 'Flash', weight: '×0.5', stick: '10W Token/炷' })
  })

  it('ignores restored rule metadata while preserving earned totals and settlement cursors', () => {
    const usage = projection()
    const oldPolicy = { ...DEFAULT_INCENSE_WEIGHT_POLICY, revision: 99, version: 'cached-policy', rules: [{ label: 'Flash', model: 'deepseek-*-flash', weightBps: 10_000 }] }
    usage.hydrate(new Map([['s', { inputHwm: 0, outputHwm: 0, settledOffset: 0, baselineOffset: 0 }]]), new Map([[date, {
      inputTokens: 50_000, outputTokens: 0, weightCarry: 0, observedAt: now, weightPolicy: oldPolicy,
    }]]), sink)
    expect(usage.weightPolicyFor()).toEqual(DEFAULT_INCENSE_WEIGHT_POLICY)
    usage.observe('s', batch(1, 4), { kind: 'live', firstLiveSeq: 0 })
    expect(usage.effectiveTokensFor(date)).toBe(75_000)
    expect(usage.recordFor(date).weightPolicy).toEqual(DEFAULT_INCENSE_WEIGHT_POLICY)
    usage.observe('s', batch(1, 4), { kind: 'catchup' })
    expect(usage.effectiveTokensFor(date)).toBe(75_000)
  })

  it('does not credit the same attempt on both sides of a mode switch', () => {
    const watermarks = new Map()
    const online = projection()
    online.hydrate(watermarks, new Map(), { ...sink, putWatermark: (id, row) => watermarks.set(id, row) })
    online.observe('shared', batch(1, 4), { kind: 'live', firstLiveSeq: 0 })
    const offline = projection()
    offline.hydrate(watermarks, new Map(), sink)
    offline.observe('shared', batch(1, 4), { kind: 'catchup' })
    expect(offline.effectiveTokensFor(date)).toBe(0)
    offline.observe('shared', batch(5, 8), { kind: 'live', firstLiveSeq: 0 })
    expect(offline.effectiveTokensFor(date)).toBe(25_000)
    expect(online.effectiveTokensFor(date)).toBe(25_000)
  })

  it('does not put missed yesterday usage into today during restart catch-up', () => {
    const usage = projection()
    usage.hydrate(new Map([['s', { inputHwm: 0, outputHwm: 0, settledOffset: 0, baselineOffset: 0 }]]), new Map(), sink)
    const missed = batch(1, 4)
    missed.requests = missed.requests.map(request => ({ ...request, endedAt: now - 86_400_000 }))
    usage.observe('s', missed, { kind: 'catchup' })
    expect(usage.effectiveTokensFor(date)).toBe(0)
    usage.observe('s', missed, { kind: 'live', firstLiveSeq: 0 })
    expect(usage.effectiveTokensFor(date)).toBe(0)
  })

  it('uses the backend business timezone for replay dates even when the Host started in another timezone', () => {
    const usage = projection()
    usage.setBusinessDates(createBusinessDateProvider('UTC'))
    usage.hydrate(new Map([['s', { inputHwm: 0, outputHwm: 0, settledOffset: 0, baselineOffset: 0 }]]), new Map(), sink)
    const request = batch(1, 4)
    request.requests = request.requests.map(row => ({ ...row, endedAt: Date.UTC(2026, 9, 12, 17) }))
    usage.setBusinessDates(createBusinessDateProvider('Asia/Shanghai'))
    usage.observe('s', request, { kind: 'catchup' }, undefined, '2026-10-13')
    expect(usage.effectiveTokensFor('2026-10-13')).toBe(25_000)
  })

  it('keeps the static policy after a restart', () => {
    const usage = projection()
    usage.observe('s', batch(1, 4), { kind: 'live', firstLiveSeq: 0 })
    const restored = projection()
    restored.hydrate(new Map(), new Map([[date, usage.recordFor(date)]]), sink)
    expect(restored.weightPolicyFor()).toEqual(DEFAULT_INCENSE_WEIGHT_POLICY)
    expect(restored.effectiveTokensFor(date)).toBe(25_000)
  })
})
