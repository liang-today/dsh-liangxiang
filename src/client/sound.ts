/**
 * Tiny synthesized sound cues for 梁相 — no audio assets, Web Audio only.
 * 升梁 / 降梁 / 香火增长 / 梁子换态 each play a short tone. Volume is a
 * 4-step cosmetic preference (0=无, 1=小 33%, 2=中 66%, 3=大 100%) persisted
 * in localStorage; it scales the synthesized gain only — it never touches
 * system volume.
 */
import type { LiangziState, VoteType } from '../domain/index.ts'
import { LIANGZI_STATES } from '../domain/index.ts'
export type SoundLevel = 0 | 1 | 2 | 3

const LEVEL_GAIN: Record<SoundLevel, number> = { 0: 0, 1: 0.33, 2: 0.66, 3: 1 }
const STORAGE_KEY = 'liangxiang:sound:level'

/** Fresh install / no preference: muted. A stored 1–3 is kept. */
let level: SoundLevel = 0
try {
  const stored = typeof localStorage === 'undefined'
    ? null
    : localStorage.getItem(STORAGE_KEY)
  if (stored !== null) {
    const parsed = Number(stored)
    if (parsed === 0 || parsed === 1 || parsed === 2 || parsed === 3) level = parsed as SoundLevel
  }
} catch {
  /* privacy mode / quota: keep default mute */
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

/**
 * Preview the level just selected: same gain table as real cues.
 * Mute plays nothing — the crossed-out icon is the confirmation.
 */
export function playVolumePreview(): void {
  if (level === 0) return
  tone(784, 784, 120, 'sine', 0.1)
}

/** 升梁: a short rising chirp. */
export function playVoteUp(): void {
  tone(420, 840, 160, 'triangle', 0.09)
}

/** 降梁: a short falling chirp. */
export function playVoteDown(): void {
  tone(640, 320, 180, 'triangle', 0.09)
}

/** Long-press dump: the click cue plus a short lightning crack. */
export function playVoteDump(voteType: VoteType): void {
  if (voteType === 'up') playVoteUp()
  else playVoteDown()
  window.setTimeout(() => tone(1680, 180, 140, 'square', 0.09), 30)
  window.setTimeout(() => tone(2400, 90, 110, 'sawtooth', 0.07), 80)
  window.setTimeout(() => tone(320, 90, 220, 'triangle', 0.06), 130)
}

export interface NoIncenseTone {
  delayMs: number
  freqStart: number
  freqEnd: number
  durationMs: number
  type: OscillatorType
  gain: number
}

/** Pure cue score so the two empty-pool directions stay testably distinct. */
export function noIncenseCue(voteType: VoteType): readonly NoIncenseTone[] {
  return voteType === 'up'
    ? [
        { delayMs: 0, freqStart: 310, freqEnd: 465, durationMs: 95, type: 'square', gain: 0.05 },
        { delayMs: 76, freqStart: 430, freqEnd: 175, durationMs: 245, type: 'sawtooth', gain: 0.045 },
      ]
    : [
        { delayMs: 0, freqStart: 245, freqEnd: 130, durationMs: 145, type: 'sawtooth', gain: 0.05 },
        { delayMs: 118, freqStart: 118, freqEnd: 62, durationMs: 255, type: 'triangle', gain: 0.055 },
      ]
}

/** Empty pool: 升梁 tries to rise then falls; 降梁 drops in two low steps. */
export function playNoIncense(voteType: VoteType): void {
  for (const cue of noIncenseCue(voteType)) {
    const play = (): void => tone(cue.freqStart, cue.freqEnd, cue.durationMs, cue.type, cue.gain)
    if (cue.delayMs === 0) play()
    else window.setTimeout(play, cue.delayMs)
  }
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
