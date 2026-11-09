import { afterEach, describe, expect, it, vi } from 'vitest'
import { attachMainPanelPondActivity } from '../src/client/MainPanelPond.tsx'

function scene(depth = 80) {
  const visibility = new Set<() => void>(), changes = new Set<() => void>()
  const doc = { hidden: false, addEventListener: (_: string, fn: () => void) => visibility.add(fn), removeEventListener: (_: string, fn: () => void) => visibility.delete(fn) }
  const media = { matches: false, addEventListener: (_: string, fn: () => void) => changes.add(fn), removeEventListener: (_: string, fn: () => void) => changes.delete(fn) }
  let mutated = () => undefined as void, wave = 0
  const disconnect = vi.fn()
  class Observer {
    constructor(callback: () => void) { mutated = callback }
    observe(): void {}
    disconnect = disconnect
  }
  const animated: Array<{ frames: Keyframe[], options: KeyframeAnimationOptions, cancel: ReturnType<typeof vi.fn> }> = []
  const animate = (frames: Keyframe[], options: KeyframeAnimationOptions): Animation => {
    let timer: ReturnType<typeof setTimeout>
    const finished = new Promise<void>(resolve => { timer = setTimeout(resolve, Number(options.duration)) })
    const cancel = vi.fn(() => clearTimeout(timer))
    animated.push({ frames, options, cancel })
    return { finished, cancel } as unknown as Animation
  }
  const makeBubble = (side: string) => ({ dataset: { side } as Record<string, string>, hidden: true,
    style: { setProperty(key: string, value: string) { Object.assign(this, { [key]: value }) } } as unknown as CSSStyleDeclaration,
    animate, querySelector: () => ({ animate }) })
  const bubbles = [makeBubble('left'), makeBubble('right')]
  const root = {
    dataset: { streaming: 'true', active: 'true', motion: 'true', available: 'true', waterDrop: String(128 - depth) }, isConnected: true,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    querySelector(selector: string) {
      if (selector.includes('grass')) return { getBoundingClientRect: () => ({ left: selector.includes('left') ? 0 : 220, right: selector.includes('left') ? 22 : 240, bottom: 136, height: Math.min(27, depth * .4) }) }
      if (selector.includes('water]')) return { getBoundingClientRect: () => ({ bottom: 136 }) }
      return { getScreenCTM: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: Number(root.dataset.waterDrop) + 8 + wave }),
        getTotalLength: () => 260, getPointAtLength: (x: number) => ({ x, y: 5 }) }
    },
    querySelectorAll: (selector: string) => selector.includes('activity]') ? bubbles : [],
  }
  vi.stubGlobal('document', doc);vi.stubGlobal('window', { matchMedia: () => media });vi.stubGlobal('MutationObserver', Observer)
  return { root: root as unknown as HTMLDivElement, bubbles, animated, disconnect,
    change(patch: Record<string, string>) { Object.assign(root.dataset, patch);mutated() },
    setWave(value: number) { wave = value },
    hidden(value: boolean) { doc.hidden = value;visibility.forEach(fn => fn()) },
    reduced(value: boolean) { media.matches = value;changes.forEach(fn => fn()) },
    listeners: () => visibility.size + changes.size,
  }
}

afterEach(() => { vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals() })

describe('request-only plant bubble lifecycle', () => {
  it.each([0, 4, 8])('does not invent water or run a bubble timer at depth %s', async depth => {
    vi.useFakeTimers();const s = scene(depth), stop = attachMainPanelPondActivity(s.root)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(s.animated).toEqual([]);expect(vi.getTimerCount()).toBe(0)
    stop();expect(s.listeners()).toBe(0)
  })

  it.each([12.8, 40, 128])('grows from a plant within water depth %s and pops at the sampled moving surface', async depth => {
    vi.useFakeTimers();const s = scene(depth), stop = attachMainPanelPondActivity(s.root)
    await vi.advanceTimersByTimeAsync(200)
    const bubble = s.bubbles[0]!, y = Number(bubble.dataset.birthY), surface = Number(bubble.dataset.surfaceY)
    const size = parseFloat(bubble.style.width)
    expect(bubble.hidden).toBe(false);expect(bubble.dataset.stage).toBe('rise')
    expect(y).toBeGreaterThan(surface);expect(y + size / 2).toBeLessThanOrEqual(136)
    expect(size).toBeGreaterThanOrEqual(3.5);expect(size).toBeLessThanOrEqual(8)
    expect(s.animated[1]?.frames).toEqual([{ transform: 'scale(.3)', opacity: .42 }, { transform: 'scale(1)', opacity: .72 }])
    s.setWave(2)
    await vi.advanceTimersByTimeAsync(Number(s.animated[0]!.options.duration))
    expect(bubble.dataset.stage).toBe('pop');expect(Number(bubble.dataset.surfaceY)).toBe(surface + 2)
    await vi.advanceTimersByTimeAsync(1_750)
    expect(bubble.hidden).toBe(true);stop()
  })

  it('alternates sides with bounded timers and releases all finished animations over a long request', async () => {
    vi.useFakeTimers();const s = scene(), stop = attachMainPanelPondActivity(s.root)
    await vi.advanceTimersByTimeAsync(200)
    expect(s.bubbles[0]?.hidden).toBe(false);expect(s.bubbles[1]?.hidden).toBe(true)
    await vi.advanceTimersByTimeAsync(2_800)
    expect(s.bubbles[1]?.hidden).toBe(false)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(vi.getTimerCount()).toBeLessThanOrEqual(8)
    expect(s.animated.filter(a => !a.cancel.mock.calls.length).length).toBeLessThanOrEqual(4)
    stop();expect(vi.getTimerCount()).toBe(0)
    expect(s.animated.every(a => a.cancel.mock.calls.length === 1)).toBe(true)
    expect(s.disconnect).toHaveBeenCalledOnce();expect(s.listeners()).toBe(0)
  })

  it.each(['streaming', 'available', 'active', 'motion', 'waterDrop', 'hidden', 'reduced'] as const)('cancels only this activity on %s and resumes once', async reason => {
    vi.useFakeTimers();const s = scene(), stop = attachMainPanelPondActivity(s.root)
    await vi.advanceTimersByTimeAsync(200)
    if (reason === 'hidden') s.hidden(true)
    else if (reason === 'reduced') s.reduced(true)
    else s.change({ [reason]: reason === 'waterDrop' ? '128' : 'false' })
    expect(s.bubbles.every(b => b.hidden)).toBe(true);expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(s.animated).toHaveLength(2)
    if (reason === 'hidden') s.hidden(false)
    else if (reason === 'reduced') s.reduced(false)
    else s.change({ [reason]: reason === 'waterDrop' ? '48' : 'true' })
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(200)
    expect(s.animated).toHaveLength(4);stop()
  })
})
