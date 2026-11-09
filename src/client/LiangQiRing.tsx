/**
 * LiangQiRing — the personal 香火环 around the central 梁子.
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
import { liangQiIntensity, type PersonalLiangQiState } from '../domain/index.ts'
import { color, font } from './theme.ts'
import { mainColor } from './main-panel-theme.ts'

export interface LiangQiRingProps {
  personal: PersonalLiangQiState
  reducedMotion: boolean
  /** Actual incense gained in the latest update; 0 hides the transient feedback. */
  condensedIncense: number
  /** Live request activity only, never progress or spendable incense. */
  streamingActive?: boolean
  /** Overrides `personal.liangQiFill` for the throttle (油门) animation only. */
  fillOverride?: number
  /** Pinned to the ring's bottom edge; the panel passes the 梁位 value. */
  footer?: ReactNode
  /** The LiangAvatar sits in the ring center. */
  children: ReactNode
}

/** Geometry of the central ring. The panel overlays personal flanks around this box. */
export const RING_SIZE = 126
const RING_RADIUS = 54
const RING_STROKE = 5
/** Inner clear diameter is ~103px; fill the circle (was 68, +~2/5). */
export const AVATAR_SLOT = 96
/** Leave the south arc empty so 炷/月 do not sit on the 梁位 pill. */
const BOTTOM_GAP = 1.2
const ONES_ORBIT = RING_RADIUS + 5
const TENS_ORBIT = RING_RADIUS + 10
const HUNDREDS_ORBIT = RING_RADIUS + 10
/** Inherited ritual marks: quiet champagne gold against the blue water. */
const FLAME = 'light-dark(#deb967, #edd49a)'
const GLYPH_GOLD = 'light-dark(#b58a45, #d9bd82)'

const ACTIVITY_CSS = `
@keyframes liangxiang-stream-glow{50%{opacity:.32}}
@media(prefers-reduced-motion:reduce){[data-liangxiang-stream-activity]{animation:none!important}}`

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
      data-liangxiang-incense-mark="one"
      data-liangxiang-incense-glyph="stick"
      transform={`translate(${cx} ${cy}) rotate(${deg})`}
      opacity={opacity}
    >
      <path d="M 0 -4.4 C -1.2 -3.1 -1.2 -2 0 -1.2 C 1.2 -2 1.2 -3.1 0 -4.4 Z" fill={FLAME} />
      <rect x="-1.5" y="-1.1" width="3" height="7.4" rx="1.4" fill={GLYPH_GOLD} />
    </g>
  )
}

function MoonMark({ index, count, opacity }: { index: number, count: number, opacity: number }): ReactElement {
  const { cx, cy } = orbitPoint(index, count, TENS_ORBIT)
  return (
    <g
      data-liangxiang-incense-mark="ten"
      data-liangxiang-incense-glyph="moon"
      transform={`translate(${cx} ${cy})`}
      opacity={opacity}
    >
      {/* Open crescent (two horns), scaled from the standard "moon" icon path. */}
      <path
        fill={GLYPH_GOLD}
        d="M 2.1 0.3 A 3.8 3.8 0 1 1 -2 -3.8 A 2.9 2.9 0 0 0 2.1 0.3 Z"
      />
    </g>
  )
}

function SunMark({ index, count, opacity }: { index: number, count: number, opacity: number }): ReactElement {
  const { cx, cy } = orbitPoint(index, count, HUNDREDS_ORBIT)
  return (
    <g
      data-liangxiang-incense-mark="hundred"
      data-liangxiang-incense-glyph="sun"
      transform={`translate(${cx} ${cy})`}
      opacity={opacity}
    >
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <rect
          key={deg}
          x="-0.55"
          y="-5.3"
          width="1.1"
          height="2.2"
          rx="0.55"
          fill={GLYPH_GOLD}
          transform={`rotate(${deg})`}
        />
      ))}
      <circle r="2.4" fill={GLYPH_GOLD} />
    </g>
  )
}

export function LiangQiRing({
  personal,
  reducedMotion,
  condensedIncense,
  streamingActive = false,
  fillOverride,
  footer,
  children,
}: LiangQiRingProps): ReactElement {
  const intensity = liangQiIntensity(personal.remainingIncense)
  const fill = fillOverride ?? personal.liangQiFill
  const circumference = 2 * Math.PI * RING_RADIUS
  const stroke = mainColor.blue
  // One legible magnitude at a time. Exact available incense stays in the
  // caption and accessible ring summary, never in a competing permanent badge.
  const stock = personal.remainingIncense
  const places = { ones: stock < 10 ? stock : 0, tens: stock >= 10 && stock < 100 ? Math.floor(stock / 10) : 0,
    hundreds: stock >= 100 && stock < 1000 ? Math.floor(stock / 100) : 0 }
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
  }

  const ringLabel = `香火环：剩余香火 ${personal.remainingIncense} 炷，距下一炷还差 ${personal.tokensToNextIncense.toLocaleString('zh-CN')} 当量`

  return (
    <div style={wrapStyle} data-liangxiang-ring="" data-remaining={personal.remainingIncense} data-fill={fill.toFixed(4)}>
      <svg
        width={RING_SIZE}
        height={RING_SIZE}
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        role="img"
        aria-label={ringLabel}
        style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
      >
        {streamingActive && <>
          <style>{ACTIVITY_CSS}</style>
          <path data-liangxiang-stream-activity="" aria-hidden="true" d="M27 103Q63 132 99 103"
            fill="none" stroke={mainColor.water} strokeWidth="6" strokeLinecap="round"
            style={{ opacity: .14, animation: reducedMotion ? undefined : 'liangxiang-stream-glow 3s ease-in-out infinite' }} />
        </>}
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
          style={reducedMotion ? undefined : { transition: 'stroke-dashoffset 0.85s ease, stroke 0.85s ease' }}
        />
        {marks}
      </svg>
      <div style={{ width: AVATAR_SLOT, display: 'flex', justifyContent: 'center' }}>
        {children}
      </div>
      {footer !== undefined && (
        <span
          data-liangxiang-ring-footer=""
          style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            marginTop: '6px',
            transform: 'translateX(-50%)',
            whiteSpace: 'nowrap',
            fontFamily: font.family,
          }}
        >
          {footer}
        </span>
      )}
      {condensedIncense > 0 && (
        <span
          data-liangxiang-condensed={condensedIncense}
          role="status"
          style={{
            position: 'absolute',
            top: '-6px',
            left: '50%',
            transform: 'translate(-50%, 0)',
            padding: '1px 9px',
            borderRadius: '999px',
            background: color.warn,
            color: '#ffffff',
            fontFamily: font.family,
            fontSize: '11px',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            animation: reducedMotion ? undefined : 'liangxiang-condense 1.4s ease-out 1',
          }}
        >
          凝香 +{condensedIncense.toLocaleString('zh-CN')} 炷
        </span>
      )}
    </div>
  )
}
