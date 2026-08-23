import { describe, expect, it } from 'vitest'
import { deriveLocalEpithet, recordLocalEpithetVote } from '../src/domain/index.ts'

describe('local-only 梁号', () => {
  it('starts as 旁观·闲梁 before any stick is spent', () => {
    expect(deriveLocalEpithet({ up: 0, down: 0 })).toEqual({
      dedication: '旁观',
      stance: '闲梁',
      label: '旁观·闲梁',
      spent: 0,
    })
  })

  it('stacks dedication and stance from local 夯/拉 counts', () => {
    expect(deriveLocalEpithet({ up: 20, down: 0 }).label).toBe('勤香·死夯梁')
    expect(deriveLocalEpithet({ up: 1, down: 18 }).label).toBe('日课·死拉梁')
    expect(deriveLocalEpithet({ up: 10, down: 9 }).label).toBe('日课·骑墙梁')
    expect(deriveLocalEpithet({ up: 70, down: 20 }).label).toBe('倾炉·铁夯梁')
    expect(deriveLocalEpithet({ up: 160, down: 80 }).label).toBe('焚尽·偏夯梁')
    expect(deriveLocalEpithet({ up: 30, down: 270 }).label).toBe('香疯·死拉梁')
  })

  it('records a dump onto the matching side', () => {
    const after = recordLocalEpithetVote({ up: 2, down: 1 }, 'up', 12)
    expect(after).toEqual({ up: 14, down: 1 })
    expect(recordLocalEpithetVote(after, 'down', 0)).toEqual(after)
  })
})
