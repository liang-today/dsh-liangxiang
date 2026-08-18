import { describe, expect, it } from 'vitest'
import { noIncenseCue } from '../src/client/sound.ts'

describe('empty-incense sound cues', () => {
  it('uses different scores for 夯 and 拉', () => {
    const up = noIncenseCue('up')
    const down = noIncenseCue('down')

    expect(up).not.toEqual(down)
    expect(up[0]?.freqEnd).toBeGreaterThan(up[0]?.freqStart ?? 0)
    expect(down[0]?.freqEnd).toBeLessThan(down[0]?.freqStart ?? 0)
  })
})
