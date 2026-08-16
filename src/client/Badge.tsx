/**
 * 梁标 entry + panel container.
 *
 * `BadgeButton` is the presentational docked entry: the current 梁子 state IS
 * the icon (so the global mood is readable without opening anything), and the
 * hover/focus tooltip stays the frozen `今日梁位`. It is freely placeable —
 * drag it anywhere in the frame; the position is remembered per browser.
 *
 * `LiangbiaoBadge` is the stateful container that the overlay slot renders: it
 * owns placement, open/close, Escape/outside-click dismissal, focus return,
 * reduced-motion detection, and the transient avatar-pulse / 凝香 /
 * vote-feedback timers. All business state lives in the store.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactElement, RefObject } from 'react'
import type { LiangziState, VoteType } from '../domain/index.ts'
import { HOVER_TEXT, LIANGZI_STATE_LABELS, VOTE_DOWN_NAME, VOTE_UP_NAME } from '../shared/index.ts'
import {
  BADGE_SIZE,
  clampBadgePosition,
  loadBadgePosition,
  panelPlacementFor,
  saveBadgePosition,
  type BadgePoint,
} from './badge-position.ts'
import { LiangAvatar } from './LiangAvatar.tsx'
import { createLiveLiangbiaoStore } from './live-store.ts'
import { Panel } from './Panel.tsx'
import { color } from './theme.ts'

const buttonStyle: CSSProperties = {
  width: `${BADGE_SIZE}px`,
  height: `${BADGE_SIZE}px`,
  padding: 0,
  border: 'none',
  borderRadius: '50%',
  background: 'rgba(90, 105, 140, 0.85)',
  color: '#ffffff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  pointerEvents: 'auto',
  touchAction: 'none',
}

export interface BadgeButtonProps {
  open: boolean
  /** Drives the icon: the entry shows the current central 梁子 state. */
  liangziState: LiangziState
  reducedMotion?: boolean
  dragging?: boolean
  onToggle: () => void
  onEscape: () => void
  onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void
  buttonRef: RefObject<HTMLButtonElement> | null
}

