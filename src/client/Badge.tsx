/**
 * 梁标 entry + panel container.
 *
 * `BadgeButton` is the presentational docked entry (hover/focus tooltip is
 * the frozen `今日梁位`). `LiangbiaoBadge` is the stateful container that the
 * overlay slot renders: it owns open/close, Escape/outside-click dismissal,
 * focus return, reduced-motion detection, and the transient avatar-pulse /
 * 凝香 / vote-feedback timers. All business state lives in the store.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, ReactElement, RefObject } from 'react'
import type { VoteType } from '../domain/index.ts'
import { HOVER_TEXT, PRODUCT_NAME, VOTE_DOWN_NAME, VOTE_UP_NAME } from '../shared/index.ts'
import { Panel } from './Panel.tsx'
import { createMockLiangbiaoStore, type LiangbiaoStore } from './store.ts'
import { color } from './theme.ts'

/**
 * The shell.overlay layer spans the frame with pointer-events:none; this
 * container opts back in and docks to the right edge, clear of the composer
 * and the sidebar.
 */
const anchorStyle: CSSProperties = {
  position: 'absolute',
  right: '16px',
  top: '50%',
  transform: 'translateY(-50%)',
  pointerEvents: 'auto',
}

const buttonStyle: CSSProperties = {
  width: '32px',
  height: '32px',
  padding: 0,
  border: 'none',
  borderRadius: '50%',
  cursor: 'pointer',
  background: 'rgba(90, 105, 140, 0.85)',
  color: '#ffffff',
  fontSize: '14px',
  lineHeight: '32px',
  textAlign: 'center',
  display: 'block',
  pointerEvents: 'auto',
}

export interface BadgeButtonProps {
  open: boolean
  onToggle: () => void
  onEscape: () => void
  buttonRef: RefObject<HTMLButtonElement> | null
}

/** Keyboard-reachable docked entry; hover and focus both surface `今日梁位`. */
export function BadgeButton({ open, onToggle, onEscape, buttonRef }: BadgeButtonProps): ReactElement {
  return (
    <button
      type="button"
      ref={buttonRef ?? undefined}
      title={HOVER_TEXT}
      aria-label={HOVER_TEXT}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) onEscape()
      }}
      style={{ ...buttonStyle, boxShadow: open ? `0 0 0 2px ${color.brand}` : undefined }}
      data-liangbiao-badge=""
    >
      {PRODUCT_NAME.charAt(0)}
    </button>
  )
}

/** Module-level store: one per client bundle instance (host-backed later). */
let sharedStore: LiangbiaoStore | null = null

function getSharedStore(): LiangbiaoStore {
  sharedStore ??= createMockLiangbiaoStore()
  return sharedStore
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

export function LiangbiaoBadge(): ReactElement {
  const store = getSharedStore()
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  // Dev/QA affordance: `#liangbiao-open` boots with the panel expanded
  // (screenshots, smoke checks). Normal sessions start collapsed.
  const [open, setOpen] = useState<boolean>(() =>
    typeof location !== 'undefined' && location.hash.includes('liangbiao-open'))
  const reducedMotion = useReducedMotion()

  const anchorRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

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
    const result = store.vote(voteType)
    if (result.status === 'accepted') {
      setVoteFeedback(`已上香：${voteType === 'up' ? VOTE_UP_NAME : VOTE_DOWN_NAME}（剩余 ${result.remainingIncense} 炷）`)
    }
    // Rejections leave the standing disabled reason visible; no extra copy.
  }

  return (
    <div ref={anchorRef} style={anchorStyle} data-liangbiao-root="">
      <BadgeButton
        open={open}
        onToggle={() => setOpen((value) => !value)}
        onEscape={() => setOpen(false)}
        buttonRef={buttonRef}
      />
      {open && (
        <Panel
          state={state}
          reducedMotion={reducedMotion}
          avatarPulse={avatarPulse}
          justCondensed={justCondensed}
          voteFeedback={voteFeedback}
          onVote={onVote}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
