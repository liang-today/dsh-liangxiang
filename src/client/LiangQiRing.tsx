/**
 * LiangQiRing — the personal 梁气 overlay around the central 梁子.
 *
 * One component, two visual variables (frozen contract, AGENTS.md §4):
 *  - remaining incense  -> vitality + pictorial 炷/月/日 on separate orbits
 *  - token remainder    -> ring fill (progress towards the next incense)
 *
 * The ring owns GEOMETRY only. The `footer` slot sits at the ring's bottom edge
 * and the caller decides what goes there — the panel puts the global 梁位 value
 * in it, which is deliberately NOT this component's data (personal vs global
 * stay separate in the data flow even though they overlap visually).
 *
 * Presentational only: no hooks.
 */
import type { CSSProperties, ReactElement, ReactNode } from 'react'
import { formatCompactCount, incensePlaceValue, liangQiIntensity, type PersonalLiangQiState } from '../domain/index.ts'
import { color, font, ringColorForFill } from './theme.ts'

export interface LiangQiRingProps {
  personal: PersonalLiangQiState
  reducedMotion: boolean
  /** Transient `+1 炷` condensation feedback (container-timed). */
  justCondensed: boolean
  /** Pinned to the ring's bottom edge; the panel passes the 梁位 value. */
  footer?: ReactNode
  /** The LiangAvatar sits in the ring center. */
  children: ReactNode
}

/** Geometry of the central ring. The panel overlays personal flanks around this box. */
export const RING_SIZE = 126
const RING_RADIUS = 54
const RING_STROKE = 5
const AVATAR_SLOT = 68

function markAngle(index: number, count: number): number {
  const span = 2.35
  const t = count <= 1 ? 0.5 : index / (count - 1)
  return -Math.PI / 2 - span / 2 + t * span
}

function markPoint(index: number, count: number, radius: number): { cx: number, cy: number } {
  const angle = markAngle(index, count)
  return {
    cx: RING_SIZE / 2 + Math.cos(angle) * radius,
    cy: RING_SIZE / 2 + Math.sin(angle) * radius,
  }
}

export function LiangQiRing({
  personal,
  reducedMotion,
  justCondensed,
  footer,
  children,
}: LiangQiRingProps): ReactElement {
  const intensity = liangQiIntensity(personal.remainingIncense)
  const fill = personal.liangQiFill
  const circumference = 2 * Math.PI * RING_RADIUS
  const stroke = ringColorForFill(fill)
  const places = incensePlaceValue(personal.remainingIncense)

  const marks: ReactElement[] = []
  for (let i = 0; i < places.ones; i += 1) {
    const { cx, cy } = markPoint(i, places.ones, RING_RADIUS + 6)
    marks.push(
      <circle
        key={`one-${i}`}
        data-liangbiao-incense-mark="one"
        cx={cx}
        cy={cy}
        r={2.1}
        fill={color.warn}
        opacity={0.45 + intensity * 0.5}
      />,
    )
  }
  for (let i = 0; i < places.tens; i += 1) {
    const { cx, cy } = markPoint(i, places.tens, RING_RADIUS + 13)
    marks.push(
      <circle
        key={`ten-${i}`}
        data-liangbiao-incense-mark="ten"
        cx={cx}
        cy={cy}
        r={3.4}
        fill="none"
        stroke={color.warn}
        strokeWidth={1.4}
        opacity={0.55 + intensity * 0.4}
      />,
    )
  }
  for (let i = 0; i < places.hundreds; i += 1) {
    const { cx, cy } = markPoint(i, places.hundreds, RING_RADIUS - 11)
    marks.push(
      <circle
        key={`hundred-${i}`}
        data-liangbiao-incense-mark="hundred"
        cx={cx}
        cy={cy}
        r={2.6}
        fill={color.warn}
        opacity={0.5 + intensity * 0.45}
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
    filter: intensity > 0 ? `drop-shadow(0 0 ${Math.round(3 + intensity * 8)}px rgba(216, 135, 58, ${(0.15 + intensity * 0.45).toFixed(2)}))` : undefined,
  }

  const ringLabel = `梁气：剩余香火 ${personal.remainingIncense} 炷，距下一炷还差 ${personal.tokensToNextIncense.toLocaleString('zh-CN')} 当量`

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
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke={color.border}
          strokeWidth={RING_STROKE}
          opacity={0.5}
        />
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
        {marks}
      </svg>
      <div style={{ width: AVATAR_SLOT, display: 'flex', justifyContent: 'center' }}>
        {children}
      </div>
      {places.overflow > 0 && (
        <span
          data-liangbiao-incense-overflow=""
          title={`${personal.remainingIncense.toLocaleString('zh-CN')} 炷`}
          style={{
            position: 'absolute',
            top: '2px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '0 5px',
            borderRadius: '999px',
            background: color.warn,
            color: '#ffffff',
            fontFamily: font.family,
            fontSize: '10px',
            fontWeight: 700,
            lineHeight: '16px',
          }}
        >
          {formatCompactCount(places.overflow)}炷
        </span>
      )}
      {footer !== undefined && (
        <span
          data-liangbiao-ring-footer=""
          style={{
            position: 'absolute',
            bottom: '-4px',
            left: '50%',
            transform: 'translateX(-50%)',
            whiteSpace: 'nowrap',
            fontFamily: font.family,
          }}
        >
          {footer}
        </span>
      )}
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
            fontSize: '11px',
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
