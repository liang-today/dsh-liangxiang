import { afterEach, describe, expect, it, vi } from 'vitest'
import { attachMainPanelPond } from '../src/client/MainPanelPond.tsx'

/** Minimal drawing surface: lifecycle assertions do not need a real Host or ledger. */
function scene() {
  const visibilityListeners = new Set<() => void>(), mediaListeners = new Set<() => void>()
  const doc = { hidden: false, addEventListener: (_: string, fn: () => void) => visibilityListeners.add(fn), removeEventListener: (_: string, fn: () => void) => visibilityListeners.delete(fn) }
  const media = { matches: false, addEventListener: (_: string, fn: () => void) => mediaListeners.add(fn), removeEventListener: (_: string, fn: () => void) => mediaListeners.delete(fn) }
  let visibility: ((entries: Array<{ isIntersecting: boolean, intersectionRatio: number }>) => void) | undefined
  const disconnect = vi.fn()
  class Observer {
    constructor(callback: typeof visibility) { visibility = callback }
    observe(): void {}
    disconnect = disconnect
  }
  const cancelled: ReturnType<typeof vi.fn>[] = []
  const animated: Array<{ frames: Keyframe[], options: KeyframeAnimationOptions }> = []
  const animate = (frames: Keyframe[], options: KeyframeAnimationOptions): Animation => {
    const cancel = vi.fn();cancelled.push(cancel);animated.push({ frames, options })
    return { cancel, finished: new Promise(() => undefined) } as unknown as Animation
  }
  const orb = { animate }
  const makeBubble = (side: string) => ({ dataset: { side } as Record<string, string>, hidden: true, style: {} as Record<string, string>, animate, querySelector: () => orb })
  const bubbles = [makeBubble('left'), makeBubble('right')]
  const body = { dataset: {} as Record<string, string>, offsetWidth: 36 }
  const root = {
    dataset: {} as Record<string, string>, isConnected: true,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    querySelector: (selector: string) => {
      if (selector.includes('fish-body')) return body
      if (selector === '.liangxiang-main-pond-fish') return { offsetWidth: 36 }
      if (selector.includes('head')) return { getBoundingClientRect: () => ({ left: 55, top: 40 }) }
      return {
        getScreenCTM: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
        getTotalLength: () => 260,
        getPointAtLength: (distance: number) => ({ x: distance, y: 10 }),
      }
    },
    querySelectorAll: () => bubbles,
  }
  vi.stubGlobal('document', doc);vi.stubGlobal('window', { matchMedia: () => media });vi.stubGlobal('IntersectionObserver', Observer)
  vi.spyOn(Math, 'random').mockReturnValue(0)
  return {
    root: root as unknown as HTMLDivElement, body, bubbles, cancelled, animated, disconnect, visibilityListeners, mediaListeners,
    setHidden(hidden: boolean) { doc.hidden = hidden;visibilityListeners.forEach(fn => fn()) },
    setReduced(reduced: boolean) { media.matches = reduced;mediaListeners.forEach(fn => fn()) },
    setInView(inView: boolean) { visibility?.([{ isIntersecting: inView, intersectionRatio: inView ? 1 : 0 }]) },
  }
}

afterEach(() => { vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers() })

describe('main panel pond disposal', () => {
  it('uses both identical puff/rise actions and cancels timers, animations and listeners on unmount', () => {
    vi.useFakeTimers()
    const s = scene(), stop = attachMainPanelPond(s.root, { remainingIncense: 1_000, reducedMotion: false })
    expect(s.root.dataset.available).toBe('true')
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(6_000 + 1_220)
    expect(s.root.dataset.fish).toBe('true')
    expect(s.body.dataset.puff).toBe('true')
    expect(s.bubbles[0]?.hidden).toBe(true)
    vi.advanceTimersByTime(179)
    expect(s.bubbles[0]?.hidden).toBe(true)
    vi.advanceTimersByTime(1)
    expect(s.bubbles[0]?.hidden).toBe(false)
    expect(s.bubbles[0]?.dataset.stage).toBe('rise')
    vi.advanceTimersByTime(2_720)
    expect(s.body.dataset.puff).toBe('true')
    expect(s.bubbles[1]?.hidden).toBe(true)
    vi.advanceTimersByTime(179)
    expect(s.bubbles[1]?.hidden).toBe(true)
    vi.advanceTimersByTime(1)
    expect(s.bubbles[1]?.hidden).toBe(false)
    expect(s.bubbles[1]?.dataset.stage).toBe('rise')
    expect(s.animated).toHaveLength(4)
    expect(s.animated[0]).toEqual(s.animated[2])
    expect(s.animated[1]).toEqual(s.animated[3])
    stop()
    expect(s.root.dataset.fish).toBe('false')
    expect(s.bubbles.every(bubble => bubble.hidden)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    expect(s.cancelled.every(cancel => cancel.mock.calls.length === 1)).toBe(true)
    expect(s.visibilityListeners.size).toBe(0)
    expect(s.mediaListeners.size).toBe(0)
    expect(s.disconnect).toHaveBeenCalledOnce()
  })

  it.each(['hidden', 'reduced', 'offscreen'] as const)('stops an active rise when %s and resumes with one bounded visit schedule', reason => {
    vi.useFakeTimers()
    const s = scene(), stop = attachMainPanelPond(s.root, { remainingIncense: 1_000, reducedMotion: false })
    vi.advanceTimersByTime(7_600)
    expect(s.bubbles[0]?.hidden).toBe(false)
    if (reason === 'hidden') s.setHidden(true)
    if (reason === 'reduced') s.setReduced(true)
    if (reason === 'offscreen') s.setInView(false)
    expect(s.root.dataset.available).toBe('false')
    expect(s.root.dataset.fish).toBe('false')
    expect(s.bubbles.every(bubble => bubble.hidden)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    expect(s.cancelled.every(cancel => cancel.mock.calls.length === 1)).toBe(true)
    if (reason === 'hidden') s.setHidden(false)
    if (reason === 'reduced') s.setReduced(false)
    if (reason === 'offscreen') s.setInView(true)
    expect(s.root.dataset.available).toBe('true')
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(23_999)
    expect(s.root.dataset.fish).toBe('false')
    vi.advanceTimersByTime(1)
    expect(s.root.dataset.fish).toBe('true')
    stop()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([{ remainingIncense: 100, reducedMotion: false }, { remainingIncense: 1_000, reducedMotion: true }, { remainingIncense: 1_000, reducedMotion: false, active: false }])('never schedules a fish outside its allowed presentation state: %j', props => {
    vi.useFakeTimers()
    const s = scene(), stop = attachMainPanelPond(s.root, props)
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(60_000)
    expect(s.animated).toHaveLength(0)
    stop()
  })
})
