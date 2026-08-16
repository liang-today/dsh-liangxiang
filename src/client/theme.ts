/**
 * Style vocabulary for the client half. Every color goes through a DSH
 * `--dsw-*` semantic token (packages/client/ui-theme/src/styles/
 * design-platform.css @ 47f94385) with a static fallback, so the panel
 * follows the active light/dark theme without JS theme detection.
 */

export const color = {
  bgLayer: 'var(--dsw-alias-bg-layer-2, #ffffff)',
  bgSubtle: 'var(--dsw-alias-bg-layer-3, #f4f5f8)',
  bgHover: 'var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06))',
  border: 'var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.14))',
  textPrimary: 'var(--dsw-alias-label-primary, #1c2130)',
  textSecondary: 'var(--dsw-alias-label-secondary, #5a6472)',
  textTertiary: 'var(--dsw-alias-label-tertiary, #8a93a2)',
  brand: 'var(--dsw-alias-brand-primary, #4d6bfe)',
  up: 'var(--dsw-alias-brand-primary, #4d6bfe)',
  down: 'var(--dsw-alias-label-secondary, #5a6472)',
  /** Paired button tokens: fill + readable foreground in both themes. */
  buttonPrimaryFill: 'var(--dsw-alias-button-primary-fill, #1c2130)',
  buttonPrimaryText: 'var(--dsw-alias-label-primary-foreground, #ffffff)',
  danger: 'var(--dsw-alias-state-error-primary, #d5484f)',
  warn: 'var(--dsw-alias-state-warn-primary, #d8873a)',
} as const

/** LiangQi ring stroke color by fill stage: cool -> warm -> vermilion. */
export function ringColorForFill(fill: number): string {
  if (fill >= 0.9) return color.danger
  if (fill >= 0.7) return color.warn
  return color.brand
}

export const font = {
  family: 'var(--dsw-font-family, system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif)',
} as const
