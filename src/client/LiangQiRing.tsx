/**
 * LiangQiRing — the personal 梁气 overlay around the central 梁子.
 *
 * One component, two visual variables (frozen contract, AGENTS.md §4):
 *  - remaining incense  -> vitality/intensity (glow + flame dots)
 *  - token remainder    -> ring fill (progress towards the next incense)
 *
 * The compact copy `N 炷 · 再 X Token` is integrated INTO the ring; there is
 * deliberately no separate personal-growth row anywhere else.
 *
 * Presentational only: no hooks.
 */
import type { CSSProperties, ReactElement, ReactNode } from 'react'
import { liangQiIntensity, type PersonalLiangQiState } from '../domain/index.ts'
import { color, font, ringColorForFill } from './theme.ts'

export interface LiangQiRingProps {
  personal: PersonalLiangQiState
  reducedMotion: boolean
  /** Transient `+1 炷` condensation feedback (container-timed). */
  justCondensed: boolean
  /** The LiangAvatar sits in the ring center. */
  children: ReactNode
}

const RING_SIZE = 168
const RING_RADIUS = 76
const RING_STROKE = 7

export function LiangQiRing({ personal, reducedMotion, justCondensed, children }: LiangQiRingProps): ReactElement {
  const intensity = liangQiIntensity(personal.remainingIncense)
  const fill = personal.liangQiFill
  const circumference = 2 * Math.PI * RING_RADIUS
  const stroke = ringColorForFill(fill)
  const flameCount = Math.min(personal.remainingIncense, 8)

  const flames: ReactElement[] = []
  for (let i = 0; i < flameCount; i += 1) {
    // Spread flame dots over the top arc; density/opacity express vitality.
    const angle = -Math.PI / 2 + ((i - (flameCount - 1) / 2) * Math.PI) / 10
    const cx = RING_SIZE / 2 + Math.cos(angle) * (RING_RADIUS + 7)
    const cy = RING_SIZE / 2 + Math.sin(angle) * (RING_RADIUS + 7)
    flames.push(
      <circle
        key={i}
        cx={cx}
        cy={cy}
        r={2.2 + intensity * 1.6}
        fill={color.warn}
        opacity={0.35 + intensity * 0.6}
      />,
    )
  }

  const wrapStyle: CSSProperties = {
    position: 'relative',
    width: `${RING_SIZE}px`,
    height: `${RING_SIZE}px`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    filter: intensity > 0 ? `drop-shadow(0 0 ${Math.round(4 + intensity * 10)}px rgba(216, 135, 58, ${(0.15 + intensity * 0.45).toFixed(2)}))` : undefined,
  }

  const ringLabel = `梁气：剩余香火 ${personal.remainingIncense} 炷，距下一炷还差 ${personal.tokensToNextIncense.toLocaleString('zh-CN')} Token`

  return (
    <div style={wrapStyle} data-liangbiao-ring="" data-remaining={personal.remainingIncense} data-fill={fill.toFixed(4)}>
      <svg
        width={RING_SIZE}
        height={RING_SIZE}
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        role="img"
        aria-label={ringLabel}
        style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
      >
        {/* track */}
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke={color.border}
          strokeWidth={RING_STROKE}
          opacity={0.5}
        />
        {/* fill arc: token progress towards the next incense stick */}
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke={stroke}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={`${circumference * (1 - fill)}`}
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
          style={reducedMotion ? undefined : { transition: 'stroke-dashoffset 0.6s ease, stroke 0.6s ease' }}
        />
        {flames}
      </svg>
      {children}
      {/* Integrated compact copy: inventory + next-incense progress, one component. */}
      <span
        data-liangbiao-ring-copy=""
        style={{
          position: 'absolute',
          bottom: '-4px',
          left: '50%',
          transform: 'translateX(-50%)',
          whiteSpace: 'nowrap',
          padding: '2px 10px',
          borderRadius: '999px',
          border: `1px solid ${color.border}`,
          background: color.bgLayer,
          color: color.textSecondary,
          fontFamily: font.family,
          fontSize: '12px',
          lineHeight: '18px',
        }}
      >
        <strong style={{ color: color.textPrimary, fontWeight: 600 }}>{personal.remainingIncense} 炷</strong>
        {' · 再 '}
        {personal.tokensToNextIncense.toLocaleString('zh-CN')}
        {' Token'}
      </span>
      {justCondensed && (
        <span
          data-liangbiao-condensed=""
          role="status"
          style={{
            position: 'absolute',
            top: '-6px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '1px 8px',
            borderRadius: '999px',
            background: color.warn,
            color: '#ffffff',
            fontFamily: font.family,
            fontSize: '12px',
            fontWeight: 600,
            animation: reducedMotion ? undefined : 'liangbiao-condense 1.2s ease-out 1',
          }}
        >
          凝香 +1 炷
        </span>
      )}
    </div>
  )
}
