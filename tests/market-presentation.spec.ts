import { describe, expect, it } from 'vitest'
import type { MarketBatch } from '../src/shared/market-v1.ts'
import { formatMarketIncense, marketBatchName, marketBatchStatus, marketHour, marketPoolReport } from '../src/client/market/market-presentation.ts'
import { fishResponse } from '../src/client/market/fish-feedback.ts'

const batch: MarketBatch = { batch: 1, opens_at: 1, locks_at: 2, reference_at: 3, status: 'pending',
  reference: null, long_incense: 0, short_incense: 0, position: null, result: null }

describe('shared market presentation', () => {
  it('shortens whole business hours while preserving non-hour cutoffs and timezone', () => {
    const at = Date.UTC(2026, 10, 8, 16)
    expect(marketHour(at, 'UTC')).toBe('16点')
    expect(marketHour(at + 30 * 60_000, 'UTC')).toBe('16:30')
    expect(marketHour(at, 'Asia/Shanghai')).toBe('0点')
    expect(marketHour(at, 'Asia/Kolkata')).toBe('21:30')
  })

  it('reports actual pool sides and conservative percentages without inventing an empty split', () => {
    const input = { ...batch, batch: 2 as const, long_incense: 30, short_incense: 20 }
    expect(marketPoolReport(input)).toBe('午盘香池50炷\n多30炷 · 60%\n空20炷 · 40%')
    expect(input).toEqual({ ...batch, batch: 2, long_incense: 30, short_incense: 20 })
    expect(marketPoolReport(batch)).toBe('早盘香池0炷\n还没有投入，等香火落池～')
    expect(marketPoolReport({ ...batch, long_incense: 1, short_incense: 2 })).toContain('33.33%\n空2炷 · 66.66%')
    expect(marketPoolReport({ ...batch, short_incense: Number.MAX_SAFE_INTEGER })).toContain('多0炷 · 0%\n空9007万亿炷 · 100%')
    expect(marketPoolReport({ ...batch, long_incense: Number.MAX_SAFE_INTEGER, short_incense: Number.MAX_SAFE_INTEGER }))
      .toBe('早盘香池1.801亿亿炷\n多9007万亿炷 · 50%\n空9007万亿炷 · 50%')
  })

  it('uses the same ordinary names for all three batches and fish responses', () => {
    expect([marketBatchName(1), marketBatchName(2), marketBatchName(3)]).toEqual(['早盘', '午盘', '晚盘'])
    expect(fishResponse('waiting', 'batch1', 0)).toBe('早盘，探个头～')
    expect(fishResponse('waiting', 'batch2', 0)).toBe('午盘，换个姿势看浪。')
    expect(fishResponse('waiting', 'batch3', 0)).toBe('晚盘，打起精神～')
    expect(fishResponse('waiting', 'batch1', 1)).toBe('第一池浪，我来盯着。')
    expect(fishResponse('waiting', 'batch2', 1)).toBe('中场看浪，尾巴不歇。')
    expect(fishResponse('waiting', 'batch3', 1)).toBe('最后一池，也慢慢看。')
  })

  it('describes actual batch status without promising refunds to a spectator', () => {
    const statuses = ['pending', 'open', 'locked', 'live', 'settled', 'void'] as const
    expect(statuses.map(status => marketBatchStatus({ ...batch, status })))
      .toEqual(['待开放', '可投入', '争梁位', '已定梁', '已收盘', '已取消'])
    expect(marketBatchStatus({ ...batch, status: 'settled', result: 'draw' })).toBe('已收盘')
    expect(marketBatchStatus({ ...batch, status: 'void', result: 'void' })).toBe('已取消')
  })

  it('truncates four-digit Chinese units at all boundaries and preserves negative profit signs', () => {
    const examples: Array<[number, string]> = [
      [0, '0'], [999, '999'], [1_000, '1,000'], [9_999, '9,999'],
      [10_000, '1万'], [10_009, '1万'], [10_010, '1.001万'], [12_345, '1.234万'],
      [99_999, '9.999万'], [100_000, '10万'], [100_100, '10.01万'], [999_999, '99.99万'],
      [9_999_999, '999.9万'], [99_999_999, '9999万'], [100_000_000, '1亿'],
      [123_456_789, '1.234亿'], [999_999_999_999, '9999亿'], [1_000_000_000_000, '1万亿'],
      [1_234_567_890_123, '1.234万亿'], [123_456_789_012_345, '123.4万亿'],
      [Number.MAX_SAFE_INTEGER, '9007万亿'],
    ]
    for (const [value, expected] of examples) {
      expect(formatMarketIncense(value)).toBe(expected)
      expect(formatMarketIncense(-value)).toBe(value === 0 ? '0' : `-${expected}`)
    }
    expect(formatMarketIncense(-0)).toBe('0')
  })

  it('keeps maximum-safe and boundary samples conservative without overflow or a fifth significant digit', () => {
    const units: Record<string, bigint> = { '': 1n, 万: 10_000n, 亿: 100_000_000n, 万亿: 1_000_000_000_000n, 亿亿: 10_000_000_000_000_000n }
    const samples: Array<number | bigint> = [Number.MAX_SAFE_INTEGER]
    for (const boundary of [10_000, 100_000, 1_000_000, 100_000_000, 1_000_000_000_000, 9_000_000_000_000_000]) {
      samples.push(boundary - 1, boundary, boundary + 1)
    }
    let seed = 123456789n
    for (let i = 0; i < 512; i++) {
      seed = (seed * 6364136223846793005n + 1n) % BigInt(Number.MAX_SAFE_INTEGER)
      samples.push(Number(seed))
    }
    for (let i = 1n; i <= 1500n; i++) samples.push(i * BigInt(Number.MAX_SAFE_INTEGER))
    for (const value of samples) {
      const text = formatMarketIncense(value), match = /^([\d,]+)(?:\.(\d+))?(万亿|亿亿|亿|万)?$/.exec(text)!
      expect(match).not.toBeNull()
      const digits = match[1]!.replaceAll(',', '') + (match[2] ?? '')
      expect(digits.length).toBeLessThanOrEqual(4)
      const displayed = BigInt(digits) * units[match[3] ?? '']! / (10n ** BigInt(match[2]?.length ?? 0))
      expect(displayed).toBeLessThanOrEqual(BigInt(value))
      expect(displayed).toBeGreaterThan(0n)
      expect(formatMarketIncense(-value)).toBe(`-${text}`)
    }
  })

  it('formats exact cross-candle BigInt totals beyond safe Number range without losing precision', () => {
    const max = BigInt(Number.MAX_SAFE_INTEGER)
    const examples: Array<[bigint, string]> = [
      [0n, '0'], [9999n, '9,999'], [10000n, '1万'], [max, '9007万亿'],
      [9_999_999_999_999_999n, '9999万亿'], [10_000_000_000_000_000n, '1亿亿'],
      [10_000_000_000_000_001n, '1亿亿'], [200n * max, '180.1亿亿'], [1500n * max, '1351亿亿'],
    ]
    for (const [value, expected] of examples) {
      expect(formatMarketIncense(value)).toBe(expected)
      expect(formatMarketIncense(-value)).toBe(value === 0n ? '0' : `-${expected}`)
    }
  })

  it('keeps invalid values out of numeric copy without breaking the market', () => {
    for (const value of [NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, 1.5]) {
      expect(formatMarketIncense(value)).toBe('--')
    }
  })
})
