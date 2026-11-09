import { describe, expect, it } from 'vitest'
import {
  BADGE_MARGIN,
  BADGE_SIZE,
  PANEL_WIDTH,
  SETTINGS_CLEARANCE,
  defaultBadgePosition,
  dockForNarrowFrame,
  nudgeBadgeForPanel,
  panelPlacementFor,
  panelStackNeed,
  settleBadgePosition,
} from '../src/client/badge-position.ts'

describe('panel dock without shrinking the panel', () => {
  it('aligns the default 256px panel with the sidebar content and keeps its centerline', () => {
    const viewport = { width: 1280, height: 720 }
    const point = defaultBadgePosition(viewport)
    const placement = panelPlacementFor(point, viewport)
    expect(point.x).toBe(12)
    expect(point.x + placement.offsetX!).toBe(12)
    expect(PANEL_WIDTH).toBe(256)
    expect(point.x + placement.offsetX! + PANEL_WIDTH).toBe(268)
    expect(point.x + placement.offsetX! + PANEL_WIDTH / 2).toBe(140)
  })

  it('preserves dragged coordinates and the original horizontal anchors', () => {
    for (const [x, expectedLeft, align] of [[400, 400, 'start'], [932, 932, 'start'], [933, 725, 'end'], [1140, 932, 'end']] as const) {
      const point = { x, y: 600 }
      const placement = panelPlacementFor(point, { width: 1200, height: 800 })
      expect(point.x).toBe(x)
      expect(placement.align).toBe(align)
      expect(point.x + placement.offsetX!).toBe(expectedLeft)
    }
  })

  it('clamps the panel without moving the badge when neither horizontal anchor fits', () => {
    for (const [width, x] of [[320, 80], [400, 200], [280, 80], [279, 80], [256, 80], [255, 80]] as const) {
      const point = { x, y: 400 }
      const placement = panelPlacementFor(point, { width, height: 700 })
      const left = point.x + placement.offsetX!
      expect(left).toBe(0)
      expect(left + Math.min(PANEL_WIDTH, width)).toBeLessThanOrEqual(width)
      expect(point.x).toBe(x)
    }
  })

  it('keeps both edge margins when they fit and only reduces width below 256px', () => {
    for (const width of [1280, 1024, 900, 320, 280]) {
      const viewport = { width, height: 720 }
      const point = defaultBadgePosition(viewport)
      const placement = panelPlacementFor(point, viewport)
      expect(point.x + placement.offsetX!).toBe(12)
      expect(Math.min(PANEL_WIDTH, width)).toBe(256)
    }
    for (const width of [256, 255, 200]) {
      const viewport = { width, height: 720 }
      const point = defaultBadgePosition(viewport)
      const placement = panelPlacementFor(point, viewport)
      expect(point.x + placement.offsetX!).toBe(0)
      expect(point.x + placement.offsetX! + Math.min(PANEL_WIDTH, width)).toBe(width)
    }
  })

  it('leaves an 8px gap above the DSH 0.2.1 account-menu button', () => {
    const viewport = { width: 1280, height: 720 }
    const point = defaultBadgePosition(viewport)
    const dshSettingsTop = viewport.height - 6 - 36

    expect(point.x).toBe(BADGE_MARGIN)
    expect(dshSettingsTop - (point.y + BADGE_SIZE)).toBe(8)
    expect(SETTINGS_CLEARANCE).toBe(50)
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
