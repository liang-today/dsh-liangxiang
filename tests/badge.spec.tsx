/**
 * Entry button (presentational BadgeButton): the current 梁子 state is the icon,
 * the hover/focus copy is frozen, it is keyboard reachable, it opts into pointer
 * events inside the click-through overlay, and it is grabbable for free
 * placement. Placement math lives in `badge-position.ts` and is tested below.
 */
import { describe, expect, it } from 'vitest'
import { BadgeButton } from '../src/client/Badge.tsx'
import {
  BADGE_MARGIN,
  BADGE_SIZE,
  PANEL_WIDTH,
  clampBadgePosition,
  defaultBadgePosition,
  loadBadgePosition,
  panelPlacementFor,
  saveBadgePosition,
  BADGE_POSITION_STORAGE_KEY,
} from '../src/client/badge-position.ts'
import { LIANGZI_STATES } from '../src/domain/index.ts'
import { HOVER_TEXT, LIANGZI_STATE_LABELS } from '../src/shared/index.ts'
import { findAll, findByAttr, renderDeep, styleOf } from './helpers/render.ts'

function renderButton(open: boolean, liangziState: 'waiting' | 'liang_sheng' = 'liang_sheng') {
  const tree = renderDeep(
    <BadgeButton
      open={open}
      liangziState={liangziState}
      onToggle={() => undefined}
      onEscape={() => undefined}
      buttonRef={null}
    />,
  )
  const button = findAll(tree, (node) => node.type === 'button')[0]
  if (button === undefined) throw new Error('badge button missing')
  return { tree, button }
}

describe('LiangbiaoBadge entry', () => {
  it('is a keyboard-reachable button that opens a dialog', () => {
    const { button } = renderButton(false)
    expect(button.props.type).toBe('button')
    expect(button.props['aria-haspopup']).toBe('dialog')
    expect(button.props['aria-expanded']).toBe(false)
    expect(renderButton(true).button.props['aria-expanded']).toBe(true)
  })

  it('keeps the frozen hover copy and names the state for assistive tech', () => {
    const { button } = renderButton(false)
    expect(button.props.title).toBe(HOVER_TEXT)
    expect(button.props['aria-label']).toBe(`${HOVER_TEXT}：${LIANGZI_STATE_LABELS.liang_sheng}`)
  })

  it('probes for a newer 梁案 on hover and keyboard focus', () => {
    let probes = 0
    const tree = renderDeep(
      <BadgeButton
        open={false}
        liangziState="liang_sheng"
        onToggle={() => undefined}
        onEscape={() => undefined}
        onProbeLatest={() => {
          probes += 1
        }}
        buttonRef={null}
      />,
    )
    const button = findAll(tree, (node) => node.type === 'button')[0]
    if (button === undefined) throw new Error('badge button missing')
    const enter = button.props.onPointerEnter as ((event: unknown) => void) | undefined
    const focus = button.props.onFocus as ((event: unknown) => void) | undefined
    enter?.({})
    focus?.({})
    expect(probes).toBe(2)
  })

  it('uses the current 梁子 state as its icon, not a letter', () => {
    for (const state of LIANGZI_STATES) {
      const tree = renderDeep(
        <BadgeButton
          open={false}
          liangziState={state}
          onToggle={() => undefined}
          onEscape={() => undefined}
          buttonRef={null}
        />,
      )
      const avatars = findByAttr(tree, 'data-liangbiao-avatar', state)
      expect(avatars).toHaveLength(1)
      // The mini avatar carries no state label (no room) and is decorative.
      const portrait = findAll(tree, (node) => node.type === 'img')[0]
      expect(portrait?.props.width).toBe(30)
      expect(portrait?.props.src).toEqual(expect.stringMatching(/^data:image\/jpeg;base64,/))
    }
    const { button } = renderButton(false)
    expect(button.props['data-liangbiao-badge-state']).toBe('liang_sheng')
  })

  it('opts back into pointer events and advertises itself as grabbable', () => {
    const style = styleOf(renderButton(false).button)
    expect(style.pointerEvents).toBe('auto')
    expect(style.cursor).toBe('grab')
    // Dragging on touch must not scroll the page instead.
    expect(style.touchAction).toBe('none')
  })
})

