import { describe, expect, it } from 'vitest'
import {
  MARKET_CACHE_MAX_BYTES, MARKET_CANDLE_INTERVAL_MS, MARKET_RULE_VERSION, MARKET_LEGACY_RULE_VERSION, MARKET_PREVIOUS_RULE_VERSION, MARKET_BATCH_HOURS,
  parseMarketCandlesResponse, parseMarketHistoryResponse, parseMarketPositionRequest,
  parseMarketState, parseMarketWallet, type MarketState,
} from '../src/shared/market-v1.ts'

function state(): MarketState {
  const start = Date.UTC(2026, 0, 1)
  return {
    schema_version: 1, server_time: start + 10 * 3600000, soft_trust: true,
    wallet: { available_incense: 80, frozen_incense: 20, total_incense: 100, token_remainder: 49_000, token_per_incense: 50_000, version: 2 },
    current_point: { case_id: 'case-example', at: start + 10 * 3600000, up_votes: 50, down_votes: 50, sequence: 3 },
    market: {
      id: 'market-example', case_id: 'case-example', business_date: '2026-01-01', timezone: 'UTC', rule_version: MARKET_RULE_VERSION,
      opens_at: start + 7 * 3600000, closes_at: start + 24 * 3600000, status: 'open', close_point: null,
      batches: ([1, 2, 3] as const).map((batch, i) => ({
        batch, opens_at: start + MARKET_BATCH_HOURS[i]![0] * 3600000,
        locks_at: start + MARKET_BATCH_HOURS[i]![1] * 3600000, reference_at: start + MARKET_BATCH_HOURS[i]![2] * 3600000,
        status: batch === 1 ? 'open' : 'pending', reference: null, long_incense: batch === 1 ? 20 : 0,
        short_incense: 0, position: batch === 1 ? { side: 'long', amount: 20, submitted_at: start + 10 * 3600000, payout: null } : null,
        result: null,
      })),
    },
  }
}

