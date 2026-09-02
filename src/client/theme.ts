/**
 * Style vocabulary for the client half. Structural colors go through DSH
 * semantic tokens so the panel follows light/dark mode. Three restrained
 * 梁祠 accents provide a coherent product identity without recoloring the
 * whole DSH shell.
 */

export const color = {
  bgLayer: 'var(--dsw-alias-bg-layer-2, #ffffff)',
  bgSubtle: 'var(--dsw-alias-bg-layer-3, #f4f5f8)',
  bgHover: 'var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06))',
  border: 'var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.14))',
  textPrimary: 'var(--dsw-alias-label-primary, #1c2130)',
  // DSH's secondary/tertiary tokens are intentionally quiet and can fall
  // just below WCAG AA on the panel's warm layered surfaces. Blend each one
  // toward the host primary label so hierarchy survives in both themes while
  // small text retains a >= 4.5:1 target.
  textSecondary: 'color-mix(in srgb, var(--dsw-alias-label-secondary, #5a6472) 70%, var(--dsw-alias-label-primary, #1c2130))',
  textTertiary: 'color-mix(in srgb, var(--dsw-alias-label-tertiary, #8a93a2) 62%, var(--dsw-alias-label-primary, #1c2130))',
  brand: 'var(--dsw-alias-brand-primary, #4d6bfe)',
  up: 'var(--dsw-alias-brand-primary, #4d6bfe)',
  down: 'var(--dsw-alias-label-secondary, #5a6472)',
  /** Paired button tokens: fill + readable foreground in both themes. */
  buttonPrimaryFill: 'var(--dsw-alias-button-primary-fill, #1c2130)',
  buttonPrimaryText: 'var(--dsw-alias-label-primary-foreground, #ffffff)',
  danger: 'var(--dsw-alias-state-error-primary, #d5484f)',
  warn: 'var(--dsw-alias-state-warn-primary, #d8873a)',
  ritualGold: 'var(--liangxiang-gold, #e2ae54)',
  ritualEmber: 'var(--liangxiang-ember, #c95f38)',
  /** Ember accent adjusted only for small foreground text, not decorative fills. */
  ritualEmberText: 'var(--liangxiang-ember-readable, color-mix(in srgb, var(--liangxiang-ember, #c95f38) 64%, var(--dsw-alias-label-primary, #1c2130)))',
  ritualCool: 'var(--liangxiang-cool, #74839f)',
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
