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
import { liangQiFloatPeriodMs, type LiangziState } from '../domain/index.ts'
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
  /**
   * `plate` (default, panel): circular-crop the portrait in-place.
   * `none` (docked entry): no filled disc — only the figure bitmap, so a
   * parent chrome layer cannot peek through while the figure bobs.
   */
  chrome?: 'plate' | 'none'
  /**
   * Next-incense fill (`liang_qi_fill`). Drives bob cadence for every
   * Liangzi state: 0 = still, approaching 1 = faster. The motion always
   * lands on the figure, never on a wrapping plate.
   */
  liangQiFill?: number
}

/** GPU-composited bob: integer-pixel ends, no filter, figure layer only. */
const AVATAR_MOTION_CSS = `
@keyframes liangbiao-avatar-pulse {
  0% { transform: scale3d(1, 1, 1); }
  40% { transform: scale3d(1.12, 1.12, 1); }
  100% { transform: scale3d(1, 1, 1); }
}
@keyframes liangbiao-avatar-figure-float {
  0%, 100% { transform: translate3d(0, 0, 0); }
  50% { transform: translate3d(0, -4px, 0); }
}
@media (prefers-reduced-motion: reduce) {
  [data-liangbiao-avatar-figure],
  [data-liangbiao-avatar] {
    animation: none !important;
  }
}
`

export const LIANGZI_LABEL_COLOR: Record<LiangziState, string> = {
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
  chrome = 'plate',
  liangQiFill = 1,
}: LiangAvatarProps): ReactElement {
  const waiting = state === 'waiting'
  const rangeText = liangziRatioRangeText(state)
  const stateText = `${LIANGZI_STATE_LABELS[state]}（${rangeText}）`
  const floatMs = reducedMotion ? null : liangQiFloatPeriodMs(liangQiFill)
  const floating = floatMs !== null

  const wrapStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: size,
    gap: hideLabel ? 0 : '2px',
    overflow: 'visible',
    background: 'transparent',
    animation: pulse && !reducedMotion ? 'liangbiao-avatar-pulse 0.9s ease-out 1' : undefined,
  }

  // Float the figure group only. Never translate a cropped plate / clip box,
  // or a subpixel bob leaves a dark gap where the chrome stayed put.
  const figureStyle: CSSProperties = {
    display: 'block',
    lineHeight: 0,
    overflow: 'visible',
    background: 'transparent',
    transform: 'translateZ(0)',
    backfaceVisibility: 'hidden',
    animation: floating ? `liangbiao-avatar-figure-float ${floatMs}ms ease-in-out infinite` : undefined,
    willChange: floating ? 'transform' : undefined,
  }

  const portraitStyle: CSSProperties = {
    width: size,
    height: size,
    objectFit: 'cover',
    objectPosition: 'center',
    borderRadius: chrome === 'plate' ? '50%' : 0,
    display: 'block',
    background: 'transparent',
    opacity: waiting ? 0.88 : 1,
    // Keep the bitmap on its own compositor layer; do not filter/blur it.
    transform: 'translateZ(0)',
    backfaceVisibility: 'hidden',
    imageRendering: 'auto',
  }

  return (
    <div style={wrapStyle} data-liangbiao-avatar={state} data-liangbiao-avatar-chrome={chrome}>
      <style>{AVATAR_MOTION_CSS}</style>
      <span
        data-liangbiao-avatar-figure=""
        data-liangbiao-float-ms={floatMs ?? 0}
        style={figureStyle}
      >
        <img
          src={LIANGZI_ART[state]}
          alt={`梁子当前状态：${stateText}`}
          width={size}
          height={size}
          draggable={false}
          style={portraitStyle}
        />
      </span>
      {!hideLabel && (
        <span
          title={`${LIANGZI_STATE_LABELS[state]}：${rangeText}`}
          style={{
            fontFamily: font.family,
            fontSize: size < 80 ? '11px' : '13px',
            fontWeight: 600,
            color: waiting ? color.textTertiary : LIANGZI_LABEL_COLOR[state],
            letterSpacing: '0.5px',
          }}
        >
          {LIANGZI_STATE_LABELS[state]}
        </span>
      )}
    </div>
  )
}
