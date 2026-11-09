import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SOUND_LEVEL,
  SOUND_LEVEL_GAIN,
  noIncenseCue,
  marketSoundCue,
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

describe('market confirmation sound cues', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules() })

  it('keeps investment, withdrawal and settlement brief, soft and recognisably different', () => {
    const invest = marketSoundCue('invest')
    const withdraw = marketSoundCue('withdraw')
    const settlement = marketSoundCue('settlement')
    expect(invest).not.toEqual(withdraw)
    expect(invest).toHaveLength(2)
    expect(withdraw).toHaveLength(2)
    expect(settlement).toHaveLength(3)
    expect(invest.every(note => note.freqEnd > note.freqStart)).toBe(true)
    expect(withdraw.every(note => note.freqEnd < note.freqStart)).toBe(true)
    for (const score of [invest, withdraw, settlement]) {
      expect(Math.max(...score.map(note => note.delayMs + note.durationMs + 50))).toBeLessThanOrEqual(500)
      for (const note of score) {
        expect(note.type).toBe('sine')
        expect(note.gain).toBeGreaterThan(0)
        expect(note.gain).toBeLessThanOrEqual(0.06)
        expect(note.freqStart).toBeGreaterThanOrEqual(400)
        expect(note.freqEnd).toBeLessThanOrEqual(1200)
      }
    }
  })

  it('never creates an audio context or queues confirmation notes while muted', async () => {
    vi.resetModules(); vi.useFakeTimers()
    const AudioContext = vi.fn()
    vi.stubGlobal('localStorage', { getItem: () => '0' })
    vi.stubGlobal('window', { AudioContext, setTimeout })
    const sound = await import('../src/client/sound.ts')
    sound.playMarketInvest(); sound.playMarketWithdraw(); sound.playMarketSettlement()
    expect(AudioContext).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('uses the shared volume and cancels remaining notes when the user mutes', async () => {
    vi.resetModules(); vi.useFakeTimers()
    const peaks: number[] = []
    const createOscillator = vi.fn(() => ({
      type: 'sine', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {}, start() {}, stop() {},
    }))
    class FakeAudioContext {
      currentTime = 0
      state = 'running'
      destination = {}
      createOscillator = createOscillator
      createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime(value: number) { if (value !== 0.0001) peaks.push(value) } }, connect() {} } }
    }
    vi.stubGlobal('localStorage', { getItem: () => '2', setItem() {} })
    vi.stubGlobal('window', { AudioContext: FakeAudioContext, setTimeout })
    const sound = await import('../src/client/sound.ts')
    sound.playMarketSettlement()
    expect(createOscillator).toHaveBeenCalledTimes(1)
    expect(peaks).toEqual([0.06 * SOUND_LEVEL_GAIN[2]])
    sound.cycleSoundLevel() // 大
    sound.cycleSoundLevel() // 无
    vi.runAllTimers()
    expect(createOscillator).toHaveBeenCalledTimes(1)
    expect(sound.soundLevel()).toBe(0)
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
