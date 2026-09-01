import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SOUND_LEVEL,
  SOUND_LEVEL_GAIN,
  noIncenseCue,
  parseSoundLevel,
} from '../src/client/sound.ts'

describe('volume preference', () => {
  it('defaults to half of the plugin fader when nothing is stored', () => {
    expect(DEFAULT_SOUND_LEVEL).toBe(2)
    expect(SOUND_LEVEL_GAIN[2]).toBe(0.5)
    expect(parseSoundLevel(null)).toBe(2)
    expect(parseSoundLevel('')).toBe(2)
    expect(parseSoundLevel('0')).toBe(0)
  })
})

describe('empty-incense sound cues', () => {
  it('uses different scores for 夯 and 拉', () => {
    const up = noIncenseCue('up')
    const down = noIncenseCue('down')

    expect(up).not.toEqual(down)
    expect(up[0]?.freqEnd).toBeGreaterThan(up[0]?.freqStart ?? 0)
    expect(down[0]?.freqEnd).toBeLessThan(down[0]?.freqStart ?? 0)
  })
})
