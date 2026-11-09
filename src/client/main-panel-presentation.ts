/**
 * Compact main-panel incense, using the approved four-significant-digit,
 * two-decimal ceiling. Integer division deliberately never rounds money up.
 * Exact integers belong in the corresponding accessible labels.
 */
export function formatMainIncense(value: number | bigint): string {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return '--'
  const n = BigInt(value)
  const sign = n < 0n ? '-' : ''
  const magnitude = n < 0n ? -n : n
  if (magnitude < 1_000n) return sign + String(magnitude)
  let scale = 1_000n
  let suffix = 'K'
  if (magnitude >= 10_000n) {
    scale = 10_000n
    let unit = 1
    while (magnitude >= scale * 10_000n) { scale *= 10_000n; unit++ }
    suffix = (unit % 2 ? '万' : '') + '亿'.repeat(Math.floor(unit / 2))
  }
  const wholeDigits = String(magnitude / scale).length
  const decimals = Math.max(0, Math.min(2, 4 - wholeDigits))
  const factor = 10n ** BigInt(decimals)
  const scaled = magnitude * factor / scale
  const whole = String(scaled / factor)
  const fraction = decimals === 0 ? '' : String(scaled % factor).padStart(decimals, '0').replace(/0+$/, '')
  return sign + whole + (fraction ? '.' + fraction : '') + suffix
}