describe('free placement', () => {
  const viewport = { width: 1200, height: 800 }

  it('docks to the right edge, vertically centred, by default', () => {
    const point = defaultBadgePosition(viewport)
    expect(point.x).toBe(viewport.width - BADGE_SIZE - 16)
    expect(point.y).toBe(Math.round(viewport.height / 2 - BADGE_SIZE / 2))
  })

  it('clamps a point back into the frame', () => {
    expect(clampBadgePosition({ x: -500, y: -500 }, viewport)).toEqual({ x: BADGE_MARGIN, y: BADGE_MARGIN })
    expect(clampBadgePosition({ x: 99_999, y: 99_999 }, viewport)).toEqual({
      x: viewport.width - BADGE_SIZE - BADGE_MARGIN,
      y: viewport.height - BADGE_SIZE - BADGE_MARGIN,
    })
  })

  it('round-trips through storage and survives corrupt or absent values', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    }
    saveBadgePosition({ x: 40, y: 60 }, storage)
    expect(store.get(BADGE_POSITION_STORAGE_KEY)).toBe('{"x":40,"y":60}')
    expect(loadBadgePosition(viewport, storage)).toEqual({ x: 40, y: 60 })

    store.set(BADGE_POSITION_STORAGE_KEY, 'not json')
    expect(loadBadgePosition(viewport, storage)).toEqual(defaultBadgePosition(viewport))
    store.set(BADGE_POSITION_STORAGE_KEY, '{"x":"left"}')
    expect(loadBadgePosition(viewport, storage)).toEqual(defaultBadgePosition(viewport))
    store.clear()
    expect(loadBadgePosition(viewport, storage)).toEqual(defaultBadgePosition(viewport))
    // No storage at all (privacy mode / SSR) must not throw.
    expect(loadBadgePosition(viewport, null)).toEqual(defaultBadgePosition(viewport))
    expect(() => saveBadgePosition({ x: 1, y: 2 }, null)).not.toThrow()
  })

  it('clamps a stored point that no longer fits a shrunken window', () => {
    const store = new Map([[BADGE_POSITION_STORAGE_KEY, '{"x":1150,"y":760}']])
    const storage = { getItem: (key: string) => store.get(key) ?? null }
    const small = { width: 400, height: 300 }
    const point = loadBadgePosition(small, storage)
    expect(point.x).toBeLessThanOrEqual(small.width - BADGE_SIZE - BADGE_MARGIN)
    expect(point.y).toBeLessThanOrEqual(small.height - BADGE_SIZE - BADGE_MARGIN)
  })

  it('flips the panel to whichever side has room', () => {
    // Docked right: the panel opens to the left, as it always has.
    expect(panelPlacementFor({ x: viewport.width - 48, y: 400 }, viewport).side).toBe('left')
    // Dragged to the left edge: opening left would go off-frame.
    expect(panelPlacementFor({ x: BADGE_MARGIN, y: 400 }, viewport).side).toBe('right')
    // Just past the panel width there is room on the left again.
    expect(panelPlacementFor({ x: PANEL_WIDTH + 40, y: 400 }, viewport).side).toBe('left')
  })

  it('re-anchors the panel vertically near the top and bottom edges', () => {
    expect(panelPlacementFor({ x: 600, y: 400 }, viewport).vertical).toBe('center')
    expect(panelPlacementFor({ x: 600, y: BADGE_MARGIN }, viewport).vertical).toBe('top')
    expect(panelPlacementFor({ x: 600, y: viewport.height - 60 }, viewport).vertical).toBe('bottom')
  })
})
