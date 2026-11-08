/**
 * Where the docked 梁相 entry sits, and how that survives a reload.
 *
 * The badge is freely placeable anywhere in the frame, so three things have to
 * be handled explicitly:
 *  - the stored point is clamped back into view on every read (a window that
 *    shrank, or a monitor that went away, must not hide the entry);
 *  - the panel stacks above or below the badge and flips its horizontal edge
 *    before it could leave the viewport;
 *  - if neither side has room for the full panel, the badge (not the panel
 *    height) moves so the pair still fits;
 *  - `localStorage` is used ONLY for this cosmetic preference. It is never an
 *    authority for votes or balances (AGENTS.md §15).
 */

/** Docked entry hit area: comfortably clickable without making 梁子 bulky. */
export const BADGE_SIZE = 48
/** Portrait inside the stationary interaction halo. */
export const BADGE_ICON_SIZE = 42
export const BADGE_MARGIN = 12
/**
 * Distance from the viewport bottom to the badge bottom at the default dock.
 * Fallback for shells without a measurable account control. On a fresh dock,
 * compat/dsh reads the actual footer once so shell versions/sign-in states
 * can retain the same 8px gap without changing a saved user position.
 */
export const SETTINGS_CLEARANCE = 50
/**
 * Match the usable content width of DSH's default 280px sidebar, which has
 * 12px inline padding. The panel keeps this width when the sidebar collapses;
 * only a viewport narrower than the panel reduces its rendered width.
 */
export const PANEL_WIDTH = 256
export const PANEL_GAP = 10
/** Approximate expanded panel height; used only to pick above vs below. */
export const PANEL_STACK_HEIGHT = 350

export const BADGE_POSITION_STORAGE_KEY = 'liangxiang:badge-position:v2'
export const PANEL_OPEN_STORAGE_KEY = 'liangxiang:panel-open:v1'

export interface BadgePoint {
  /** Distance from the frame's left edge, in px, of the badge's top-left. */
  x: number
  y: number
}

export interface Viewport {
  width: number
  height: number
}

/** Panel stacks above or below the badge — never left/right of it. */
export interface PanelPlacement {
  stack: 'above' | 'below'
  align: 'start' | 'end'
  /** Viewport-clamped panel left, relative to the unchanged badge point. */
  offsetX?: number
}

/** Default dock: bottom-left, sitting just above the DSH settings control. */
export function defaultBadgePosition(viewport: Viewport, clearance = SETTINGS_CLEARANCE): BadgePoint {
  return {
    x: BADGE_MARGIN,
    y: Math.max(BADGE_MARGIN, viewport.height - BADGE_SIZE - clearance),
  }
}

/** Keep the badge fully inside the frame, with a small margin. */
export function clampBadgePosition(point: BadgePoint, viewport: Viewport): BadgePoint {
  const maxX = Math.max(BADGE_MARGIN, viewport.width - BADGE_SIZE - BADGE_MARGIN)
  const maxY = Math.max(BADGE_MARGIN, viewport.height - BADGE_SIZE - BADGE_MARGIN)
  return {
    x: Math.min(Math.max(point.x, BADGE_MARGIN), maxX),
    y: Math.min(Math.max(point.y, BADGE_MARGIN), maxY),
  }
}

function isPoint(value: unknown): value is BadgePoint {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.x === 'number' && Number.isFinite(record.x)
    && typeof record.y === 'number' && Number.isFinite(record.y)
}

export function hasSavedBadgePosition(storage: Pick<Storage, 'getItem'> | null): boolean {
  try { return storage !== null && isPoint(JSON.parse(storage.getItem(BADGE_POSITION_STORAGE_KEY) ?? 'null')) }
  catch { return false }
}

