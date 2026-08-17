import { describe, expect, it } from 'vitest'
import {
  INCENSE_WEIGHT_SCALE,
  canonicalModelId,
  incenseWeightBpsForModel,
  scaleTokensByWeightBps,
} from '../src/domain/incense-weight.ts'
import { creditObservedUsage, EMPTY_DAILY_USAGE } from '../src/host/usage-ledger.ts'
import { readSessionModelId } from '../src/compat/dsh/session-route.ts'

describe('canonicalModelId', () => {
  it('strips a context-window suffix', () => {
    expect(canonicalModelId('deepseek-v4-pro[1m]')).toBe('deepseek-v4-pro')
  })
})

describe('incenseWeightBpsForModel', () => {
  it('rates Pro at 1 and Flash at 0.5', () => {
    expect(incenseWeightBpsForModel('deepseek-v4-pro')).toBe(INCENSE_WEIGHT_SCALE)
    expect(incenseWeightBpsForModel('deepseek-v4-flash')).toBe(INCENSE_WEIGHT_SCALE / 2)
    expect(incenseWeightBpsForModel('deepseek-v4-pro[1m]')).toBe(INCENSE_WEIGHT_SCALE)
  })

  it('rates missing, unknown, and every other non-Pro id like Flash', () => {
    expect(incenseWeightBpsForModel(null)).toBe(INCENSE_WEIGHT_SCALE / 2)
    expect(incenseWeightBpsForModel(undefined)).toBe(INCENSE_WEIGHT_SCALE / 2)
    expect(incenseWeightBpsForModel('deepseek-chat')).toBe(INCENSE_WEIGHT_SCALE / 2)
    expect(incenseWeightBpsForModel('some-future-model')).toBe(INCENSE_WEIGHT_SCALE / 2)
  })
})

describe('scaleTokensByWeightBps', () => {
  it('carries Flash fractions so 1+1 raw tokens become 1 equivalent', () => {
    const first = scaleTokensByWeightBps(1, INCENSE_WEIGHT_SCALE / 2, 0)
    expect(first.scaled).toBe(0)
    expect(first.carry).toBe(5_000)
    const second = scaleTokensByWeightBps(1, INCENSE_WEIGHT_SCALE / 2, first.carry)
    expect(second.scaled).toBe(1)
    expect(second.carry).toBe(0)
  })
})

describe('creditObservedUsage', () => {
  it('halves Flash deltas and leaves Pro unchanged', () => {
    const flash = creditObservedUsage(EMPTY_DAILY_USAGE, 100_000, 0, 'deepseek-v4-flash', 1)
    expect(flash.inputTokens + flash.outputTokens).toBe(50_000)
    const pro = creditObservedUsage(EMPTY_DAILY_USAGE, 50_000, 0, 'deepseek-v4-pro', 1)
    expect(pro.inputTokens + pro.outputTokens).toBe(50_000)
  })

  it('halves unknown-model and missing-route deltas', () => {
    const unknown = creditObservedUsage(EMPTY_DAILY_USAGE, 100_000, 0, 'some-future-model', 1)
    expect(unknown.inputTokens + unknown.outputTokens).toBe(50_000)
    const missing = creditObservedUsage(EMPTY_DAILY_USAGE, 100_000, 0, null, 1)
    expect(missing.inputTokens + missing.outputTokens).toBe(50_000)
  })
})

describe('readSessionModelId', () => {
  it('prefers requestHeader.config.model', () => {
    const id = readSessionModelId({
      id: 's1',
      firstLiveSeq: 0,
      requestHeader: () => ({ config: { provider: 'deepseek-official', model: 'deepseek-v4-flash' } }),
    })
    expect(id).toBe('deepseek-v4-flash')
  })

  it('falls back to requestContext.model', () => {
    const id = readSessionModelId({
      id: 's1',
      firstLiveSeq: 0,
      requestContext: () => ({ provider: 'deepseek-official', model: 'deepseek-v4-pro' }),
    })
    expect(id).toBe('deepseek-v4-pro')
  })

  it('returns null when the stub has no route', () => {
    expect(readSessionModelId({ id: 's1', firstLiveSeq: 0 })).toBeNull()
  })
})
