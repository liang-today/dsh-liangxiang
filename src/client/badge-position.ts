/**
 * Where the docked 梁标 entry sits, and how that survives a reload.
 *
 * The badge is freely placeable anywhere in the frame, so three things have to
 * be handled explicitly:
 *  - the stored point is clamped back into view on every read (a window that
 *    shrank, or a monitor that went away, must not hide the entry);
 *  - the panel flips to whichever side has room, and its vertical anchor moves
 *    to the near edge when the badge is close to the top or bottom;
 *  - `localStorage` is used ONLY for this cosmetic preference. It is never an
 *    authority for votes or balances (AGENTS.md §15).
 */

export const BADGE_SIZE = 32
export const BADGE_MARGIN = 12
export const PANEL_WIDTH = 252
export const PANEL_GAP = 10
/** Room the panel needs above/below its vertical centre before it must re-anchor. */
const PANEL_HALF_HEIGHT = 158

export const BADGE_POSITION_STORAGE_KEY = 'liangbiao:badge-position:v1'

export interface BadgePoint {
  /** Distance from the frame's left edge, in px, of the badge's top-left. */
  x: number
  y: number
}

export interface Viewport {
  width: number
  height: number
}

/** Panel side and vertical anchor derived from where the badge ended up. */
export interface PanelPlacement {
  side: 'left' | 'right'
  vertical: 'center' | 'top' | 'bottom'
}

/** Default dock: right edge, vertically centred (the pre-drag behaviour). */
export function defaultBadgePosition(viewport: Viewport): BadgePoint {
  return {
    x: Math.max(BADGE_MARGIN, viewport.width - BADGE_SIZE - 16),
    y: Math.max(BADGE_MARGIN, Math.round(viewport.height / 2 - BADGE_SIZE / 2)),
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
 * Choose the panel's side and vertical anchor for a badge position.
 * @param point - the badge's top-left in frame coordinates.
 * @param viewport - the frame size.
 * @returns where the panel should be drawn relative to the badge.
 */
export function panelPlacementFor(point: BadgePoint, viewport: Viewport): PanelPlacement {
  const roomOnLeft = point.x
  const roomOnRight = viewport.width - (point.x + BADGE_SIZE)
  const needed = PANEL_WIDTH + PANEL_GAP + BADGE_MARGIN
  // Prefer the left side (the historical placement) and flip only when the
  // badge has been dragged somewhere that cannot fit the panel.
  const side: PanelPlacement['side'] = roomOnLeft >= needed || roomOnLeft >= roomOnRight ? 'left' : 'right'
  const centre = point.y + BADGE_SIZE / 2
  const vertical: PanelPlacement['vertical'] = centre < PANEL_HALF_HEIGHT
    ? 'top'
    : centre > viewport.height - PANEL_HALF_HEIGHT
      ? 'bottom'
      : 'center'
  return { side, vertical }
}
