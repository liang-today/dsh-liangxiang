import { BADGE_SIZE, BADGE_ICON_SIZE, PANEL_WIDTH, panelPlacementFor, type BadgePoint, type Viewport } from './badge-position.ts'
import { SQUISH_EXIT_MS, SQUISH_MAX_ROWS } from './badge-squish.ts'

export interface FeedbackRect extends BadgePoint { width: number, height: number }
export interface FeedbackPlacement extends BadgePoint { align: 'start' | 'center' | 'end' }
export interface BadgeComment { id: number, text: string, createdAt: number }
export interface PresentedComment extends BadgeComment { slot: number, exitingAt?: number }
export const SPEECH_ROW_HEIGHT = 22
/** An actual exit runway: no clipped viewport can cut a retiring line off. */
export const SPEECH_EXIT_SPACE = 20
const GAP = 10
const MARGIN = 8

function overlaps(a: FeedbackRect, b: FeedbackRect): boolean {
  return a.x < b.x + b.width + GAP && a.x + a.width + GAP > b.x
    && a.y < b.y + b.height + GAP && a.y + a.height + GAP > b.y
}

/** Center the ordinary hint unless its actual width reaches a viewport edge. */
export function placeBadgeFeedback(badge: BadgePoint, viewport: Viewport, width: number, height: number, panel: FeedbackRect | null = null): FeedbackPlacement | null {
  const centered = badge.x + BADGE_SIZE / 2 - width / 2
  const x = Math.max(MARGIN, Math.min(viewport.width - MARGIN - width, centered))
  const candidates = [{ x, y: badge.y + BADGE_SIZE + GAP }, { x, y: badge.y - GAP - height }]
  if (panel) {
    const speech = placeBadgeSpeech(badge, viewport, width, panel)
    if (speech) candidates.push({ x: speech.x, y: speech.y })
  }
  const point = candidates.find(point => point.x >= MARGIN && point.y >= MARGIN
    && point.x + width <= viewport.width - MARGIN && point.y + height <= viewport.height - MARGIN
    && !overlaps({ ...point, width, height }, { ...badge, width: BADGE_SIZE, height: BADGE_SIZE })
    && (!panel || !overlaps({ ...point, width, height }, panel)))
  return point ? { ...point, align: point.x > centered ? 'start' : point.x < centered ? 'end' : 'center' } : null
}

export interface SpeechPlacement extends BadgePoint { width: number, capacity: number, align: 'start' | 'center' | 'end', height: number }

/** A voice beside the badge, within the panel's column. Never beside the panel. */
export function placeBadgeSpeech(badge: BadgePoint, viewport: Viewport, desiredWidth: number, panel: FeedbackRect | null): SpeechPlacement | null {
  const placement = panelPlacementFor(badge, viewport)
  const left = panel?.x ?? badge.x + (placement.offsetX ?? 0)
  const right = left + (panel?.width ?? Math.min(PANEL_WIDTH, viewport.width))
  const roomLeft = badge.x - GAP - left
  const roomRight = right - badge.x - BADGE_SIZE - GAP
  const onRight = roomRight >= roomLeft
  const width = Math.min(desiredWidth, onRight ? roomRight : roomLeft)
  const y = badge.y + (BADGE_SIZE - BADGE_ICON_SIZE) / 2
  const bottom = Math.min(viewport.height - MARGIN, panel && panel.y > badge.y ? panel.y - GAP : Infinity)
  const capacity = Math.min(SQUISH_MAX_ROWS, Math.floor((bottom - y - SPEECH_EXIT_SPACE) / SPEECH_ROW_HEIGHT))
  if (width < 64 || capacity < 1) return null
  // The emission point stays fixed throughout a burst; moving it up for each
  // new row would cancel the older rows' downward motion in screen coordinates.
  const height = capacity * SPEECH_ROW_HEIGHT + SPEECH_EXIT_SPACE
  const x = onRight ? badge.x + BADGE_SIZE + GAP : badge.x - GAP - width
  if (x < MARGIN || x + width > viewport.width - MARGIN || y < MARGIN || y + height > viewport.height - MARGIN) return null
  const align = badge.x < MARGIN + width / 2 ? 'start' : badge.x + BADGE_SIZE > viewport.width - MARGIN - width / 2 ? 'end' : 'center'
  return { x, y, width, capacity, height, align }
}

/** Removed rows remain present for the same exit, whether displaced or expired. */
export function reconcileBadgeComments(previous: PresentedComment[], comments: BadgeComment[], capacity: number, now: number): PresentedComment[] {
  const live: PresentedComment[] = comments.slice(0, capacity).map((comment, slot) => ({ ...comment, slot }))
  const retiring = previous.filter(row => !live.some(current => current.id === row.id)
    && (row.exitingAt === undefined || now - row.exitingAt < SQUISH_EXIT_MS))
    .map(row => row.exitingAt === undefined ? {
      ...row, exitingAt: now,
      slot: row.slot + 0.85,
    } : row)
  return [...live, ...retiring].slice(0, SQUISH_MAX_ROWS + 4)
}
