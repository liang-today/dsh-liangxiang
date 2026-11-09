import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { HOVER_TEXT } from '../shared/index.ts'
import { type BadgePoint, type Viewport } from './badge-position.ts'
import { placeBadgeFeedback, placeBadgeSpeech, reconcileBadgeComments, SPEECH_ROW_HEIGHT, type BadgeComment, type FeedbackRect, type PresentedComment } from './badge-feedback.ts'
import { SQUISH_EXIT_MS } from './badge-squish.ts'
import { font } from './theme.ts'
import { MAIN_PANEL_THEME_CSS, mainColor } from './main-panel-theme.ts'

interface Props { position: BadgePoint, viewport: Viewport, open: boolean, comments: BadgeComment[], suppressed: boolean, reducedMotion: boolean }
const css = `
${MAIN_PANEL_THEME_CSS}
[~feedback] { font: 500 11px/18px ${font.family}; }
[~badge-tooltip] {
  position: fixed; width: max-content; padding: 4px 8px; border: 1px solid ${mainColor.line}; border-radius: 8px;
  background: ${mainColor.paper}; color: ${mainColor.deep}; font-size: 11px; line-height: 18px;
  opacity: 0; transition: opacity 100ms ease;
}
[~root]:has([~badge]:hover, [~badge]:focus-visible) [~badge-tooltip][data-suppressed="false"] { opacity: 1; transition-delay: 180ms; }
[~root]:has([data-squish-pressed="true"], [~danmu]) [~badge-tooltip] { opacity: 0 !important; transition-delay: 0ms; }
[~root]:has([data-dragging="true"]) [~feedback] { opacity: 0; }
[~danmu] { position: fixed; pointer-events: none; }
[~danmu-row] {
  position: absolute; top: 0; width: 100%; display: flex; opacity: 1;
  transition: transform 300ms cubic-bezier(.22,.8,.22,1), opacity ${SQUISH_EXIT_MS}ms cubic-bezier(.3,0,.5,1);
}
[~danmu][data-align="start"] [~danmu-row] { justify-content: flex-start; }
[~danmu][data-align="center"] [~danmu-row] { justify-content: center; }
[~danmu][data-align="end"] [~danmu-row] { justify-content: flex-end; }
[~danmu-row][data-exiting="true"] {
  opacity: 0;
  transition-duration: 300ms, ${SQUISH_EXIT_MS}ms;
  transition-timing-function: cubic-bezier(.22,.8,.22,1), cubic-bezier(.3,0,.5,1);
}
[~danmu-line] {
  display: block; width: max-content; max-width: 100%; box-sizing: border-box; padding: 1px 7px;
  white-space: nowrap; border-radius: 6px; color: ${mainColor.deep};
  background: ${mainColor.soft};
  box-shadow: 0 2px 6px rgba(0,0,0,.08), inset 0 0 0 .5px color-mix(in srgb, ${mainColor.blue} 28%, ${mainColor.line});
  animation: liangxiang-speech-line 160ms cubic-bezier(.16,1,.3,1) both;
}
@keyframes liangxiang-speech-line { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: translateY(0); } }
[~feedback][data-reduced-motion="true"] * { animation: none !important; transition: none !important; filter: none !important; }
`.replaceAll('[~', '[data-liangxiang-')

export function BadgeFeedback({ position, viewport, open, comments, suppressed, reducedMotion }: Props) {
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [panel, setPanel] = useState<FeedbackRect | null>(null)
  const [tooltipWidth, setTooltipWidth] = useState(66)
  const [laneWidth, setLaneWidth] = useState(140)
  const [presented, setPresented] = useState<PresentedComment[]>([])
  const lane = placeBadgeSpeech(position, viewport, laneWidth, panel)
  const capacity = lane?.capacity ?? 0
  useLayoutEffect(() => {
    setPresented(previous => capacity > 0 ? reconcileBadgeComments(previous, comments, capacity, Date.now()) : [])
  }, [comments, capacity])
  useEffect(() => {
    const deadlines = presented.flatMap(row => row.exitingAt === undefined ? [] : [row.exitingAt + SQUISH_EXIT_MS])
    if (!deadlines.length) return
    const timer = window.setTimeout(() => setPresented(current => current.filter(row => row.exitingAt === undefined || Date.now() - row.exitingAt < SQUISH_EXIT_MS)), Math.max(0, Math.min(...deadlines) - Date.now()))
    return () => window.clearTimeout(timer)
  }, [presented])
  useLayoutEffect(() => {
    const root = tooltipRef.current?.closest('[data-liangxiang-root]')
    const element = open ? root?.querySelector<HTMLElement>('[data-liangxiang-panel]') : null
    const measure = (): void => {
      setPanel(element?.getBoundingClientRect() ?? null)
      const label = tooltipRef.current?.getBoundingClientRect()
      if (label) setTooltipWidth(label.width)
      const widths = Array.from(root?.querySelectorAll<HTMLElement>('[data-liangxiang-danmu-line]') ?? [], line => line.getBoundingClientRect().width)
      if (widths.length) setLaneWidth(Math.max(140, ...widths))
    }
    measure()
    element?.addEventListener('animationend', measure)
    const observer = new ResizeObserver(measure)
    if (element) observer.observe(element)
    if (tooltipRef.current) observer.observe(tooltipRef.current)
    return () => { observer.disconnect(); element?.removeEventListener('animationend', measure) }
  }, [open, position.x, position.y, viewport.width, viewport.height, presented])
  const tooltip = placeBadgeFeedback(position, viewport, tooltipWidth, 28, panel)
  return (
    <div aria-hidden="true" data-liangxiang-feedback="" data-reduced-motion={reducedMotion} style={{ pointerEvents: 'none' }}>
      <style>{css}</style>
      <div ref={tooltipRef} data-liangxiang-badge-tooltip="" data-suppressed={suppressed || tooltip === null}
        data-align={tooltip?.align} style={{ left: tooltip?.x ?? 8, top: tooltip?.y ?? 8 }}>{HOVER_TEXT}</div>
      {lane && presented.length > 0 && (
        <div data-liangxiang-danmu="" data-align={lane.align} style={{ left: lane.x, top: lane.y, width: lane.width, height: lane.height }}>
          {presented.map(comment => (
            <div key={comment.id} data-liangxiang-danmu-row={comment.id} data-slot={comment.slot} data-exiting={comment.exitingAt !== undefined}
              style={{ transform: `translateY(${comment.slot * SPEECH_ROW_HEIGHT}px)` }}>
              <span data-liangxiang-danmu-line="">{comment.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
