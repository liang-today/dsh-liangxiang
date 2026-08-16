/**
 * Placeholder badge: proves the client plugin registered into shell.overlay.
 * NOT the real UI — the 梁气环, details panel, theming, and stage colors
 * arrive in the formal UI milestone. Kept deliberately static: no animation,
 * no state, no DSH imports.
 */
import type { CSSProperties, ReactElement } from 'react'
import { HOVER_TEXT, PRODUCT_NAME } from '../shared/index.ts'

/**
 * The shell.overlay layer spans the frame with pointer-events:none; the
 * entry itself opts back in and docks to the right edge, clear of the
 * composer and the sidebar.
 */
const badgeStyle: CSSProperties = {
  position: 'absolute',
  right: '16px',
  top: '50%',
  transform: 'translateY(-50%)',
  width: '32px',
  height: '32px',
  padding: 0,
  border: 'none',
  borderRadius: '50%',
  pointerEvents: 'auto',
  cursor: 'default',
  background: 'rgba(90, 105, 140, 0.85)',
  color: '#ffffff',
  fontSize: '14px',
  lineHeight: '32px',
  textAlign: 'center',
}

/**
 * Props-less placeholder entry component (keyboard-reachable button; hover
 * and focus both surface the frozen tooltip copy).
 * @returns the badge element.
 */
export function LiangbiaoBadge(): ReactElement {
  return (
    <button
      type="button"
      title={HOVER_TEXT}
      aria-label={HOVER_TEXT}
      style={badgeStyle}
      data-liangbiao-badge=""
    >
      {PRODUCT_NAME.charAt(0)}
    </button>
  )
}
