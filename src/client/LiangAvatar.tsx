/**
 * LiangAvatar — the concrete central 梁子 figure (NOT a gauge/donut/meter).
 *
 * Artwork is a six-sticker comedy progression of ONE engineer being 夯
 * into an ancestor. Pixels are swappable; state semantics are frozen:
 *
 *   waiting     待开梁  gray unlit placeholder, closed-eye incense
 *   liang_gong  梁工    hard hat + work badge + coffee, still overtime
 *   liang_zong  梁总    navy suit + red tie, fake executive smirk
 *   liang_shen  梁神    crooked halo, levitation, smile going feral
 *   liang_sheng 梁圣    holy robes + rays, still holding a keyboard
 *   liang_zu    梁祖    beard + vermillion 法相, maximum 梁威
 *
 * Presentational only: no hooks, driven entirely by props.
 */
import type { CSSProperties, ReactElement } from 'react'
import type { LiangziState } from '../domain/index.ts'
import { LIANGZI_STATE_LABELS, liangziRatioRangeText } from '../shared/index.ts'
import { color, font } from './theme.ts'
import { LIANGZI_ART } from './liangzi-art.ts'

export interface LiangAvatarProps {
  state: LiangziState
  /** Play one short state-transition pulse (container decides when). */
  pulse: boolean
  reducedMotion: boolean
  /** Rendered size in px (default 92); the portrait is circular-cropped. */
  size?: number
  /** Hide the Chinese state label (the docked badge has no room for it). */
  hideLabel?: boolean
}

const LABEL_COLOR: Record<LiangziState, string> = {
  waiting: '#8a93a2',
  liang_gong: '#5f7d95',
  liang_zong: '#2d3442',
  liang_shen: '#6b5ce7',
  liang_sheng: '#a3801f',
  liang_zu: '#b03a2e',
}

export function LiangAvatar({
  state,
  pulse,
  reducedMotion,
  size = 92,
  hideLabel = false,
}: LiangAvatarProps): ReactElement {
  const waiting = state === 'waiting'
  const rangeText = liangziRatioRangeText(state)
  const stateText = `${LIANGZI_STATE_LABELS[state]}（${rangeText}）`
  const floating = (state === 'liang_shen' || state === 'liang_sheng' || state === 'liang_zu') && !reducedMotion

  const wrapStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    animation: pulse && !reducedMotion ? 'liangbiao-avatar-pulse 0.9s ease-out 1' : undefined,
  }

  const portraitStyle: CSSProperties = {
    width: size,
    height: size,
    objectFit: 'cover',
    borderRadius: '50%',
    display: 'block',
    opacity: waiting ? 0.88 : 1,
    animation: floating ? 'liangbiao-avatar-float 3.2s ease-in-out infinite' : undefined,
  }

  return (
    <div style={wrapStyle} data-liangbiao-avatar={state}>
      <img
        src={LIANGZI_ART[state]}
        alt={`梁子当前状态：${stateText}`}
        width={size}
        height={size}
        draggable={false}
        style={portraitStyle}
      />
      {!hideLabel && (
        <span
          title={`${LIANGZI_STATE_LABELS[state]}：${rangeText}`}
          style={{
            fontFamily: font.family,
            fontSize: size < 80 ? '11px' : '13px',
            fontWeight: 600,
            color: waiting ? color.textTertiary : LABEL_COLOR[state],
            letterSpacing: '0.5px',
          }}
        >
          {LIANGZI_STATE_LABELS[state]}
        </span>
      )}
    </div>
  )
}
