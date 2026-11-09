import { describe, expect, it } from 'vitest'
import { SQUISH_EXIT_MS, SQUISH_LABELS, pickSquishLabel } from '../src/client/badge-squish.ts'
import { placeBadgeFeedback, placeBadgeSpeech, reconcileBadgeComments } from '../src/client/badge-feedback.ts'

describe('badge feedback geometry', () => {
  const viewport = { width: 1200, height: 800 }
  it('centers the hint unless its actual width reaches an edge', () => {
    expect(placeBadgeFeedback({ x: 500, y: 400 }, viewport, 180, 28)).toEqual({ x: 434, y: 458, align: 'center' })
    expect(placeBadgeFeedback({ x: 12, y: 400 }, viewport, 180, 28)).toEqual({ x: 8, y: 458, align: 'start' })
    expect(placeBadgeFeedback({ x: 1140, y: 400 }, viewport, 180, 28)).toEqual({ x: 1012, y: 458, align: 'end' })
  })
  it('keeps speech beside the badge and inside the panel column', () => {
    const panel = { x: 12, y: 342, width: 256, height: 350 }
    const result = placeBadgeSpeech({ x: 12, y: 702 }, viewport, 160, panel)!
    expect(result).toEqual({ x: 70, y: 705, width: 160, capacity: 3, height: 86, align: 'start' })
    expect(result.x + result.width).toBeLessThanOrEqual(panel.x + panel.width)
    expect(result.y).toBeGreaterThan(panel.y + panel.height)
  })
  it('uses the inside of the right dock and reduces rows at top/bottom edges', () => {
    const right = placeBadgeSpeech({ x: 1140, y: 702 }, viewport, 160, { x: 932, y: 342, width: 256, height: 350 })!
    expect(right.align).toBe('end')
    expect(right.x).toBeGreaterThanOrEqual(932)
    expect(right.x + right.width).toBeLessThan(1140)
    const limited = placeBadgeSpeech({ x: 12, y: 420 }, viewport, 160, { x: 12, y: 30, width: 256, height: 380 })!
    expect(limited.capacity).toBe(3)
    expect(limited.y).toBe(423)
    const top = placeBadgeSpeech({ x: 12, y: 12 }, viewport, 160, { x: 12, y: 70, width: 256, height: 714 })!
    expect(top.capacity).toBe(1)
    expect(top.y + top.height).toBeLessThanOrEqual(70)
  })
  it('declines speech if the available width cannot hold it', () => {
    expect(placeBadgeSpeech({ x: 12, y: 12 }, { width: 90, height: 70 }, 160, null)).toBeNull()
  })
  it('uses the same clamped panel footprint when the panel is closed in a narrow middle dock', () => {
    const result = placeBadgeSpeech({ x: 80, y: 400 }, { width: 320, height: 700 }, 160, null)!
    expect(result.x).toBe(138)
    expect(result.width).toBe(118)
    expect(result.x + result.width).toBe(256)
    expect(result.capacity).toBe(3)
  })
})

describe('speech presence', () => {
  const a = { id: 1, text: 'a', createdAt: 0 }
  const b = { id: 2, text: 'b', createdAt: 0 }
  const c = { id: 3, text: 'c', createdAt: 0 }
  const d = { id: 4, text: 'd', createdAt: 100 }
  it('retains a displaced row for a fade instead of dropping it', () => {
    const before = reconcileBadgeComments([], [c, b, a], 3, 0)
    const after = reconcileBadgeComments(before, [d, c, b], 3, 100)
    expect(after.filter(row => row.exitingAt === undefined)).toHaveLength(3)
    expect(after.find(row => row.id === a.id)).toMatchObject({ slot: 2.85, exitingAt: 100 })
    expect(reconcileBadgeComments(after, [d, c, b], 3, 100 + SQUISH_EXIT_MS - 1)).toHaveLength(4)
    expect(reconcileBadgeComments(after, [d, c, b], 3, 100 + SQUISH_EXIT_MS)).toHaveLength(3)
  })
  it('uses the same timed exit for an expired last row', () => {
    const before = reconcileBadgeComments([], [a], 3, 0)
    const after = reconcileBadgeComments(before, [], 3, 2400)
    expect(after).toHaveLength(1)
    expect(after[0]).toMatchObject({ exitingAt: 2400, slot: 0.85 })
    expect(reconcileBadgeComments(after, [], 3, 2400 + SQUISH_EXIT_MS)).toEqual([])
  })
  it('bounds live and exiting rows during continuous play', () => {
    let rows = reconcileBadgeComments([], [c, b, a], 3, 0)
    for (let id = 4; id < 100; id++) {
      rows = reconcileBadgeComments(rows, [id, id - 1, id - 2].map(id => ({ id, text: 'x', createdAt: id * 140 })), 3, id * 140)
      expect(rows.filter(row => row.exitingAt === undefined)).toHaveLength(3)
      expect(rows.length).toBeLessThanOrEqual(7)
    }
  })
})

describe('badge comment copy', () => {
  it('chooses a short line without immediately repeating it', () => {
    let previous = ''
    for (let i = 0; i < 200; i++) {
      const line = pickSquishLabel(previous)
      expect(SQUISH_LABELS).toContain(line)
      expect(line).not.toBe(previous)
      expect(line.length).toBeLessThanOrEqual(14)
      previous = line
    }
  })
})