describe('market wire authority and transfer boundaries', () => {
  it('keeps each supported recorded rule instead of relabelling old markets with the current rule', () => {
    expect(parseMarketState(state()).market!.rule_version).toBe('liangxiang-market-v3')
    const previous = state()
    previous.market!.rule_version = MARKET_PREVIOUS_RULE_VERSION
    previous.market!.opens_at += 2 * 3_600_000
    previous.market!.batches[0]!.opens_at += 2 * 3_600_000
    expect(parseMarketState(previous).market).toMatchObject({ rule_version: MARKET_PREVIOUS_RULE_VERSION, opens_at: previous.market!.opens_at })
    const legacy = state()
    legacy.market!.rule_version = MARKET_LEGACY_RULE_VERSION
    legacy.market!.opens_at += 2 * 3_600_000
    const day = Date.UTC(2026, 0, 1)
    const hours = [[9, 11, 12], [12, 17, 18], [18, 20, 21]] as const
    legacy.market!.batches = legacy.market!.batches.map((batch, i) => ({ ...batch,
      opens_at: day + hours[i]![0] * 3_600_000, locks_at: day + hours[i]![1] * 3_600_000,
      reference_at: day + hours[i]![2] * 3_600_000 }))
    const parsed = parseMarketState(legacy).market!
    expect(parsed.rule_version).toBe(MARKET_LEGACY_RULE_VERSION)
    expect(parsed.batches.map(batch => batch.reference_at)).toEqual([12, 18, 21].map(hour => day + hour * 3_600_000))
    expect(() => parseMarketState({ ...state(), market: { ...state().market, rule_version: 'liangxiang-market-future' } })).toThrow('policy')
  })

  it('keeps available and frozen separate without deriving either from today usage', () => {
    const parsed = parseMarketState(state())
    expect(parsed.wallet).toMatchObject({ available_incense: 80, frozen_incense: 20, total_incense: 100 })
    expect(() => parseMarketWallet({ ...parsed.wallet, total_incense: 120 })).toThrow()
    expect(() => parseMarketWallet({ ...parsed.wallet, available_incense: -1 })).toThrow()
    expect(() => parseMarketWallet({ ...parsed.wallet, token_remainder: 50_000 })).toThrow()
  })

  it('only accepts complete integer position intents and rejects balance/identity injection', () => {
    const intent = { market_id: 'market-example', batch: 1, side: 'short', amount: 10, request_id: 'request-example' }
    expect(parseMarketPositionRequest(intent)).toEqual(intent)
    for (const patch of [
      { amount: 0.1 }, { amount: -1 }, { amount: Number.MAX_SAFE_INTEGER + 1 },
      { remaining_incense: 1_000 }, { installation_id: 'another-user' },
      { amount: 0 }, { side: null }, { batch: 4 },
    ]) expect(() => parseMarketPositionRequest({ ...intent, ...patch })).toThrow()
    expect(parseMarketPositionRequest({ ...intent, side: null, amount: 0 }).amount).toBe(0)
  })

  it('rejects duplicated batches, crossed timelines and references from a different case', () => {
    const duplicated = state()
    duplicated.market!.batches[2]!.batch = 1
    expect(() => parseMarketState(duplicated)).toThrow()
    const crossed = state()
    crossed.market!.batches[0]!.locks_at = crossed.market!.batches[0]!.reference_at
    expect(() => parseMarketState(crossed)).toThrow()
    const otherCase = state()
    otherCase.market!.batches[0]!.reference = { case_id: 'other-case', at: 1, up_votes: 1, down_votes: 1, sequence: 1 }
    expect(() => parseMarketState(otherCase)).toThrow()
  })

  it('bounds cold history and candles, with no full-community arrays in a wallet snapshot', () => {
    expect(Buffer.byteLength(JSON.stringify(state()))).toBeLessThan(4_000)
    expect(MARKET_CACHE_MAX_BYTES).toBe(2 * 1024 * 1024)
    const candle = { at: 1, open: 0.5, high: 0.6, low: 0.4, close: 0.55, up_votes: 55, down_votes: 45, volume: 100 }
    const response = { schema_version: 1, case_id: 'case-example', business_date: '2026-01-01', interval_ms: MARKET_CANDLE_INTERVAL_MS,
      candles: Array.from({ length: 288 }, (_, i) => ({ ...candle, at: i * MARKET_CANDLE_INTERVAL_MS })), next_cursor: null }
    expect(parseMarketCandlesResponse(response).candles).toHaveLength(288)
    expect(Buffer.byteLength(JSON.stringify(response))).toBeLessThan(55_000)
    expect(() => parseMarketCandlesResponse({ ...response, candles: [...response.candles, { ...candle, at: 288 * MARKET_CANDLE_INTERVAL_MS }] })).toThrow()
    expect(() => parseMarketCandlesResponse({ ...response, candles: [{ ...candle, close: 0.7 }] })).toThrow()
    expect(() => parseMarketHistoryResponse({ schema_version: 1, receipts: Array(51).fill({}), next_cursor: null })).toThrow()
  })

  it('does not accept a receipt whose payout totals or net profit have been edited', () => {
    const receipt = {
      id: 'receipt-example', market_id: 'market-example', business_date: '2026-01-01', settled_at: 100,
      invested_incense: 10, returned_incense: 17, pnl_incense: 7, close_point: null,
      batches: [{ batch: 1, side: 'long', amount: 10, payout: 17, result: 'long', reference: null }],
    }
    const envelope = { schema_version: 1, receipts: [receipt], next_cursor: null }
    expect(parseMarketHistoryResponse(envelope).receipts[0]!.pnl_incense).toBe(7)
    expect(() => parseMarketHistoryResponse({ ...envelope, receipts: [{ ...receipt, returned_incense: 1700 }] })).toThrow()
    expect(() => parseMarketHistoryResponse({ ...envelope, receipts: [{ ...receipt, pnl_incense: 1700 }] })).toThrow()
  })
})
