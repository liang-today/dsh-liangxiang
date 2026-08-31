import { describe, expect, it } from 'vitest'
import {
  availablePanelHeight,
  dockForNarrowFrame,
  panelDensityFor,
  panelPlacementFor,
} from '../src/client/badge-position.ts'

describe('panel dock and density', () => {
  it('compacts a short or narrow frame', () => {
    expect(panelDensityFor({ width: 1280, height: 800 })).toBe('regular')
    expect(panelDensityFor({ width: 1280, height: 500 })).toBe('compact')
    expect(panelDensityFor({ width: 700, height: 800 })).toBe('compact')
  })

  it('snaps a left-docked badge to the frame edge when the sidebar would collapse', () => {
    expect(dockForNarrowFrame({ x: 120, y: 400 }, { width: 900, height: 700 })).toEqual({
      x: 12,
      y: 400,
    })
    expect(dockForNarrowFrame({ x: 400, y: 400 }, { width: 900, height: 700 })).toEqual({
      x: 400,
      y: 400,
    })
  })

  it('gives the panel a measured max height above a bottom-left dock', () => {
    const point = { x: 12, y: 620 }
    const viewport = { width: 1280, height: 720 }
    const placement = panelPlacementFor(point, viewport)
    expect(placement.stack).toBe('above')
    expect(availablePanelHeight(point, viewport, placement)).toBeGreaterThanOrEqual(200)
    expect(availablePanelHeight(point, viewport, placement)).toBeLessThan(620)
  })
})
