import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createPersonalIncenseCaptionController,
  PersonalIncenseCaption,
  PERSONAL_INCENSE_CAPTION_CSS,
  type PersonalIncenseCaptionInput,
  type PersonalIncenseCaptionState,
} from '../src/client/PersonalIncenseCaption.tsx'
import { formatMainIncense } from '../src/client/main-panel-presentation.ts'
import { findByAttr, renderDeep, styleOf, textContent } from './helpers/render.ts'

function setup(input: Partial<PersonalIncenseCaptionInput> = {}) {
  vi.useFakeTimers()
  let current: PersonalIncenseCaptionState = { view: 'daily', gain: 0, sequence: 0 }
  const updates: PersonalIncenseCaptionState[] = []
  const controller = createPersonalIncenseCaptionController(caption => { current = caption; updates.push(caption) })
  let props: PersonalIncenseCaptionInput = { scopeKey: 'online:2026-11-08:one', condensedIncense: 0, ...input }
  controller.observe(props)
  return {
    current: () => current,
    updates,
    observe: (next: Partial<PersonalIncenseCaptionInput>) => { props = { ...props, ...next }; controller.observe(props) },
    dispose: controller.dispose,
  }
}

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

describe('confirmed personal caption lifecycle', () => {
  it('shows available incense after confirmed spending, without inferring an earning receipt', () => {
    const run = setup({ usedIncenseToday: 40 })
    run.observe({ usedIncenseToday: 41 })
    expect(run.current()).toMatchObject({ view: 'balance', gain: 0 })
    const sequence = run.current().sequence
    run.observe({ usedIncenseToday: 41 })
    expect(run.current().sequence).toBe(sequence)
    vi.advanceTimersByTime(2_600)
    expect(run.current().view).toBe('daily')
  })

  it('keeps balance readable during repeated accepted votes and expires after the last one', () => {
    const run = setup({ usedIncenseToday: 0 })
    run.observe({ usedIncenseToday: 1 })
    const sequence = run.current().sequence
    vi.advanceTimersByTime(2_000)
    run.observe({ usedIncenseToday: 501 })
    expect(run.current()).toMatchObject({ view: 'balance', sequence })
    vi.advanceTimersByTime(2_599)
    expect(run.current().view).toBe('balance')
    vi.advanceTimersByTime(1)
    expect(run.current().view).toBe('daily')
  })

  it('prioritizes confirmed spending while preserving an actual earning receipt for later', () => {
    const run = setup({ usedIncenseToday: 0, settlementSequence: 0 })
    run.observe({ condensedIncense: 2, settlementSequence: 1 })
    run.observe({ usedIncenseToday: 1 })
    expect(run.current()).toMatchObject({ view: 'balance', gain: 0 })
    vi.advanceTimersByTime(2_600 + 2_000)
    expect(run.current()).toMatchObject({ view: 'gain', gain: 2 })
  })

  it('does not announce pending, rejected, invalid or inherited spending on a new scope', () => {
    const run = setup({ usedIncenseToday: 10 })
    for (const usedIncenseToday of [10, 9, -1, NaN, 1.5]) run.observe({ usedIncenseToday })
    expect(run.current().view).toBe('daily')
    run.observe({ scopeKey: 'online:new-date:case', usedIncenseToday: 100 })
    expect(run.current().view).toBe('daily')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('fences an already-present receipt on mount and never schedules activity text', () => {
    const run = setup({ condensedIncense: 12, settlementSequence: 5 })
    run.observe({ condensedIncense: 12, settlementSequence: 5 })
    expect(run.current().view).toBe('daily')
    expect(run.updates).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('shows the exact receipt, then current balance, then returns to the daily total', () => {
    const run = setup()
    run.observe({ condensedIncense: 6 })
    expect(run.current()).toMatchObject({ view: 'gain', gain: 6 })
    vi.advanceTimersByTime(1_499)
    expect(run.current().view).toBe('gain')
    vi.advanceTimersByTime(1)
    expect(run.current().view).toBe('balance')
    vi.advanceTimersByTime(2_600)
    expect(run.current().view).toBe('daily')
    vi.advanceTimersByTime(2_000)
    expect(run.current().view).toBe('daily')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('merges confirmed receipts without restarting the gain animation or its deadline', () => {
    const run = setup()
    run.observe({ condensedIncense: 1 })
    const sequence = run.current().sequence
    vi.advanceTimersByTime(500)
    run.observe({ condensedIncense: 3 })
    expect(run.current()).toMatchObject({ view: 'gain', gain: 4, sequence })
    vi.advanceTimersByTime(1_000)
    expect(run.current().view).toBe('balance')
  })

  it('ignores repeated frames and accepts equal-size receipts only with a new settlement identity', () => {
    const run = setup({ settlementSequence: 0 })
    run.observe({ condensedIncense: 1, settlementSequence: 1 })
    run.observe({ condensedIncense: 1, settlementSequence: 1 })
    expect(run.current().gain).toBe(1)
    run.observe({ condensedIncense: 1, settlementSequence: 2 })
    expect(run.current().gain).toBe(2)
    expect(run.updates).toHaveLength(2)
  })

  it('reserves at least two daily seconds while dense confirmed receipts wait for the next cycle', () => {
    const run = setup({ settlementSequence: 0 })
    run.observe({ condensedIncense: 1, settlementSequence: 1 })
    vi.advanceTimersByTime(1_500)
    run.observe({ condensedIncense: 3, settlementSequence: 2 })
    vi.advanceTimersByTime(2_600)
    expect(run.current().view).toBe('daily')
    run.observe({ condensedIncense: 2, settlementSequence: 3 })
    vi.advanceTimersByTime(1_999)
    expect(run.current().view).toBe('daily')
    vi.advanceTimersByTime(1)
    expect(run.current()).toMatchObject({ view: 'gain', gain: 5 })
  })

  it('treats a new mode/date/installation scope as a baseline and cancels queued receipts', () => {
    const run = setup({ settlementSequence: 0 })
    run.observe({ condensedIncense: 5, settlementSequence: 1 })
    vi.advanceTimersByTime(1_500)
    run.observe({ condensedIncense: 2, settlementSequence: 2 })
    run.observe({ scopeKey: 'offline:2026-11-09:two', condensedIncense: 9, settlementSequence: 3 })
    expect(run.current().view).toBe('daily')
    vi.advanceTimersByTime(20_000)
    expect(run.current().view).toBe('daily')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('lets explicit inspection show balance, while a confirmed receipt keeps its priority', () => {
    const run = setup({ peekSequence: 0 })
    run.observe({ peekSequence: 1 })
    expect(run.current().view).toBe('balance')
    vi.advanceTimersByTime(4_600)
    run.observe({ condensedIncense: 4 })
    expect(run.current().view).toBe('gain')
    run.observe({ peekSequence: 2 })
    expect(run.current()).toMatchObject({ view: 'gain', gain: 4 })
  })

  it('ignores zero/invalid receipts and disposes every pending timer', () => {
    const run = setup()
    for (const condensedIncense of [0, -1, Number.NaN, 1.5]) run.observe({ condensedIncense })
    expect(run.current().view).toBe('daily')
    run.observe({ condensedIncense: 4 })
    expect(vi.getTimerCount()).toBe(1)
    run.dispose()
    vi.advanceTimersByTime(20_000)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('pure caption view and compact incense', () => {
  it('truncates to at most four significant digits and two decimals across unit boundaries', () => {
    const cases: [number, string][] = [
      [0, '0'], [999, '999'], [1_000, '1K'], [1_499, '1.49K'], [9_999, '9.99K'],
      [10_000, '1万'], [10_001, '1万'], [12_345, '1.23万'], [99_999, '9.99万'],
      [999_999, '99.99万'], [9_999_999, '999.9万'], [99_999_999, '9999万'],
      [100_000_000, '1亿'], [Number.MAX_SAFE_INTEGER, '9007万亿'],
    ]
    for (const [input, output] of cases) expect(formatMainIncense(input)).toBe(output)
    expect(formatMainIncense(-12_345)).toBe('-1.23万')
    expect(formatMainIncense(10_001n)).toBe('1万')
    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, 1.5, Number.MAX_SAFE_INTEGER + 1]) expect(formatMainIncense(invalid)).toBe('--')
  })

  it('keeps exact accessible values, one stable slot, and no persistent activity caption', () => {
    const tree = renderDeep(<PersonalIncenseCaption earnedIncenseToday={12_345} remainingIncense={9_999_999} reducedMotion={false} />)
    const slot = findByAttr(tree, 'data-liangxiang-personal-caption')[0]
    expect(slot?.props['aria-label']).toBe('今日凝香12,345炷')
    expect(textContent(findByAttr(tree, 'data-caption-copy'))).toBe('今日凝香1.23万炷')
    expect(findByAttr(tree, 'data-liangxiang-compact', 'incense')).toHaveLength(1)
    expect(textContent(tree)).not.toContain('凝香中')
    expect(PERSONAL_INCENSE_CAPTION_CSS).toContain('width:52px')
  })

  it('renders each phase from actual supplied values and honors static motion', () => {
    for (const caption of [
      { view: 'gain', gain: 6, sequence: 1 },
      { view: 'balance', gain: 0, sequence: 2 },
    ] as const) {
      const tree = renderDeep(<PersonalIncenseCaption earnedIncenseToday={12_345} remainingIncense={9_999_999} reducedMotion caption={caption} />)
      const slot = findByAttr(tree, 'data-liangxiang-personal-caption')[0]
      expect(slot?.props['data-reduced-motion']).toBe(true)
      expect(slot?.props['aria-label']).toBe(caption.view === 'gain' ? '凝香到账6炷' : '个人余香9,999,999炷')
      expect(textContent(findByAttr(tree, 'data-caption-copy'))).toBe(caption.view === 'gain' ? '凝香到账+6炷' : '个人余香999.9万炷')
      expect(styleOf(findByAttr(tree, 'data-caption-amount')[0]).fontSize).toBe(caption.view === 'gain' ? '17px' : '11px')
    }
    expect(PERSONAL_INCENSE_CAPTION_CSS).toContain('@media(prefers-reduced-motion:reduce)')
  })
})
