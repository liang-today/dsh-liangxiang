import { describe, expect, it } from 'vitest'
import { DUMP_ARMED_CHARGE, DUMP_HOLD_MS, chargeProgress, isDumpHold } from '../src/client/vote-charge.ts'

describe('long-press dump charge', () => {
  it('arms the dump well before a full visual charge', () => {
    expect(DUMP_HOLD_MS).toBeLessThan(400)
    expect(isDumpHold(DUMP_HOLD_MS)).toBe(true)
    expect(isDumpHold(DUMP_HOLD_MS - 1)).toBe(false)
    expect(chargeProgress(0)).toBe(0)
    expect(chargeProgress(DUMP_HOLD_MS)).toBeCloseTo(DUMP_ARMED_CHARGE, 8)
    expect(chargeProgress(10_000)).toBe(1)
  })
})
