import { describe, expect, it } from 'vitest'
import {
  BADGE_MARGIN,
  BADGE_SIZE,
  SETTINGS_CLEARANCE,
  defaultBadgePosition,
  dockForNarrowFrame,
  nudgeBadgeForPanel,
  panelPlacementFor,
  panelStackNeed,
  settleBadgePosition,
} from '../src/client/badge-position.ts'

describe('panel dock without shrinking the panel', () => {
  it('leaves an 8px gap above the DSH alpha.5 settings button', () => {
    const viewport = { width: 1280, height: 720 }
    const point = defaultBadgePosition(viewport)
    const dshSettingsTop = viewport.height - 6 - 4 - 42

    expect(point.x).toBe(BADGE_MARGIN)
    expect(dshSettingsTop - (point.y + BADGE_SIZE)).toBe(8)
    expect(SETTINGS_CLEARANCE).toBe(60)
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

  it('keeps a bottom-left dock stacking the full panel above', () => {
    const point = { x: 12, y: 620 }
    const viewport = { width: 1280, height: 720 }
    expect(panelPlacementFor(point, viewport).stack).toBe('above')
    expect(nudgeBadgeForPanel(point, viewport)).toEqual(point)
  })

  it('flips the panel below when the badge is near the top', () => {
    const point = { x: 12, y: 40 }
    const viewport = { width: 1280, height: 720 }
    expect(panelPlacementFor(point, viewport).stack).toBe('below')
    expect(nudgeBadgeForPanel(point, viewport)).toEqual(point)
  })

  it('moves the badge instead of shrinking the panel when neither side fits', () => {
    const viewport = { width: 1280, height: 500 }
    const needed = panelStackNeed()
    const nudged = nudgeBadgeForPanel({ x: 12, y: 200 }, viewport)
    const placement = panelPlacementFor(nudged, viewport)
    const room = placement.stack === 'above'
      ? nudged.y
      : viewport.height - nudged.y - BADGE_SIZE
    expect(room).toBeGreaterThanOrEqual(needed)
    expect(nudged.y).not.toBe(200)
  })

  it('settles a leftover compact dock after the sidebar folds', () => {
    const settled = settleBadgePosition({ x: 120, y: 80 }, { width: 900, height: 720 })
    expect(settled.x).toBe(12)
    expect(panelPlacementFor(settled, { width: 900, height: 720 }).stack).toBe('below')
  })
})
