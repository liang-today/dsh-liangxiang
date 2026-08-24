import { describe, expect, it } from 'vitest'
import { DUMP_ARMED_CHARGE, DUMP_AUTO_RELEASE_MS, DUMP_HOLD_MS, chargeProgress, holdReleaseAction, isAutoRelease, isDumpHold } from '../src/client/vote-charge.ts'

describe('long-press dump charge', () => {
  it('arms the dump well before a full visual charge', () => {
    expect(DUMP_HOLD_MS).toBeLessThan(400)
    expect(isDumpHold(DUMP_HOLD_MS)).toBe(true)
    expect(isDumpHold(DUMP_HOLD_MS - 1)).toBe(false)
    expect(chargeProgress(0)).toBe(0)
    expect(chargeProgress(DUMP_HOLD_MS)).toBeCloseTo(DUMP_ARMED_CHARGE, 8)
    expect(chargeProgress(10_000)).toBe(1)
  })

  it('auto-releases a dump hold after two seconds', () => {
    expect(DUMP_AUTO_RELEASE_MS).toBe(2000)
    expect(DUMP_AUTO_RELEASE_MS).toBeGreaterThan(DUMP_HOLD_MS)
    expect(isAutoRelease(DUMP_AUTO_RELEASE_MS - 1)).toBe(false)
    expect(isAutoRelease(DUMP_AUTO_RELEASE_MS)).toBe(true)
    expect(isDumpHold(DUMP_AUTO_RELEASE_MS)).toBe(true)
  })

  it('dumps only after a full hold; early release revokes the charge', () => {
    expect(holdReleaseAction(0)).toBe('tap')
    expect(holdReleaseAction(DUMP_HOLD_MS - 1)).toBe('tap')
    expect(holdReleaseAction(DUMP_HOLD_MS)).toBe('cancel')
    expect(holdReleaseAction(DUMP_AUTO_RELEASE_MS - 1)).toBe('cancel')
    expect(holdReleaseAction(DUMP_AUTO_RELEASE_MS)).toBe('dump')
  })
})
