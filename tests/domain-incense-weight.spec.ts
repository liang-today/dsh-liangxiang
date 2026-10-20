import { describe, expect, it } from 'vitest'
import {
  INCENSE_WEIGHT_SCALE,
  canonicalModelId,
  incenseWeightBpsForModel,
  scaleTokensByWeightBps,
  DEFAULT_INCENSE_WEIGHT_POLICY,
  parseIncenseWeightPolicy,
  incenseWeightRows,
} from '../src/domain/incense-weight.ts'
import { creditObservedUsage, EMPTY_DAILY_USAGE } from '../src/host/usage-ledger.ts'
import { readSessionModelId } from '../src/compat/dsh/session-route.ts'
import { createBackendFixture } from './helpers/backend.ts'
import { parseV1Bootstrap } from '../src/shared/backend-v1.ts'

describe('canonicalModelId', () => {
  it('strips a context-window suffix', () => {
    expect(canonicalModelId('deepseek-v4-pro[1m]')).toBe('deepseek-v4-pro')
    expect(canonicalModelId(' DEEPSEEK-V4.1-PRO[128K] ')).toBe('deepseek-v4.1-pro')
    expect(canonicalModelId('deepseek-v4-pro[1000000]')).toBe('deepseek-v4-pro')
  })

  it('does not strip arbitrary labels, broken brackets, or trailing text', () => {
    for (const id of ['deepseek-v4-pro[preview]', 'deepseek-v4-pro[1m', 'deepseek-v4-pro[1m] unknown']) {
      expect(canonicalModelId(id)).toBe(id)
    }
  })
})

describe('optional bootstrap model rules', () => {
  it('keeps a usable bootstrap when optional rules are malformed, and accepts an old backend without them', () => {
    const f = createBackendFixture()
    try {
      const bootstrap = f.service.bootstrap('model-rules-parse-install')
      const invalid = parseV1Bootstrap({ ...bootstrap, token_policy: { ...bootstrap.token_policy, model_weights: { revision: 99, rules: 'bad' } } })
      expect(invalid.token_policy.model_weights_invalid).toBe(true)
      expect(invalid.authoritative_personal_state).toEqual(bootstrap.authoritative_personal_state)
      const { model_weights: _weights, ...oldTokenPolicy } = bootstrap.token_policy
      expect(parseV1Bootstrap({ ...bootstrap, token_policy: oldTokenPolicy }).token_policy.model_weights).toBeUndefined()
    } finally { f.close() }
  })
})

describe('incenseWeightBpsForModel', () => {
  it('keeps every numbered Pro at full rate without depending on the version', () => {
    for (const model of ['deepseek-pro', 'deepseek-v4.1-pro', 'deepseek-v4.2-pro', 'deepseek-v4.3-pro', 'deepseek-v5-pro', ' DEEPSEEK-V5-PRO[1m] ']) {
      expect(incenseWeightBpsForModel(model)).toBe(INCENSE_WEIGHT_SCALE)
    }
    expect(incenseWeightBpsForModel('another-provider-pro')).toBe(5_000)
    expect(incenseWeightBpsForModel('prefix-deepseek-v5-pro')).toBe(5_000)
  })

  it('keeps every Flash version and alias at half rate, with no provider exceptions', () => {
    for (const model of ['deepseek-v4-flash', 'deepseek-v4-flash-vision-exp', 'deepseek-v4.1-flash', 'deepseek-v4.1-flash-1017', 'deepseek-v4.1-flash-expires-on-0910', 'deepseek-v4.2-flash', 'deepseek-v4.3-flash', 'deepseek-v5-flash', 'deepseek-flash', ' DEEPSEEK-FLASH[1m] ']) {
      expect(incenseWeightBpsForModel(model)).toBe(5_000)
    }
  })

  it('keeps display labels, namespaced ids and malformed Pro lookalikes at the conservative fallback', () => {
    for (const model of [
      'DeepSeek V4.1 Pro', 'DeepSeek V4.1 Pro (1017)', 'deepseek-ai/DeepSeek-V4.1-Pro',
      'deepseek-v4-pro[preview]', 'deepseek-v4-pro[1m', 'deepseek-v4-pro[1m] unknown',
      'deepseek-v4-pro[1m][1m]', 'deepseek-v4.1 pro', 'deepseek-unknown model-pro',
      `deepseek-${'v'.repeat(160)}-pro`,
    ]) {
      expect(incenseWeightBpsForModel(model)).toBe(5_000)
    }
  })

  it('derives concise family labels and thresholds from the static rule data', () => {
    expect(parseIncenseWeightPolicy(DEFAULT_INCENSE_WEIGHT_POLICY)).toEqual(DEFAULT_INCENSE_WEIGHT_POLICY)
    expect(incenseWeightRows(DEFAULT_INCENSE_WEIGHT_POLICY, 60_000)).toEqual([
      { model: 'Flash', weight: '×0.5', stick: '12W Token/炷' },
      { model: 'Pro', weight: '×1', stick: '6W Token/炷' },
      { model: '其它', weight: '×0.5', stick: '12W Token/炷' },
    ])
    expect(() => parseIncenseWeightPolicy({ ...DEFAULT_INCENSE_WEIGHT_POLICY, rules: [{ label: 'bad', model: '^(.+)+$', weightBps: 10_000 }] })).toThrow()
    expect(() => parseIncenseWeightPolicy({ ...DEFAULT_INCENSE_WEIGHT_POLICY, fallbackWeightBps: 20_000 })).toThrow()
  })
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
  it('keeps safe-integer boundary arithmetic exact without multiplying the entire count', () => {
    expect(scaleTokensByWeightBps(Number.MAX_SAFE_INTEGER, 10_000, 0)).toEqual({ scaled: Number.MAX_SAFE_INTEGER, carry: 0 })
    expect(scaleTokensByWeightBps(Number.MAX_SAFE_INTEGER, 5_000, 0)).toEqual({ scaled: Math.floor(Number.MAX_SAFE_INTEGER / 2), carry: 5_000 })
  })
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
