/**
 * Entry button (presentational BadgeButton): keyboard reachable, frozen
 * hover/focus copy, pointer-events opt-in inside the click-through overlay.
 */
import { describe, expect, it } from 'vitest'
import { BadgeButton } from '../src/client/Badge.tsx'
import { HOVER_TEXT } from '../src/shared/index.ts'
import { findAll, renderDeep } from './helpers/render.ts'

function renderButton(open: boolean) {
  const tree = renderDeep(
    <BadgeButton open={open} onToggle={() => undefined} onEscape={() => undefined} buttonRef={null} />,
  )
  const button = findAll(tree, (node) => node.type === 'button')[0]
  if (button === undefined) throw new Error('badge button missing')
  return button
}

describe('LiangbiaoBadge entry', () => {
  it('is a keyboard-reachable button that opens a dialog', () => {
    const button = renderButton(false)
    expect(button.props.type).toBe('button')
    expect(button.props['aria-haspopup']).toBe('dialog')
    expect(button.props['aria-expanded']).toBe(false)
    expect(renderButton(true).props['aria-expanded']).toBe(true)
  })

  it('carries the frozen hover copy on hover and focus surfaces', () => {
    const button = renderButton(false)
    expect(button.props.title).toBe(HOVER_TEXT)
    expect(button.props['aria-label']).toBe(HOVER_TEXT)
  })

  it('opts back into pointer events inside the click-through overlay layer', () => {
    const style = renderButton(false).props.style as Record<string, unknown>
    expect(style.pointerEvents).toBe('auto')
  })
})
