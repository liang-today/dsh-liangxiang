/** Visual 倾炉 arming. Release in this window cancels; it does not dump. */
export const DUMP_HOLD_MS = 280
/** Visual charge reaches full lightning around this mark. */
export const CHARGE_FULL_MS = 900
/** Only a full hold dumps. Early pointerup revokes the charge. */
export const DUMP_AUTO_RELEASE_MS = 1500

export function chargeProgress(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0
  return Math.min(1, elapsedMs / CHARGE_FULL_MS)
}

export function isDumpHold(elapsedMs: number): boolean {
  return Number.isFinite(elapsedMs) && elapsedMs >= DUMP_HOLD_MS
}

export function isAutoRelease(elapsedMs: number): boolean {
  return Number.isFinite(elapsedMs) && elapsedMs >= DUMP_AUTO_RELEASE_MS
}

/** Charge progress at which the button is armed for 倾炉. */
export const DUMP_ARMED_CHARGE = DUMP_HOLD_MS / CHARGE_FULL_MS

export type HoldReleaseAction = 'tap' | 'cancel' | 'dump'

/** Tap = one stick; armed-but-released = revoke; full 1.5s = dump. */
export function holdReleaseAction(elapsedMs: number): HoldReleaseAction {
  if (isAutoRelease(elapsedMs)) return 'dump'
  if (isDumpHold(elapsedMs)) return 'cancel'
  return 'tap'
}
