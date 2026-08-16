/**
 * Tiny synthesized sound cues for 梁标 — no audio assets, Web Audio only.
 * 升梁 / 降梁 / 香火增长 each play a short tone. The on/off flag is a cosmetic
 * preference persisted in localStorage (never an authority).
 */
let enabled = true
try {
  enabled = typeof localStorage === 'undefined' ? true : localStorage.getItem('liangbiao:sound:v1') !== 'off'
} catch {
  /* privacy mode / quota: keep the default */
}

let audioContext: AudioContext | null = null

function context(): AudioContext | null {
  if (!enabled) return null
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
  const osc = ac.createOscillator()
  const envelope = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freqStart, now)
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), now + seconds)
  envelope.gain.setValueAtTime(0.0001, now)
  envelope.gain.exponentialRampToValueAtTime(gain, now + 0.02)
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + seconds)
  osc.connect(envelope)
  envelope.connect(ac.destination)
  osc.start(now)
  osc.stop(now + seconds + 0.05)
}

export function isSoundEnabled(): boolean {
  return enabled
}

export function setSoundEnabled(value: boolean): void {
  enabled = value
  try {
    localStorage.setItem('liangbiao:sound:v1', value ? 'on' : 'off')
  } catch {
    /* ignore */
  }
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
