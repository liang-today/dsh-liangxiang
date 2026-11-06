/**
 * 走势 client contract: the remembered display choice is a cosmetic
 * browser-local preference, so it must default safely, ignore junk, and never
 * throw when storage is unavailable.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { BarsAttached, BarsWindow, barsWindow, readBarsPrefs, writeBarsPrefs } from '../src/client/BarsWindow.tsx'

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
    expect(writeBarsPrefs({ slot: 'attach' })).toEqual({ slot: 'attach', range: '1h', x: null, y: null })
  })

  it('renders the attached section and the floating window', () => {
    const attached = renderToStaticMarkup(createElement(BarsAttached, {
      range: '1h',
      onRange: () => undefined,
      onSlot: () => undefined,
    }))
    expect(attached).toContain('data-liangxiang-bars-attached')
    expect(attached).toContain('data-liangxiang-bars-chart')

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
    expect(floating).toContain('/bars.svg?interval=1m')
    expect(floating).toContain('不代表无人投票')
  })

  it('asks for whole milliseconds, never fractions', () => {
    const now = 1_800_000_000_123
    // Drag/zoom maths can leave fractions; the wire contract accepts integers only.
    expect(barsWindow('15m', { from: 1.6, to: now + 0.7 }, now)).toEqual({ from: 2, to: now + 1 })
    expect(barsWindow('1h', null, now)).toEqual({ from: now - 3_600_000, to: now })
    expect(barsWindow('today', null, now)).toEqual({ from: new Date(now).setHours(0, 0, 0, 0), to: now })
    expect(barsWindow('all', null, now)).toBeNull()
    expect(barsWindow('all', { from: -5, to: now }, now)).toEqual({ from: 0, to: now })
  })
})
