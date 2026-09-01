/**
 * Tween a public integer so 梁位 / 香火 / 香客 do not snap when the wire jumps.
 * Presentation only. Authority still reads the raw count.
 */
import { useEffect, useReducer, useRef } from 'react'

const TWEEN_TAU_MS = 420

export function useTweenedCount(value: number, reducedMotion: boolean, tauMs = TWEEN_TAU_MS): number {
  const displayedRef = useRef(value)
  const targetRef = useRef(value)
  const [, force] = useReducer((n: number) => n + 1, 0)

  useEffect(() => {
    targetRef.current = value
    if (reducedMotion) {
      displayedRef.current = value
      force()
      return undefined
    }
    let raf = 0
    let last = performance.now()
    const loop = (now: number): void => {
      const dt = Math.min(64, now - last)
      last = now
      const current = displayedRef.current
      const target = targetRef.current
      const next = current + (target - current) * (1 - Math.exp(-dt / tauMs))
      displayedRef.current = Math.abs(next - target) < 0.4 ? target : next
      force()
      if (displayedRef.current !== target) raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [reducedMotion, tauMs, value])

  return reducedMotion ? value : Math.round(displayedRef.current)
}
