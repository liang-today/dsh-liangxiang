/**
 * Entry button (presentational BadgeButton): the current 梁子 state is the icon,
 * the hover/focus copy is frozen, it is keyboard reachable, it opts into pointer
 * events inside the click-through overlay, and it is grabbable for free
 * placement. Placement math lives in `badge-position.ts` and is tested below.
 */
import { describe, expect, it } from 'vitest'
import { BadgeButton, earnedIncenseGain, shouldAnnounceCondensedIncense } from '../src/client/Badge.tsx'
import {
  BADGE_ICON_SIZE,
  BADGE_MARGIN,
  BADGE_SIZE,
  SETTINGS_CLEARANCE,
  clampBadgePosition,
  defaultBadgePosition,
  loadBadgePosition,
  panelPlacementFor,
  saveBadgePosition,
  BADGE_POSITION_STORAGE_KEY,
} from '../src/client/badge-position.ts'
import { LIANGZI_STATES, liangQiFloatPeriodMs } from '../src/domain/index.ts'
import { HOVER_TEXT, LIANGZI_STATE_LABELS } from '../src/shared/index.ts'
import { findAll, findByAttr, renderDeep, styleOf } from './helpers/render.ts'

function renderButton(open: boolean, liangziState: 'waiting' | 'liang_gong' | 'liang_shen' | 'liang_sheng' = 'liang_sheng') {
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

describe('LiangxiangBadge entry', () => {
  it('preserves the actual incense gain from a multi-stick update', () => {
    expect(earnedIncenseGain(7, 8)).toBe(1)
    expect(earnedIncenseGain(7, 13)).toBe(6)
    expect(earnedIncenseGain(7, 7)).toBe(0)
    expect(earnedIncenseGain(7, 3)).toBe(0)
  })

  it('does not flash 凝香 for the starter hydrate right after going live', () => {
    expect(shouldAnnounceCondensedIncense(0, 10, 80)).toBe(false)
    expect(shouldAnnounceCondensedIncense(0, 10, 3_000)).toBe(true)
    expect(shouldAnnounceCondensedIncense(22, 23, 80)).toBe(true)
    expect(shouldAnnounceCondensedIncense(10, 10, 80)).toBe(false)
  })

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

  it('can place the hover label below the badge, opposite an above-stacked panel', () => {
    const tree = renderDeep(
      <BadgeButton
        open
        liangziState="liang_sheng"
        tooltipSide="below"
        onToggle={() => undefined}
        onEscape={() => undefined}
        buttonRef={null}
      />,
    )
    const button = findAll(tree, (node) => node.type === 'button')[0]
    expect(button?.props['data-tooltip-side']).toBe('below')
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
      const avatars = findByAttr(tree, 'data-liangxiang-avatar', state)
      expect(avatars).toHaveLength(1)
      expect(avatars[0]?.props['data-liangxiang-avatar-chrome']).toBe('none')
      // The mini avatar carries no state label (no room) and is decorative.
      const portrait = findAll(tree, (node) => node.type === 'img')[0]
      expect(portrait?.props.width).toBe(BADGE_ICON_SIZE)
      expect(portrait?.props.width).toBe(42)
      expect(portrait?.props.src).toEqual(expect.stringMatching(/^data:image\/webp;base64,/))
    }
    const { button } = renderButton(false)
    expect(button.props['data-liangxiang-badge-state']).toBe('liang_sheng')
  })

  it('uses a stationary interaction halo while only the figure bobs', () => {
    const { button, tree } = renderButton(false, 'liang_gong')
    const style = styleOf(button)
    expect(String(style.background)).toContain('radial-gradient')
    expect(style.overflow).toBe('visible')
    expect(String(style.boxShadow)).toContain('rgba')
    expect(style.borderRadius).toBe('50%')
    expect(style.width).toBe(`${BADGE_SIZE}px`)
    expect(style.height).toBe(`${BADGE_SIZE}px`)
    expect(style.animation).toBeUndefined()

    const halo = findByAttr(tree, 'data-liangxiang-badge-halo')[0]
    expect(halo).toBeDefined()
    expect(styleOf(halo).animation).toBeUndefined()

    const figure = findByAttr(tree, 'data-liangxiang-avatar-figure')[0]
    if (figure === undefined) throw new Error('avatar figure missing')
    expect(styleOf(figure).animation).toContain('liangxiang-avatar-figure-float')
    expect(styleOf(figure).transform).toBe('translateZ(0)')
    expect(styleOf(findAll(tree, (node) => node.type === 'img')[0]).animation).toBeUndefined()
    expect(styleOf(findAll(tree, (node) => node.type === 'img')[0]).borderRadius).toBe(0)
  })

  it('bobs 梁工 with the panel and keeps the slow idle bob at fill 0', () => {
    const filling = renderDeep(
      <BadgeButton
        open={false}
        liangziState="liang_gong"
        liangQiFill={0.94}
        onToggle={() => undefined}
        onEscape={() => undefined}
        buttonRef={null}
      />,
    )
    const fillingFigure = findByAttr(filling, 'data-liangxiang-avatar-figure')[0]
    expect(fillingFigure?.props['data-liangxiang-float-ms']).toBe(liangQiFloatPeriodMs(0.94))
    expect(styleOf(fillingFigure).animation).toContain('liangxiang-avatar-figure-float')

    const idle = renderDeep(
      <BadgeButton
        open={false}
        liangziState="liang_gong"
        liangQiFill={0}
        onToggle={() => undefined}
        onEscape={() => undefined}
        buttonRef={null}
      />,
    )
    const idleFigure = findByAttr(idle, 'data-liangxiang-avatar-figure')[0]
    expect(idleFigure?.props['data-liangxiang-float-ms']).toBe(liangQiFloatPeriodMs(0))
    expect(styleOf(idleFigure).animation).toContain('liangxiang-avatar-figure-float')
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

  it('docks to the bottom-left, just above the settings control, by default', () => {
    const point = defaultBadgePosition(viewport)
    expect(point.x).toBe(BADGE_MARGIN)
    expect(point.y).toBe(viewport.height - BADGE_SIZE - SETTINGS_CLEARANCE)
    expect((viewport.height - 6 - 4 - 42) - (point.y + BADGE_SIZE)).toBe(8)
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

  it('stacks vertically and flips horizontal alignment before leaving the viewport', () => {
    expect(panelPlacementFor({ x: BADGE_MARGIN, y: viewport.height - 96 }, viewport)).toEqual({ stack: 'above', align: 'start' })
    expect(panelPlacementFor({ x: BADGE_MARGIN, y: BADGE_MARGIN }, viewport)).toEqual({ stack: 'below', align: 'start' })
    expect(panelPlacementFor({ x: viewport.width - BADGE_SIZE - BADGE_MARGIN, y: BADGE_MARGIN }, viewport)).toEqual({ stack: 'below', align: 'end' })
  })
})
