/**
 * LiangAvatar — the concrete central 梁子 figure (NOT a gauge/donut/meter).
 *
 * Artwork is a six-sticker comedy progression of ONE engineer being 夯
 * into an ancestor. Pixels are swappable; state semantics are frozen:
 *
 *   waiting     待开梁  gray unlit placeholder; plaque in art reads 牢梁
 *   liang_gong  梁工    hard hat + coffee; chest badge reads 梁工
 *   liang_zong  梁总    navy suit + matching 梁总 badge
 *   liang_shen  梁神    crooked halo, levitation, matching 梁神 badge
 *   liang_sheng 梁圣    holy robes + rays, keyboard, matching 梁圣 badge
 *   liang_zu    梁祖    beard + vermillion 法相, matching 梁祖 badge
 *
 * The 牢梁 waiting plaque and matching active-state badges are intentional
 * in-art jokes. They are decorative; the state outside the bitmap remains the
 * authoritative and accessible label.
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
  /** Brief 200–400ms glow when the 梁子 crosses a threshold. */
  crossing?: boolean
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
   * Liangzi state: 0 = slow idle bob, approaching 1 = faster. The motion always
   * lands on the figure, never on a wrapping plate.
   */
  liangQiFill?: number
}

/** GPU-composited bob: integer-pixel ends, no filter, figure layer only. */
const AVATAR_MOTION_CSS = `
[data-liangxiang-avatar],
[data-liangci-dialog] {
  --liangxiang-state-gong-text: #496b82;
  --liangxiang-state-shen-text: #5644cc;
  --liangxiang-state-sheng-text: #745900;
  --liangxiang-state-zu-text: #9d3328;
}
@keyframes liangxiang-avatar-pulse {
  0% { transform: scale3d(1, 1, 1); }
  40% { transform: scale3d(1.2, 1.2, 1); }
  100% { transform: scale3d(1, 1, 1); }
}
@keyframes liangxiang-avatar-cross {
  0% { filter: none; }
  35% { filter: drop-shadow(0 0 18px rgba(226, 174, 84, 0.95)) drop-shadow(0 0 32px rgba(216, 135, 58, 0.55)); }
  100% { filter: none; }
}
@keyframes liangxiang-avatar-figure-float {
  0%, 100% { transform: translate3d(0, 0, 0); }
  50% { transform: translate3d(0, -7px, 0); }
}
@media (prefers-reduced-motion: reduce) {
  [data-liangxiang-avatar-figure],
  [data-liangxiang-avatar] {
    animation: none !important;
  }
}
@media (prefers-color-scheme: dark) {
  [data-liangxiang-avatar],
  [data-liangci-dialog] {
    --liangxiang-state-gong-text: #9bbbd1;
    --liangxiang-state-shen-text: #b8afff;
    --liangxiang-state-sheng-text: #e1c46a;
    --liangxiang-state-zu-text: #f0a093;
  }
}
`

export const LIANGZI_LABEL_COLOR: Record<LiangziState, string> = {
  waiting: color.textTertiary,
  liang_gong: 'var(--liangxiang-state-gong-text, #496b82)',
  liang_zong: color.textPrimary,
  liang_shen: 'var(--liangxiang-state-shen-text, #5644cc)',
  liang_sheng: 'var(--liangxiang-state-sheng-text, #745900)',
  liang_zu: 'var(--liangxiang-state-zu-text, #9d3328)',
}

export function LiangAvatar({
  state,
  pulse,
  crossing = false,
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
    animation: pulse && !reducedMotion
      ? (crossing ? 'liangxiang-avatar-pulse 1.1s ease-out 1, liangxiang-avatar-cross 520ms ease-out 1' : 'liangxiang-avatar-pulse 1.1s ease-out 1')
      : undefined,
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
    animation: floating ? `liangxiang-avatar-figure-float ${floatMs}ms ease-in-out infinite` : undefined,
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
    <div
      style={wrapStyle}
      data-liangxiang-avatar={state}
      data-liangxiang-avatar-chrome={chrome}
      data-crossing={crossing && !reducedMotion ? '' : undefined}
    >
      <style>{AVATAR_MOTION_CSS}</style>
      <span
        data-liangxiang-avatar-figure=""
        data-liangxiang-float-ms={floatMs ?? 0}
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
            color: LIANGZI_LABEL_COLOR[state],
            letterSpacing: '0.5px',
          }}
        >
          {LIANGZI_STATE_LABELS[state]}
        </span>
      )}
    </div>
  )
}
