import { liangziPolicyForVersion, liangziStateForUpRatio, type ActiveLiangziState } from '../../domain/liangzi.ts'
import { LIANGZI_STATE_LABELS } from '../../shared/index.ts'
import type { VolumeBubble } from './tide-model.ts'

export interface MarketDepthBand {
  state: ActiveLiangziState
  label: string
  low: number
  high: number
  range: string
}

/** A missing case capability is never permission to guess a policy. */
export function marketDepthBands(policyId?: string): MarketDepthBand[] {
  if (policyId === undefined) return []
  try {
    const policy = liangziPolicyForVersion(policyId)
    const edges = [0, ...policy.boundaries, 1]
    return edges.slice(0, -1).map((low, index) => {
      const high = edges[index + 1]!
      const state = liangziStateForUpRatio((low + high) / 2, policy)
      return { state, label: LIANGZI_STATE_LABELS[state], low, high,
        range: high === 1 ? `${Math.round(low * 100)}+` : `${Math.round(low * 100)}–${Math.round(high * 100)}` }
    })
  } catch { return [] }
}

/** Colour/placement decorate only confirmed directional volume, never guess it. */
export function marketBubbleDirection(bubble: Pick<VolumeBubble, 'up' | 'down'>): 'up' | 'down' | null {
  if (bubble.up === null || bubble.down === null || bubble.up === bubble.down) return null
  return bubble.up > bubble.down ? 'up' : 'down'
}
