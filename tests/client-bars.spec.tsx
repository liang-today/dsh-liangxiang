/**
 * 走势 client contract: the remembered display choice is a cosmetic
 * browser-local preference, so it must default safely, ignore junk, and never
 * throw when storage is unavailable.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { BarsDock, BarsWindow, readBarsPrefs, writeBarsPrefs } from '../src/client/BarsWindow.tsx'

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
    expect(readBarsPrefs()).toEqual({ slot: 'closed', range: '1h' })
  })

  it('remembers a chosen surface and range', () => {
    const fake = installStorage()
    expect(writeBarsPrefs({ slot: 'full' })).toEqual({ slot: 'full', range: '1h' })
    expect(writeBarsPrefs({ range: 'all' })).toEqual({ slot: 'full', range: 'all' })
    expect(JSON.parse(fake.store.get('liangxiang:bars:v1') ?? '{}')).toEqual({ slot: 'full', range: 'all' })
  })

  it('falls back instead of trusting junk', () => {
    const fake = installStorage()
    fake.store.set('liangxiang:bars:v1', JSON.stringify({ slot: 'overlay', range: '10y' }))
    expect(readBarsPrefs()).toEqual({ slot: 'closed', range: '1h' })
    fake.store.set('liangxiang:bars:v1', 'not json')
    expect(readBarsPrefs()).toEqual({ slot: 'closed', range: '1h' })
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
    expect(writeBarsPrefs({ slot: 'dock' })).toEqual({ slot: 'dock', range: '1h' })
  })

  it('renders the compact card and the floating window', () => {
    const dock = renderToStaticMarkup(createElement(BarsDock, {
      range: '1h',
      onRange: () => undefined,
      onDisplay: () => undefined,
    }))
    expect(dock).toContain('data-liangxiang-bars-dock')
    expect(dock).toContain('data-liangxiang-bars-chart')

    const floating = renderToStaticMarkup(createElement(BarsWindow, {
      display: 'float',
      range: '15m',
      onRange: () => undefined,
      onDisplay: () => undefined,
      onClose: () => undefined,
    }))
    expect(floating).toContain('role="dialog"')
    expect(floating).toContain('data-liangxiang-bars-window="float"')
    expect(floating).toContain('/bars.svg?interval=1m')
    expect(floating).toContain('不代表那段时间无人投票')
  })
})
