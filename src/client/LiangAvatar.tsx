/**
 * LiangAvatar — the concrete central 梁子 figure (NOT a gauge/donut/meter).
 * Original CSS/SVG placeholder artwork; each state is visually distinct and
 * swappable later without touching state semantics:
 *
 *   waiting     待开梁  gray, unlit, dashed low-presence outline
 *   liang_gong  梁工    work badge + hard hat, ordinary worker
 *   liang_zong  梁总    dark suit + tie, executive presence
 *   liang_shen  梁神    golden halo, mild levitation
 *   liang_sheng 梁圣    halo + holy rays
 *   liang_zu    梁祖    ancestor form: aura, rays, beard, maximum 梁威
 *
 * Presentational only: no hooks, driven entirely by props.
 */
import type { CSSProperties, ReactElement } from 'react'
import type { LiangziState } from '../domain/index.ts'
import { LIANGZI_STATE_LABELS } from '../shared/index.ts'
import { color, font } from './theme.ts'

export interface LiangAvatarProps {
  state: LiangziState
  /** Play one short state-transition pulse (container decides when). */
  pulse: boolean
  reducedMotion: boolean
}

interface AvatarPalette {
  skin: string
  body: string
  accent: string
  label: string
  aura: string | null
}

const PALETTES: Record<LiangziState, AvatarPalette> = {
  waiting: { skin: '#b9bec7', body: '#9aa1ac', accent: '#818893', label: '#8a93a2', aura: null },
  liang_gong: { skin: '#f2c9a0', body: '#5f7d95', accent: '#f5b940', label: '#5f7d95', aura: null },
  liang_zong: { skin: '#f2c9a0', body: '#2d3442', accent: '#c0392b', label: '#2d3442', aura: null },
  liang_shen: { skin: '#f6d3a8', body: '#6b5ce7', accent: '#f7c948', label: '#6b5ce7', aura: 'rgba(247, 201, 72, 0.30)' },
  liang_sheng: { skin: '#f8d9b0', body: '#b48f2e', accent: '#f7c948', label: '#a3801f', aura: 'rgba(247, 201, 72, 0.45)' },
  liang_zu: { skin: '#f8d9b0', body: '#8e2f24', accent: '#ffd700', label: '#b03a2e', aura: 'rgba(255, 190, 60, 0.55)' },
}

/** Ray fan used by 梁圣/梁祖 (longer + denser for 梁祖). */
function rays(count: number, length: number, stroke: string): ReactElement[] {
  const items: ReactElement[] = []
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count
    const x1 = 48 + Math.cos(angle) * 30
    const y1 = 40 + Math.sin(angle) * 30
    const x2 = 48 + Math.cos(angle) * (30 + length)
    const y2 = 40 + Math.sin(angle) * (30 + length)
    items.push(<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={2} strokeLinecap="round" opacity={0.8} />)
  }
  return items
}

export function LiangAvatar({ state, pulse, reducedMotion }: LiangAvatarProps): ReactElement {
  const palette = PALETTES[state]
  const waiting = state === 'waiting'
  const floating = (state === 'liang_shen' || state === 'liang_sheng' || state === 'liang_zu') && !reducedMotion

  const wrapStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    animation: pulse && !reducedMotion ? 'liangbiao-avatar-pulse 0.9s ease-out 1' : undefined,
  }

  return (
    <div style={wrapStyle} data-liangbiao-avatar={state}>
      <svg
        width={92}
        height={92}
        viewBox="0 0 96 96"
        role="img"
        aria-label={`梁子当前状态：${LIANGZI_STATE_LABELS[state]}`}
        style={{
          overflow: 'visible',
          animation: floating ? 'liangbiao-avatar-float 3.2s ease-in-out infinite' : undefined,
        }}
      >
        {palette.aura !== null && <circle cx={48} cy={44} r={36} fill={palette.aura} />}
        {state === 'liang_sheng' && rays(10, 8, palette.accent)}
        {state === 'liang_zu' && rays(14, 13, palette.accent)}
        {waiting && (
          <circle cx={48} cy={46} r={40} fill="none" stroke={palette.accent} strokeWidth={1.5} strokeDasharray="4 5" opacity={0.7} />
        )}
        {/* halo */}
        {(state === 'liang_shen' || state === 'liang_sheng' || state === 'liang_zu') && (
          <ellipse cx={48} cy={16} rx={16} ry={4.5} fill="none" stroke={palette.accent} strokeWidth={3} />
        )}
        {/* hard hat (梁工) */}
        {state === 'liang_gong' && (
          <path d="M 33 30 A 15 13 0 0 1 63 30 L 66 30 L 66 33 L 30 33 L 30 30 Z" fill={palette.accent} />
        )}
        {/* head */}
        <circle cx={48} cy={40} r={14} fill={palette.skin} opacity={waiting ? 0.55 : 1} />
        {/* eyes: closed lines while waiting, dots otherwise */}
        {waiting
          ? (
            <g stroke={palette.accent} strokeWidth={1.6} strokeLinecap="round">
              <line x1={41} y1={40} x2={45} y2={40} />
              <line x1={51} y1={40} x2={55} y2={40} />
            </g>
          )
          : (
            <g fill="#2d3442">
              <circle cx={43} cy={39} r={1.7} />
              <circle cx={53} cy={39} r={1.7} />
            </g>
          )}
        {/* beard (梁祖) */}
        {state === 'liang_zu' && (
          <path d="M 41 48 Q 48 62 55 48 L 53 46 Q 48 52 43 46 Z" fill="#e8e3d8" />
        )}
        {/* body */}
        <path
          d="M 30 88 L 30 72 Q 30 58 48 58 Q 66 58 66 72 L 66 88 Z"
          fill={palette.body}
          opacity={waiting ? 0.45 : 1}
        />
        {/* tie (梁总) */}
        {state === 'liang_zong' && (
          <path d="M 46 58 L 50 58 L 49 70 L 48 74 L 47 70 Z" fill={palette.accent} />
        )}
        {/* work badge (梁工) */}
        {state === 'liang_gong' && (
          <rect x={54} y={64} width={9} height={12} rx={1.5} fill="#ffffff" stroke={palette.accent} strokeWidth={1.2} />
        )}
        {/* robe trim (梁圣/梁祖) */}
        {(state === 'liang_sheng' || state === 'liang_zu') && (
          <path d="M 44 58 L 48 88 L 52 58 Q 48 61 44 58 Z" fill={palette.accent} opacity={0.85} />
        )}
      </svg>
      <span
        style={{
          fontFamily: font.family,
          fontSize: '13px',
          fontWeight: 600,
          color: waiting ? color.textTertiary : palette.label,
          letterSpacing: '0.5px',
        }}
      >
        {LIANGZI_STATE_LABELS[state]}
      </span>
    </div>
  )
}
