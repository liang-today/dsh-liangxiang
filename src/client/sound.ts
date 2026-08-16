/**
 * Tiny synthesized sound cues for 梁标 — no audio assets, Web Audio only.
 * 升梁 / 降梁 / 香火增长 / 梁子换态 each play a short tone. Volume is a
 * 4-step cosmetic preference (0=无, 1=小 33%, 2=中 66%, 3=大 100%) persisted
 * in localStorage; it scales the synthesized gain only — it never touches
 * system volume.
 */
import type { LiangziState } from '../domain/index.ts'
import { LIANGZI_STATES } from '../domain/index.ts'
export type SoundLevel = 0 | 1 | 2 | 3

const LEVEL_GAIN: Record<SoundLevel, number> = { 0: 0, 1: 0.33, 2: 0.66, 3: 1 }
const STORAGE_KEY = 'liangbiao:sound:level'
const LEGACY_KEY = 'liangbiao:sound:v1'

let level: SoundLevel = 3
try {
  const stored = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY)
  if (stored !== null) {
    const parsed = Number(stored)
    if (parsed === 0 || parsed === 1 || parsed === 2 || parsed === 3) level = parsed as SoundLevel
  } else if (typeof localStorage !== 'undefined' && localStorage.getItem(LEGACY_KEY) === 'off') {
    level = 0
  }
} catch {
  /* privacy mode / quota: keep default */
}

let audioContext: AudioContext | null = null

function context(): AudioContext | null {
  if (level === 0) return null
  try {
    if (audioContext === null) {
      audioContext = new window.AudioContext()
    }
    if (audioContext.state === 'suspended') void audioContext.resume()
    return audioContext
  } catch {
    return null
  }
}

function tone(
  freqStart: number,
  freqEnd: number,
  durationMs: number,
  type: OscillatorType = 'sine',
  gain = 0.08,
): void {
  const ac = context()
  if (ac === null) return
  const now = ac.currentTime
  const seconds = durationMs / 1000
  const peak = gain * LEVEL_GAIN[level]
  const osc = ac.createOscillator()
  const envelope = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freqStart, now)
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), now + seconds)
  envelope.gain.setValueAtTime(0.0001, now)
  envelope.gain.exponentialRampToValueAtTime(peak, now + 0.02)
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + seconds)
  osc.connect(envelope)
  envelope.connect(ac.destination)
  osc.start(now)
  osc.stop(now + seconds + 0.05)
}

export function soundLevel(): SoundLevel {
  return level
}

/** Cycle 无 -> 小 -> 中 -> 大 -> 无 … and persist. Returns the new level. */
export function cycleSoundLevel(): SoundLevel {
  level = ((level + 1) % 4) as SoundLevel
  try {
    localStorage.setItem(STORAGE_KEY, String(level))
  } catch {
    /* ignore */
  }
  return level
}

/** 升梁: a short rising chirp. */
export function playVoteUp(): void {
  tone(420, 840, 160, 'triangle', 0.09)
}

/** 降梁: a short falling chirp. */
export function playVoteDown(): void {
  tone(640, 320, 180, 'triangle', 0.09)
}

/** 香火增长 / 凝香: a soft two-note chime. */
export function playIncenseEarn(): void {
  tone(660, 660, 90, 'sine', 0.08)
  window.setTimeout(() => tone(990, 990, 140, 'sine', 0.07), 90)
}

const LIANGZI_RANK: Record<LiangziState, number> = {
  waiting: 0,
  liang_gong: 1,
  liang_zong: 2,
  liang_shen: 3,
  liang_sheng: 4,
  liang_zu: 5,
}

/** Central 梁子 crossed a threshold: rising fanfare up, falling sigh down. */
export function playLiangziShift(from: LiangziState, to: LiangziState): void {
  if (from === to) return
  if (!(LIANGZI_STATES as readonly string[]).includes(from)) return
  if (!(LIANGZI_STATES as readonly string[]).includes(to)) return
  if (to === 'waiting') {
    tone(520, 180, 280, 'sine', 0.07)
    return
  }
  if (from === 'waiting' || LIANGZI_RANK[to] > LIANGZI_RANK[from]) {
    tone(392, 587, 140, 'triangle', 0.08)
    window.setTimeout(() => tone(587, 784, 200, 'triangle', 0.09), 120)
    return
  }
  tone(698, 349, 260, 'triangle', 0.08)
}
