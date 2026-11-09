import { describe, expect, it } from 'vitest'
import { MainPanelPond, MAIN_PANEL_POND_CSS, mainPondGeometry } from '../src/client/MainPanelPond.tsx'
import { MAIN_POND_GRASS, MAIN_POND_WHALE } from '../src/client/main-pond-art.ts'
import { findAll, findByAttr, renderDeep, styleOf } from './helpers/render.ts'

describe('main panel decorative pond', () => {
  it('keeps water bounded, monotonic and independent from Token progress or global Liangzi', () => {
    expect(mainPondGeometry(0)).toEqual({ waterDrop: 128, waterDepth: 0, plantGrowth: 0, fishTop: 102, fishEligible: false })
    expect(mainPondGeometry(1_000)).toEqual({ waterDrop: 0, waterDepth: 128, plantGrowth: 1, fishTop: 80, fishEligible: true })
    expect(mainPondGeometry(Number.MAX_SAFE_INTEGER)).toEqual(mainPondGeometry(1_000))
    for (const input of [-1, NaN, Infinity, -Infinity]) expect(mainPondGeometry(input)).toEqual(mainPondGeometry(0))
    let previousDepth = 0, previousGrowth = 0
    for (let stock = 0; stock <= 1_000; stock++) {
      const current = mainPondGeometry(stock)
      expect(current.waterDepth).toBeGreaterThanOrEqual(previousDepth)
      expect(current.plantGrowth).toBeGreaterThanOrEqual(previousGrowth)
      expect(current.waterDepth).toBeLessThanOrEqual(128)
      expect(current.plantGrowth).toBeLessThanOrEqual(1)
      previousDepth = current.waterDepth;previousGrowth = current.plantGrowth
    }
  })

  it('keeps the fish below the caption and under shallow water without touching the pond bottom', () => {
    for (const stock of [101, 110, 150, 437, 1_000, 1_000_000]) {
      const geometry = mainPondGeometry(stock)
      expect(geometry.fishTop).toBeGreaterThanOrEqual(80)
      expect(geometry.fishTop + 25).toBeLessThan(128)
      // The actor layer begins at y=8; the shared puff rises at most 4px.
      // Even its upper edge stays below the front wave's surface band.
      expect(geometry.fishTop + 8 - 4).toBeGreaterThanOrEqual(geometry.waterDrop + 15)
    }
    expect(mainPondGeometry(437).fishTop).toBe(80)
    expect(mainPondGeometry(101).fishTop).toBeGreaterThan(99)
  })

  it('grows a whole small plant from its root below 100 instead of clipping a tall plant', () => {
    for (const stock of [4, 9, 25, 50, 99]) {
      const geometry = mainPondGeometry(stock)
      expect(geometry.plantGrowth).toBeGreaterThan(0)
      expect(geometry.plantGrowth).toBeLessThan(1)
      expect(27 * geometry.plantGrowth).toBeLessThanOrEqual(geometry.waterDepth - 5 + 1e-9)
    }
    expect(mainPondGeometry(25).plantGrowth).toBe(.5)
    expect(mainPondGeometry(100).plantGrowth).toBe(1)
    expect(MAIN_PANEL_POND_CSS).toContain('height:calc(27px * var(--liangxiang-pond-growth,0))')
    expect(MAIN_PANEL_POND_CSS).toContain('transform-origin:50% 100%')
    expect(MAIN_PANEL_POND_CSS).toContain('@keyframes liangxiang-main-pond-grass{from{transform:skewX(-2.5deg)}to{transform:skewX(2.5deg)}}')
  })

  it('only permits occasional fish strictly above 100, retaining the approved two pebble beds', () => {
    for (const stock of [0, 25, 99, 100]) expect(mainPondGeometry(stock).fishEligible).toBe(false)
    for (const stock of [101, 999, 1_000, 1_000_000]) expect(mainPondGeometry(stock).fishEligible).toBe(true)
    const nodes = renderDeep(<MainPanelPond remainingIncense={101} reducedMotion={false} />)
    const stones = findAll(nodes, node => node.props.className === 'liangxiang-main-pond-stones')
    expect(stones).toHaveLength(2)
    expect(stones.map(stone => findAll([stone], node => node.type === 'i').length)).toEqual([2, 2])
    expect(findAll(nodes, node => node.type === 'img').map(node => node.props.src)).toEqual([MAIN_POND_GRASS, MAIN_POND_GRASS, MAIN_POND_WHALE])
  })

  it('keeps decoration out of the document flow, focus order, announcements and accounting', () => {
    const nodes = renderDeep(<MainPanelPond remainingIncense={25} reducedMotion active={false} />)
    const root = findByAttr(nodes, 'data-liangxiang-main-pond')[0]
    expect(root?.props['aria-hidden']).toBe('true')
    expect(root?.props['data-motion']).toBe(false)
    expect(root?.props['data-active']).toBe(false)
    expect(styleOf(root)['--liangxiang-pond-growth']).toBe(.5)
    expect(findAll(nodes, node => node.type === 'button' || node.type === 'input' || 'tabIndex' in node.props || 'aria-live' in node.props)).toHaveLength(0)
    expect(findByAttr(nodes, 'data-liangxiang-main-pond-bubbles')).toHaveLength(1)
    expect(findAll(nodes, node => node.props.className === 'liangxiang-main-pond-bubble')).toHaveLength(2)
    expect(MAIN_PANEL_POND_CSS).toContain('[data-liangxiang-main-pond-bubbles]{position:absolute;inset:0;z-index:4')
    expect(MAIN_PANEL_POND_CSS).toContain('[data-liangxiang-main-pond][data-motion=false] *')
    expect(MAIN_PANEL_POND_CSS).toContain('@media(prefers-reduced-motion:reduce)')
  })
})
