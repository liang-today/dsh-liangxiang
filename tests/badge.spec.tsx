import { describe, expect, it } from 'vitest'
import { LiangbiaoBadge } from '../src/client/Badge.tsx'
import { HOVER_TEXT } from '../src/shared/index.ts'

describe('LiangbiaoBadge placeholder', () => {
  // ReactElement.props is untyped at this boundary; the assertions below are
  // the type check.
  const props = LiangbiaoBadge().props as Record<string, unknown>

  it('is a keyboard-reachable button', () => {
    expect(LiangbiaoBadge().type).toBe('button')
    expect(props.type).toBe('button')
  })

  it('carries the frozen hover copy on hover and focus surfaces', () => {
    expect(props.title).toBe(HOVER_TEXT)
    expect(props['aria-label']).toBe(HOVER_TEXT)
  })

  it('opts back into pointer events inside the click-through overlay layer', () => {
    const style = props.style as Record<string, unknown>
    expect(style.pointerEvents).toBe('auto')
    expect(style.position).toBe('absolute')
  })
})
