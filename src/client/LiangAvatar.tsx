/**
 * LiangAvatar — the concrete central 梁子 figure (NOT a gauge/donut/meter).
 *
 * Artwork is a seven-sticker comedy progression of ONE engineer being 夯
 * into an ancestor. Pixels are swappable; state semantics are versioned:
 *
 *   waiting     待开梁  gray unlit placeholder; plaque in art reads 牢梁
 *   xiao_nan_liang 小难梁 dusty-pink hoodie, small bow, bashful expression
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
import { liangQiFloatPeriodMs, liangziPolicyForVersion, LIANGZI_POLICY_VERSION, type LiangziState } from '../domain/index.ts'
import { LIANGZI_STATE_LABELS, liangziRatioRangeText } from '../shared/index.ts'
import { color, font } from './theme.ts'
import { LIANGZI_ART } from './liangzi-art.ts'

export interface LiangAvatarProps {
  state: LiangziState
  policyVersion?: string
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
  /** Main blue panel only: soften residual pale sticker edges, never native halos. */
  cleanEdge?: boolean
}

/** GPU-composited bob: integer-pixel ends, no filter, figure layer only. */
const AVATAR_MOTION_CSS = `
[data-liangxiang-avatar],
[data-liangci-dialog] {
  --liangxiang-state-nan-text: light-dark(#456a9e, #bed8ff);
  --liangxiang-state-gong-text: light-dark(#496b82, #9bbbd1);
  --liangxiang-state-shen-text: light-dark(#5644cc, #b8afff);
  --liangxiang-state-sheng-text: light-dark(#745900, #e1c46a);
  --liangxiang-state-zu-text: light-dark(#9d3328, #f0a093);
}
@keyframes liangxiang-avatar-pulse {
  0% { transform: scale3d(1, 1, 1); }
  40% { transform: scale3d(1.2, 1.2, 1); }
  100% { transform: scale3d(1, 1, 1); }
}
@keyframes liangxiang-avatar-cross {
  0% { filter: none; }
  35% { filter: drop-shadow(0 0 18px color-mix(in srgb, var(--liangxiang-main-blue, #5879bf) 95%, transparent)) drop-shadow(0 0 32px color-mix(in srgb, var(--liangxiang-main-water, #9dc6f6) 55%, transparent)); }
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
`

export const LIANGZI_LABEL_COLOR: Record<LiangziState, string> = {
  waiting: color.textTertiary,
  xiao_nan_liang: 'var(--liangxiang-state-nan-text, #456a9e)',
  liang_gong: 'var(--liangxiang-state-gong-text, #496b82)',
  liang_zong: color.textPrimary,
  liang_shen: 'var(--liangxiang-state-shen-text, #5644cc)',
  liang_sheng: 'var(--liangxiang-state-sheng-text, #745900)',
  liang_zu: 'var(--liangxiang-state-zu-text, #9d3328)',
}

export function LiangAvatar({
  state,
  policyVersion = LIANGZI_POLICY_VERSION,
  pulse,
  crossing = false,
  reducedMotion,
  size = 92,
  hideLabel = false,
  chrome = 'plate',
  liangQiFill = 1,
  cleanEdge = false,
}: LiangAvatarProps): ReactElement {
  const waiting = state === 'waiting'
  const rangeText = liangziRatioRangeText(state, liangziPolicyForVersion(policyVersion))
  const stateText = `${LIANGZI_STATE_LABELS[state]}（${rangeText}）`
  const floatMs = reducedMotion ? null : liangQiFloatPeriodMs(liangQiFill)
  const floating = floatMs !== null

  const wrapStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: size,
    flexShrink: 0,
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
    filter: cleanEdge && ['liang_gong', 'liang_zong', 'liang_zu'].includes(state)
      ? 'url(#liangxiang-main-portrait-edge)' : undefined,
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

/** Only the pale outer rim is touched. Shen/Sheng retain their complete native halos. */
export function MainPortraitEdges(): ReactElement {
  return <svg aria-hidden="true" width="0" height="0" style={{ position: 'absolute', overflow: 'hidden', pointerEvents: 'none' }}>
    <defs><filter id="liangxiang-main-portrait-edge" x="-3%" y="-3%" width="106%" height="106%" colorInterpolationFilters="sRGB">
      <feMorphology in="SourceAlpha" operator="erode" radius="0.3" result="inner" />
      <feComposite in="SourceAlpha" in2="inner" operator="out" result="rim" />
      <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 1 0 0" result="blueMask" />
      <feComponentTransfer in="blueMask" result="paleMask"><feFuncA type="linear" slope="6" intercept="-3.7" /></feComponentTransfer>
      <feComposite in="rim" in2="paleMask" operator="in" result="paleRim" />
      <feComposite in="SourceAlpha" in2="paleRim" operator="out" result="cutout" />
      <feGaussianBlur in="cutout" stdDeviation="0.12" result="softAlpha" />
      <feComposite in="SourceGraphic" in2="softAlpha" operator="in" />
    </filter></defs>
  </svg>
}
