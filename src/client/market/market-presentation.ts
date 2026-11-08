import type { MarketBatch, MarketBatchId } from '../../shared/market-v1.ts'
import { marketTime } from './chart-model.ts'

const NAMES = ['早盘', '午盘', '晚盘'] as const
const STATUS: Record<MarketBatch['status'], string> = {
  pending: '待开放', open: '可投入', locked: '争梁位', live: '已定梁', settled: '已收盘', void: '已取消',
}

export function marketBatchName(batch: MarketBatchId): string { return NAMES[batch - 1]! }
export function marketBatchStatus(batch: MarketBatch): string { return STATUS[batch.status] }
export function marketHour(at: number, timezone: string): string {
  const time = marketTime(at, timezone)
  return time.endsWith(':00') ? `${Number(time.slice(0, 2))}点` : time
}

export function marketPoolReport(batch: MarketBatch): string {
  const total = BigInt(batch.long_incense) + BigInt(batch.short_incense)
  const head = `${marketBatchName(batch.batch)}香池${formatMarketIncense(total)}炷`
  return total === 0n ? `${head}\n还没有投入，等香火落池～` : head + ([['多', batch.long_incense], ['空', batch.short_incense]] as const)
    .map(([side, count]) => `\n${side}${formatMarketIncense(count)}炷 · ${Number(BigInt(count) * 10000n / total) / 100}%`).join('')
}

/** Presentation only: truncate magnitude without rounding spendable money up. */
export function formatMarketIncense(value: number | bigint): string {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return '--'
  if (!value) return '0'
  const sign = value < 0 ? '-' : '', magnitude = value < 0 ? -value : value, digits = magnitude.toString()
  if (digits.length < 5) return sign + magnitude.toLocaleString('en-US')
  const unit = Math.floor((digits.length - 1) / 4), whole = (digits.length - 1) % 4 + 1
  const leading = digits.slice(0, 4), fraction = leading.slice(whole).replace(/0+$/, '')
  return sign + leading.slice(0, whole) + (fraction ? `.${fraction}` : '')
    + (unit % 2 ? '万' : '') + '亿'.repeat(Math.floor(unit / 2))
}