/** Read the stored position, clamped; the default dock when absent/corrupt. */
export function loadBadgePosition(
  viewport: Viewport,
  storage: Pick<Storage, 'getItem'> | null,
  clearance = SETTINGS_CLEARANCE,
): BadgePoint {
  if (storage === null) return defaultBadgePosition(viewport, clearance)
  try {
    const raw = storage.getItem(BADGE_POSITION_STORAGE_KEY)
    if (raw === null) return defaultBadgePosition(viewport, clearance)
    const parsed = JSON.parse(raw) as unknown
    if (!isPoint(parsed)) return defaultBadgePosition(viewport, clearance)
    return clampBadgePosition(parsed, viewport)
  } catch {
    // A quota/parse/privacy-mode failure must never break the entry.
    return defaultBadgePosition(viewport, clearance)
  }
}

export function saveBadgePosition(
  point: BadgePoint,
  storage: Pick<Storage, 'setItem'> | null,
): void {
  if (storage === null) return
  try {
    storage.setItem(BADGE_POSITION_STORAGE_KEY, JSON.stringify(point))
  } catch {
    // Cosmetic preference only: losing it is not worth surfacing.
  }
}

/** Vertical room the full panel needs on one side of the badge. */
export function panelStackNeed(): number {
  return PANEL_STACK_HEIGHT + PANEL_GAP + BADGE_MARGIN
}

/** When DSH folds the sidebar, keep a left-docked badge on the frame edge. */
export function dockForNarrowFrame(point: BadgePoint, viewport: Viewport): BadgePoint {
  if (viewport.width < 1024 && point.x < 280) {
    return clampBadgePosition({ x: BADGE_MARGIN, y: point.y }, viewport)
  }
  return clampBadgePosition(point, viewport)
}

/**
 * If the full-height panel cannot sit above or below the badge, move the
 * badge — never shrink the panel and leave its copy hanging outside.
 */
export function nudgeBadgeForPanel(point: BadgePoint, viewport: Viewport): BadgePoint {
  const clamped = clampBadgePosition(point, viewport)
  const needed = panelStackNeed()
  const roomAbove = clamped.y
  const roomBelow = viewport.height - (clamped.y + BADGE_SIZE)
  if (roomAbove >= needed || roomBelow >= needed) return clamped
  if (roomAbove >= roomBelow) {
    return clampBadgePosition({ x: clamped.x, y: needed }, viewport)
  }
  return clampBadgePosition({
    x: clamped.x,
    y: viewport.height - BADGE_SIZE - needed,
  }, viewport)
}

export function settleBadgePosition(point: BadgePoint, viewport: Viewport): BadgePoint {
  return nudgeBadgeForPanel(dockForNarrowFrame(point, viewport), viewport)
}

export function panelPlacementFor(point: BadgePoint, viewport: Viewport): PanelPlacement {
  const needed = panelStackNeed()
  const roomAbove = point.y
  const roomBelow = viewport.height - (point.y + BADGE_SIZE)
  // Prefer above (the default dock is in the bottom-left) and only drop
  // below when the badge has been dragged too close to the top.
  const stack: PanelPlacement['stack'] = roomAbove >= needed || roomAbove >= roomBelow ? 'above' : 'below'
  const width = Math.min(PANEL_WIDTH, Math.max(0, viewport.width))
  const start = point.x
  const align: PanelPlacement['align'] = start + width <= viewport.width - BADGE_MARGIN ? 'start' : 'end'
  const preferredLeft = align === 'start' ? start : point.x + BADGE_SIZE - width
  const left = Math.max(0, Math.min(viewport.width - width, preferredLeft))
  return { stack, align, offsetX: left - point.x }
}

/** Default the expanded panel to open; persist × / badge toggles per browser. */
export function loadPanelOpen(storage: Pick<Storage, 'getItem'> | null): boolean {
  if (storage === null) return true
  try {
    const raw = storage.getItem(PANEL_OPEN_STORAGE_KEY)
    if (raw === '0') return false
    if (raw === '1') return true
  } catch {
    /* ignore */
  }
  return true
}

export function savePanelOpen(
  open: boolean,
  storage: Pick<Storage, 'setItem'> | null,
): void {
  if (storage === null) return
  try {
    storage.setItem(PANEL_OPEN_STORAGE_KEY, open ? '1' : '0')
  } catch {
    /* ignore */
  }
}