/** Keyboard-reachable docked entry; hover and focus both surface `今日梁位`. */
export function BadgeButton({
  open,
  liangziState,
  reducedMotion = false,
  dragging = false,
  onToggle,
  onEscape,
  onPointerDown,
  buttonRef,
}: BadgeButtonProps): ReactElement {
  return (
    <button
      type="button"
      ref={buttonRef ?? undefined}
      title={HOVER_TEXT}
      aria-label={`${HOVER_TEXT}：${LIANGZI_STATE_LABELS[liangziState]}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onToggle}
      onPointerDown={onPointerDown}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) onEscape()
      }}
      style={{
        ...buttonStyle,
        cursor: dragging ? 'grabbing' : 'grab',
        boxShadow: open ? `0 0 0 2px ${color.brand}` : undefined,
      }}
      data-liangbiao-badge=""
      data-liangbiao-badge-state={liangziState}
    >
      {/* The mini 梁子 is decorative here: the button already names the state. */}
      <span aria-hidden="true" style={{ display: 'flex', pointerEvents: 'none' }}>
        <LiangAvatar state={liangziState} pulse={false} reducedMotion={reducedMotion} size={30} hideLabel />
      </span>
    </button>
  )
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.matchMedia(REDUCED_MOTION_QUERY).matches)
  useEffect(() => {
    const media = window.matchMedia(REDUCED_MOTION_QUERY)
    const onChange = (): void => setReduced(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return reduced
}

const DRAG_THRESHOLD_PX = 4

/** Viewport size, tracked so a resized window cannot hide the badge. */
function useViewport(): { width: number, height: number } {
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1280 : window.innerWidth,
    height: typeof window === 'undefined' ? 800 : window.innerHeight,
  }))
  useEffect(() => {
    const onResize = (): void => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return viewport
}

export function LiangbiaoBadge(): ReactElement {
  // One live connection per mounted badge; disposed on unmount (plugin
  // unload / HMR), so streams and timers never multiply.
  const [store] = useState(() => createLiveLiangbiaoStore())
  useEffect(() => {
    store.start()
    return () => store.dispose()
  }, [store])
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  // Dev/QA affordance: `#liangbiao-open` boots with the panel expanded
  // (screenshots, smoke checks). Normal sessions start collapsed.
  const [open, setOpen] = useState<boolean>(() =>
    typeof location !== 'undefined' && location.hash.includes('liangbiao-open'))
  // Reopening the panel while offline is the bounded reconnect trigger.
  useEffect(() => {
    if (open) store.refresh()
  }, [open, store])
  const reducedMotion = useReducedMotion()

  const anchorRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Free placement: drag the entry anywhere; the point is clamped into the
  // frame on load and on resize, and persisted as a cosmetic preference only.
  const viewport = useViewport()
  const [position, setPosition] = useState<BadgePoint>(() =>
    loadBadgePosition(
      { width: viewport.width, height: viewport.height },
      typeof localStorage === 'undefined' ? null : localStorage,
    ))
  useEffect(() => {
    setPosition((current) => clampBadgePosition(current, viewport))
  }, [viewport])

  const [dragging, setDragging] = useState(false)
  // A drag must not also toggle the panel: the click that follows the release
  // is swallowed once, and only when the pointer actually travelled.
  const suppressClick = useRef(false)
  const dragState = useRef<{ pointerId: number, dx: number, dy: number, moved: boolean } | null>(null)

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) return
    dragState.current = {
      pointerId: event.pointerId,
      dx: event.clientX - position.x,
      dy: event.clientY - position.y,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [position.x, position.y])

  useEffect(() => {
    const onMove = (event: PointerEvent): void => {
      const drag = dragState.current
      if (drag === null || drag.pointerId !== event.pointerId) return
      const next = { x: event.clientX - drag.dx, y: event.clientY - drag.dy }
      if (!drag.moved) {
        const travelled = Math.abs(next.x - position.x) + Math.abs(next.y - position.y)
        if (travelled < DRAG_THRESHOLD_PX) return
        drag.moved = true
        setDragging(true)
      }
      setPosition(clampBadgePosition(next, viewport))
    }
    const onUp = (event: PointerEvent): void => {
      const drag = dragState.current
      if (drag === null || drag.pointerId !== event.pointerId) return
      dragState.current = null
      if (drag.moved) {
        suppressClick.current = true
        setDragging(false)
        setPosition((current) => {
          const clamped = clampBadgePosition(current, viewport)
          saveBadgePosition(clamped, typeof localStorage === 'undefined' ? null : localStorage)
          return clamped
        })
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [position.x, position.y, viewport])

  // One short avatar pulse when the GLOBAL Liangzi state crosses a threshold.
  const [avatarPulse, setAvatarPulse] = useState(false)
  const prevLiangziState = useRef(state.snapshot.liangziState)
  useEffect(() => {
    if (prevLiangziState.current === state.snapshot.liangziState) return undefined
    prevLiangziState.current = state.snapshot.liangziState
    setAvatarPulse(true)
    const timer = window.setTimeout(() => setAvatarPulse(false), 950)
    return () => window.clearTimeout(timer)
  }, [state.snapshot.liangziState])

  // One short pop when the published 梁位 moves. Driven by the raw counts, so it
  // fires exactly when the rendered value can differ — including a vote from
  // someone else, which is half the fun of a shared number.
  const [positionPulse, setPositionPulse] = useState(false)
  const prevCounts = useRef(`${state.snapshot.upVotes}/${state.snapshot.downVotes}`)
  useEffect(() => {
    const counts = `${state.snapshot.upVotes}/${state.snapshot.downVotes}`
    if (prevCounts.current === counts) return undefined
    prevCounts.current = counts
    setPositionPulse(true)
    const timer = window.setTimeout(() => setPositionPulse(false), 520)
    return () => window.clearTimeout(timer)
  }, [state.snapshot.upVotes, state.snapshot.downVotes])

  // One short 凝香 feedback when a new incense stick is earned.
  const [justCondensed, setJustCondensed] = useState(false)
  const prevEarned = useRef(state.personal.earnedIncenseToday)
  useEffect(() => {
    const grew = state.personal.earnedIncenseToday > prevEarned.current
    prevEarned.current = state.personal.earnedIncenseToday
    if (!grew) return undefined
    setJustCondensed(true)
    const timer = window.setTimeout(() => setJustCondensed(false), 1400)
    return () => window.clearTimeout(timer)
  }, [state.personal.earnedIncenseToday])

  // Transient vote feedback (已上香).
  const [voteFeedback, setVoteFeedback] = useState('')
  useEffect(() => {
    if (voteFeedback === '') return undefined
    const timer = window.setTimeout(() => setVoteFeedback(''), 2000)
    return () => window.clearTimeout(timer)
  }, [voteFeedback])

  // Outside click closes the panel.
  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event: MouseEvent): void => {
      const anchor = anchorRef.current
      if (anchor !== null && event.target instanceof Node && !anchor.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  // Focus management: focus the dialog on open, return to the entry on close.
  const wasOpen = useRef(false)
  useEffect(() => {
    const anchor = anchorRef.current
    if (open && anchor !== null) {
      const panel = anchor.querySelector<HTMLElement>('[data-liangbiao-panel]')
      panel?.focus()
    } else if (!open && wasOpen.current) {
      buttonRef.current?.focus()
    }
    wasOpen.current = open
  }, [open])

  const onVote = (voteType: VoteType): void => {
    store.vote(voteType).then(
      (result) => {
        if (result.status === 'accepted') {
          setVoteFeedback(`已上香：${voteType === 'up' ? VOTE_UP_NAME : VOTE_DOWN_NAME}（剩余 ${result.remainingIncense} 炷）`)
        } else if (result.reason !== 'insufficient_incense') {
          setVoteFeedback(`投票被拒绝：${result.reason}`)
        }
        // insufficient_incense keeps the standing disabled reason visible.
      },
      (error: unknown) => {
        console.warn(`[dsh-liangbiao] vote failed: ${error instanceof Error ? error.message : String(error)}`)
        setVoteFeedback('投票失败，请稍后重试')
      },
    )
  }

  return (
    <div
      ref={anchorRef}
      // The shell.overlay layer spans the frame with pointer-events:none; this
      // container opts back in at the badge's own coordinates.
      style={{
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        pointerEvents: 'auto',
      }}
      data-liangbiao-root=""
    >
      <BadgeButton
        open={open}
        liangziState={state.snapshot.liangziState}
        reducedMotion={reducedMotion}
        dragging={dragging}
        onToggle={() => {
          if (suppressClick.current) {
            suppressClick.current = false
            return
          }
          setOpen((value) => !value)
        }}
        onEscape={() => setOpen(false)}
        onPointerDown={onPointerDown}
        buttonRef={buttonRef}
      />
      {open && (
        <Panel
          state={state}
          reducedMotion={reducedMotion}
          avatarPulse={avatarPulse}
          justCondensed={justCondensed}
          voteFeedback={voteFeedback}
          positionPulse={positionPulse}
          placement={panelPlacementFor(position, viewport)}
          onVote={onVote}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
