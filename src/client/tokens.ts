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
  hintMs: 40,
  flashMs: 320,
  pulseMs: 950,
  positionMs: 520,
  condenseMs: 1400,
} as const

export const PANEL_MAX_HEIGHT_REGULAR = 440
export const PANEL_COMPACT_VIEWPORT_HEIGHT = 560
export const PANEL_COMPACT_VIEWPORT_WIDTH = 720
export const NARROW_FRAME_WIDTH = 1024
export const SIDEBAR_ZONE_WIDTH = 280
