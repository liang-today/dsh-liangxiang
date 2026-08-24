/** Hold this long to dump every spendable stick in one request. */
export const DUMP_HOLD_MS = 280
/** Visual charge reaches full lightning around this mark. */
export const CHARGE_FULL_MS = 900
/** Stop waiting for pointerup and dump the remaining sticks. */
export const DUMP_AUTO_RELEASE_MS = 3000

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
