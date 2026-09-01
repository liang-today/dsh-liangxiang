/**
 * Shared visual tokens for the client half. Keep magic numbers out of
 * Panel.tsx so spacing, radius, and motion stay one vocabulary.
 */
export const space = {
  xxs: 2,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 22,
} as const

export const radius = {
  sm: 8,
  md: 10,
  lg: 12,
  xl: 18,
} as const

export const duration = {
  hintMs: 80,
  flashMs: 520,
  pulseMs: 1100,
  positionMs: 640,
  condenseMs: 1600,
  enterMs: 240,
  crossMs: 520,
} as const

export const NARROW_FRAME_WIDTH = 1024
export const SIDEBAR_ZONE_WIDTH = 280
