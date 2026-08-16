/**
 * LiangQiRing — the personal 梁气 overlay around the central 梁子.
 *
 * One component, two visual variables (frozen contract, AGENTS.md §4):
 *  - remaining incense  -> vitality + pictorial 炷/月/日 on separate orbits
 *  - token remainder    -> ring fill (progress towards the next incense)
 *
 * Marks are real glyphs (stick / moon / sun), not 2px dots on a cramped
 * top arc — those were uncountable, so 9 炷 still looked like the old 8-cap.
 * A moon never occupies a stick slot. The bottom of the ring is left open
 * for the 梁位 pill.
 *
 * The ring owns GEOMETRY only. The `footer` slot sits at the ring's bottom
 * edge and the caller decides what goes there — the panel puts the global
 * 梁位 value in it. Presentational only: no hooks.
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
/** Leave the south arc empty so 炷/月 do not sit on the 梁位 pill. */
const BOTTOM_GAP = 1.2
const ONES_ORBIT = RING_RADIUS + 9
const TENS_ORBIT = RING_RADIUS + 17
const HUNDREDS_ORBIT = RING_RADIUS - 12

function orbitAngle(index: number, count: number): number {
  const span = 2 * Math.PI - BOTTOM_GAP
  const t = (index + 0.5) / Math.max(count, 1)
  return Math.PI / 2 + BOTTOM_GAP / 2 + t * span
}

function orbitPoint(index: number, count: number, radius: number): { angle: number, cx: number, cy: number } {
  const angle = orbitAngle(index, count)
  return {
    angle,
    cx: RING_SIZE / 2 + Math.cos(angle) * radius,
    cy: RING_SIZE / 2 + Math.sin(angle) * radius,
  }
}

function StickMark({ index, count, opacity }: { index: number, count: number, opacity: number }): ReactElement {
  const { angle, cx, cy } = orbitPoint(index, count, ONES_ORBIT)
  const deg = (angle * 180) / Math.PI + 90
  return (
    <g
      data-liangbiao-incense-mark="one"
      data-liangbiao-incense-glyph="stick"
      transform={`translate(${cx} ${cy}) rotate(${deg})`}
      opacity={opacity}
    >
      <ellipse cx="0" cy="-6.4" rx="1.45" ry="2.35" fill={color.warn} />
      <rect x="-1.2" y="-4.2" width="2.4" height="8.6" rx="1.1" fill={color.warn} />
    </g>
  )
}

function MoonMark({ index, count, opacity }: { index: number, count: number, opacity: number }): ReactElement {
  const { cx, cy } = orbitPoint(index, count, TENS_ORBIT)
  return (
    <g
      data-liangbiao-incense-mark="ten"
      data-liangbiao-incense-glyph="moon"
      transform={`translate(${cx} ${cy})`}
      opacity={opacity}
    >
      <path
        fill={color.warn}
        d="M 1.5 -4.3 A 4.4 4.4 0 1 0 1.5 4.3 A 3.4 3.4 0 1 1 1.5 -4.3 Z"
      />
    </g>
  )
}

function SunMark({ index, count, opacity }: { index: number, count: number, opacity: number }): ReactElement {
  const { cx, cy } = orbitPoint(index, count, HUNDREDS_ORBIT)
  return (
    <g
      data-liangbiao-incense-mark="hundred"
      data-liangbiao-incense-glyph="sun"
      transform={`translate(${cx} ${cy})`}
      opacity={opacity}
    >
      <circle r="2.35" fill={color.warn} />
      {[0, 45, 90, 135].map((deg) => (
        <rect
          key={deg}
          x="-0.55"
          y="-5.4"
          width="1.1"
          height="2.35"
          rx="0.5"
          fill={color.warn}
          transform={`rotate(${deg})`}
        />
      ))}
    </g>
  )
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
  const stickOpacity = 0.55 + intensity * 0.45
  const moonOpacity = 0.6 + intensity * 0.4
  const sunOpacity = 0.55 + intensity * 0.45

  const marks: ReactElement[] = []
  for (let i = 0; i < places.ones; i += 1) {
    marks.push(<StickMark key={`one-${i}`} index={i} count={places.ones} opacity={stickOpacity} />)
  }
  for (let i = 0; i < places.tens; i += 1) {
    marks.push(<MoonMark key={`ten-${i}`} index={i} count={places.tens} opacity={moonOpacity} />)
  }
  for (let i = 0; i < places.hundreds; i += 1) {
    marks.push(<SunMark key={`hundred-${i}`} index={i} count={places.hundreds} opacity={sunOpacity} />)
  }

  const wrapStyle: CSSProperties = {
    position: 'relative',
    width: `${RING_SIZE}px`,
    height: `${RING_SIZE}px`,
    overflow: 'visible',
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
