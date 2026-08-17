/**
 * Where the docked 梁相 entry sits, and how that survives a reload.
 *
 * The badge is freely placeable anywhere in the frame, so three things have to
 * be handled explicitly:
 *  - the stored point is clamped back into view on every read (a window that
 *    shrank, or a monitor that went away, must not hide the entry);
 *  - the panel stacks above or below the badge and flips its horizontal edge
 *    before it could leave the viewport;
 *  - `localStorage` is used ONLY for this cosmetic preference. It is never an
 *    authority for votes or balances (AGENTS.md §15).
 */

/** Docked entry hit area: comfortably clickable without making 梁子 bulky. */
export const BADGE_SIZE = 48
/** Portrait inside the stationary interaction halo. */
export const BADGE_ICON_SIZE = 42
export const BADGE_MARGIN = 12
/** Leave the DSH settings control in the bottom-left corner uncovered. */
export const SETTINGS_CLEARANCE = 56
/**
 * DSH's default sidebar is 280px with 12px inline padding on each side. A
 * 256px panel therefore follows the sidebar's usable content width exactly
 * and does not cover the conversation column at the default dock.
 */
export const PANEL_WIDTH = 256
export const PANEL_GAP = 10
/** Approximate expanded panel height; used only to pick above vs below. */
const PANEL_STACK_HEIGHT = 316

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
}

/** Default dock: bottom-left, sitting just above the DSH settings control. */
export function defaultBadgePosition(viewport: Viewport): BadgePoint {
  return {
    x: BADGE_MARGIN,
    y: Math.max(BADGE_MARGIN, viewport.height - BADGE_SIZE - SETTINGS_CLEARANCE),
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

/** Read the stored position, clamped; the default dock when absent/corrupt. */
export function loadBadgePosition(
  viewport: Viewport,
  storage: Pick<Storage, 'getItem'> | null,
): BadgePoint {
  if (storage === null) return defaultBadgePosition(viewport)
  try {
    const raw = storage.getItem(BADGE_POSITION_STORAGE_KEY)
    if (raw === null) return defaultBadgePosition(viewport)
    const parsed = JSON.parse(raw) as unknown
    if (!isPoint(parsed)) return defaultBadgePosition(viewport)
    return clampBadgePosition(parsed, viewport)
  } catch {
    // A quota/parse/privacy-mode failure must never break the entry.
    return defaultBadgePosition(viewport)
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

/**
 * Choose above vs below for a badge position.
 * @param point - the badge's top-left in frame coordinates.
 * @param viewport - the frame size.
 * @returns where the panel should be drawn relative to the badge.
 */
export function panelPlacementFor(point: BadgePoint, viewport: Viewport): PanelPlacement {
  const needed = PANEL_STACK_HEIGHT + PANEL_GAP + BADGE_MARGIN
  const roomAbove = point.y
  const roomBelow = viewport.height - (point.y + BADGE_SIZE)
  // Prefer above (the default dock is in the bottom-left) and only drop
  // below when the badge has been dragged too close to the top.
  const stack: PanelPlacement['stack'] = roomAbove >= needed || roomAbove >= roomBelow ? 'above' : 'below'
  const align: PanelPlacement['align'] = point.x + PANEL_WIDTH <= viewport.width - BADGE_MARGIN ? 'start' : 'end'
  return { stack, align }
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
