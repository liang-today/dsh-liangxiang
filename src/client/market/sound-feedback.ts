import type { MarketPosition, MarketReceipt, MarketSide, MarketState } from '../../shared/market-v1.ts'

/** Confirmed whole-position changes only; drafts, failures and no-ops are silent. */
export function positionSound(before: MarketPosition | null, after: MarketPosition | null, side: MarketSide | null, amount: number, confirmed: boolean): 'invest' | 'withdraw' | null {
  if (!confirmed) return null
  if (side === null) return before && !after && amount === 0 ? 'withdraw' : null
  return after?.side === side && after.amount === amount && (before?.side !== side || before.amount !== amount) ? 'invest' : null
}

/** Observe the current live market, never infer a payout from a wallet delta. */
export function createSettlementSoundTracker() {
  let previous: MarketState | null = null, identity = '', pending = ''
  const heard = new Set<string>()
  return (state: MarketState | null, scope: string, receipts: readonly MarketReceipt[], active: boolean): boolean => {
    const old = previous, same = scope === identity
    previous = state; identity = scope
    if (!same) heard.clear()
    if (!active || !same || !old || !state) { pending = ''; return false }
    const market = old.market
    if (market?.status === 'open' && (market.id !== state.market?.id || state.market?.status !== 'open') && market.batches.some(batch => batch.position !== null)) pending = market.id
    const receipt = receipts.find(item => item.market_id === pending)
    if (!receipt) return false
    pending = ''
    if (heard.has(receipt.id)) return false
    heard.add(receipt.id)
    if (heard.size > 8) heard.delete(heard.values().next().value!)
    return receipt.returned_incense > 0
  }
}
