/**
 * Volume glyphs 无 / 小 / 中 / 大.
 *
 * Three waves share one acoustic centre to the right of the cone. Each arc
 * is `a r r 0 0 1 0 2h` with r ≥ h so the third bar is another concentric
 * )) — not a clipped oval that overshoots the 24×24 box.
 */
import type { ReactElement } from 'react'

/** Concentric waves: (startX, startY, r, spanY). Rightmost point stays < 24. */
const WAVES = [
  'M15.2 9.5a3.5 3.5 0 0 1 0 5',
  'M17.2 7.5a6 6 0 0 1 0 9',
  'M19.2 5.5a8.5 8.5 0 0 1 0 13',
] as const

export function SoundIcon({ level }: { level: number }): ReactElement {
  const waves = Math.max(0, Math.min(3, Math.floor(level)))
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-liangbiao-sound-icon={waves}
    >
      <path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" />
      {waves === 0
        ? (
          <>
            <line x1="16" y1="9" x2="21.5" y2="15" />
            <line x1="21.5" y1="9" x2="16" y2="15" />
          </>
        )
        : WAVES.slice(0, waves).map((d) => <path key={d} d={d} />)}
    </svg>
  )
}
