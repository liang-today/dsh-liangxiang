/**
 * 走势 client contract: the remembered display choice is a cosmetic
 * browser-local preference, so it must default safely, ignore junk, and never
 * throw when storage is unavailable.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { BarsWindow, barsSummary, barsWindow, readBarsPrefs, writeBarsPrefs } from '../src/client/BarsWindow.tsx'

interface FakeStorage {
  store: Map<string, string>
}

function installStorage(): FakeStorage {
  const fake: FakeStorage = { store: new Map() }
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => fake.store.get(key) ?? null,
      setItem: (key: string, value: string) => void fake.store.set(key, value),
    },
  })
  return fake
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'localStorage')
})

describe('走势 display preference', () => {
  it('starts closed on the last hour', () => {
    installStorage()
    expect(readBarsPrefs()).toEqual({ slot: 'closed', range: '1h', x: null, y: null })
  })

  it('remembers a chosen surface and range', () => {
    const fake = installStorage()
    expect(writeBarsPrefs({ slot: 'full' })).toEqual({ slot: 'full', range: '1h', x: null, y: null })
    expect(writeBarsPrefs({ range: 'all' })).toEqual({ slot: 'full', range: 'all', x: null, y: null })
    expect(JSON.parse(fake.store.get('liangxiang:bars:v1') ?? '{}')).toEqual({ slot: 'full', range: 'all', x: null, y: null })
  })

  it('falls back instead of trusting junk', () => {
    const fake = installStorage()
    fake.store.set('liangxiang:bars:v1', JSON.stringify({ slot: 'overlay', range: '10y' }))
    expect(readBarsPrefs()).toEqual({ slot: 'closed', range: '1h', x: null, y: null })
    fake.store.set('liangxiang:bars:v1', 'not json')
    expect(readBarsPrefs()).toEqual({ slot: 'closed', range: '1h', x: null, y: null })
  })

  it('survives a storage that refuses writes', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => {
          throw new Error('quota')
        },
      },
    })
    expect(writeBarsPrefs({ slot: 'float' })).toEqual({ slot: 'float', range: '1h', x: null, y: null })
  })

  it('renders only a dialog with a full-screen action', () => {
    const floating = renderToStaticMarkup(createElement(BarsWindow, {
      display: 'float',
      range: '15m',
      onRange: () => undefined,
      onSlot: () => undefined,
      position: { x: null, y: null },
      onMove: () => undefined,
      onClose: () => undefined,
    }))
    expect(floating).toContain('role="dialog"')
    expect(floating).toContain('data-liangxiang-bars-window="float"')
    expect(floating).not.toContain('data-liangxiang-bars-attached')
    expect(floating).not.toContain('挂回梁案')
    expect(floating).toContain('全屏')
    expect(floating).toContain('未统计区间不补线')
  })

  it('asks for whole milliseconds, never fractions', () => {
    const now = 1_800_000_000_123
    // Drag/zoom maths can leave fractions; the wire contract accepts integers only.
    expect(barsWindow('15m', { from: 1.6, to: now + 0.7 }, now)).toEqual({ from: 2, to: now + 1 })
    expect(barsWindow('1h', null, now)).toEqual({ from: now - 3_600_000, to: now })
    expect(barsWindow('today', null, now, 'UTC')).toEqual({ from: Date.parse(new Date(now).toISOString().slice(0, 10) + 'T00:00:00Z'), to: now })
    expect(barsWindow('all', null, now)).toBeNull()
    expect(barsWindow('all', { from: -5, to: now }, now)).toEqual({ from: 0, to: now })
  })

  it('migrates an embedded preference to an independent dialog', () => {
    const fake = installStorage()
    fake.store.set('liangxiang:bars:v1', JSON.stringify({ slot: 'attach', range: 'today' }))
    expect(readBarsPrefs()).toEqual({ slot: 'float', range: 'today', x: null, y: null })
  })

  it('keeps a zero-vote case distinct from the previous case and from an outage', () => {
    const candle = { t: 1, open: null, high: null, low: null, close: null, upVotes: 0, downVotes: 0, samples: 1, caseId: 'new-case', gap: false }
    expect(barsSummary([candle])).toBe('待开梁 · 夯 0 拉 0')
    expect(barsSummary([{ ...candle, close: 0.75 }, candle])).toBe('待开梁 · 夯 0 拉 0')
    expect(barsSummary([{ ...candle, gap: true, samples: 0 }])).toBe('未统计')
  })

  it('uses the business timezone and retained dates for today and all', () => {
    const now = Date.parse('2026-11-07T03:00:00Z')
    expect(barsWindow('today', null, now, 'Asia/Shanghai')).toEqual({ from: Date.parse('2026-11-06T16:00:00Z'), to: now })
    expect(barsWindow('all', null, now, 'Asia/Shanghai', ['2026-11-05', '2026-11-06', '2026-11-07']))
      .toEqual({ from: Date.parse('2026-11-04T16:00:00Z'), to: now })
  })

  it('finds the business midnight on short and long daylight-saving days', () => {
    const spring = Date.parse('2026-03-09T03:00:00Z')
    expect(barsWindow('today', null, spring, 'America/New_York')?.from).toBe(Date.parse('2026-03-08T05:00:00Z'))
    const autumn = Date.parse('2026-11-02T04:00:00Z')
    expect(barsWindow('today', null, autumn, 'America/New_York')?.from).toBe(Date.parse('2026-11-01T04:00:00Z'))
  })

  it('skips invalid derived dates instead of crashing the panel on all', () => {
    const now = Date.parse('2026-11-07T03:00:00Z')
    expect(barsWindow('all', null, now, 'Asia/Shanghai', ['2026-00-00', '2026-11-05']))
      .toEqual({ from: Date.parse('2026-11-04T16:00:00Z'), to: now })
    expect(barsWindow('all', null, now, 'Asia/Shanghai', ['2026-00-00'])).toBeNull()
  })

})
