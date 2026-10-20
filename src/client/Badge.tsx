/**
 * 梁相 entry + panel container.
 *
 * `BadgeButton` is the presentational docked entry: the current 梁子 state IS
 * the icon (so the global mood is readable without opening anything), and the
 * default tooltip and accessible name stay `今日梁相`. It is freely placeable —
 * drag it anywhere in the frame; the position is remembered per browser.
 *
 * `LiangxiangBadge` is the stateful container that the overlay slot renders: it
 * owns placement, open/close, Escape/outside-click dismissal, focus return,
 * reduced-motion detection, and the transient avatar-pulse / 凝香 /
 * vote-feedback timers. All business state lives in the store.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactElement, RefObject } from 'react'
import { deriveLocalEpithet, VOTE_COUNT_MAX, type LiangziState, type VoteType } from '../domain/index.ts'
import { EMPTY_INCENSE_FEEDBACK_MS, VOTE_FEEDBACK_MS, formatAcceptedVoteFeedback, HOMEPAGE_URL, HOVER_TEXT, LIANGZI_STATE_LABELS, NO_INCENSE_GAG, NO_INCENSE_REASON, RECONCILE_DONE, VOTE_DOWN_NAME, VOTE_RATE_LIMITED, VOTE_UP_NAME, isEmptyIncenseFeedback } from '../shared/index.ts'
import type { HostAuthorityPreference } from '../shared/wire.ts'
import { initialDshDockClearance } from '../compat/dsh/default-dock.ts'
import { rememberLocalEpithetVote } from './local-epithet-store.ts'
import { combineLocalIncenseStats, readLocalIncenseStats, rememberLocalIncenseVote } from './local-incense-store.ts'
import { cycleSoundLevel, playArchiveSeal, playIncenseEarn, playLiangziShift, playNoIncense, playSquish, playVolumePreview, playVoteDown, playVoteDump, playVoteUp, soundLevel as readSoundLevel } from './sound.ts'
import { DUMP_AUTO_RELEASE_MS, chargeProgress, holdReleaseAction } from './vote-charge.ts'
import { hasSeenWelcome, markWelcomeSeen, WELCOME_STORAGE_KEY } from './welcome.ts'
import { pickSquishLabel, SQUISH_ANIM_MS, SQUISH_DOUBLE_MS, SQUISH_COMMENT_GAP_MS, SQUISH_LABEL_LINGER_MS, SQUISH_MAX_ROWS } from './badge-squish.ts'
import { BadgeFeedback } from './BadgeFeedback.tsx'
import type { BadgeComment } from './badge-feedback.ts'
import {
  BADGE_ICON_SIZE,
  SETTINGS_CLEARANCE,
  BADGE_SIZE,
  clampBadgePosition,
  defaultBadgePosition,
  hasSavedBadgePosition,
  loadBadgePosition,
  loadPanelOpen,
  panelPlacementFor,
  saveBadgePosition,
  savePanelOpen,
  settleBadgePosition,
  type BadgePoint,
} from './badge-position.ts'
import { LIANGZI_ART } from './liangzi-art.ts'
import { preloadLiangziArt } from './liangzi-art-cache.ts'
import { LiangAvatar } from './LiangAvatar.tsx'
import { LiangciModal } from './LiangciModal.tsx'
import { createLiveLiangxiangStore, LiveTransportError } from './live-store.ts'
import { Panel } from './Panel.tsx'
import { color } from './theme.ts'
import { useThrottleFill } from './use-throttle-fill.ts'
import { useTweenedCount } from './use-tweened-count.ts'
import { hasSeenReleaseNotes, markReleaseNotesSeen, releaseNotesStorageKey } from './release-notes.ts'
import { loadDismissedBroadcastId, markBroadcastDismissed } from './broadcast-dismissal.ts'

/** Preserve the exact earned-incense jump carried by one authoritative frame. */
export function earnedIncenseGain(previous: number, current: number): number {
  return Math.max(0, current - previous)
}

/** After a Host reconnect the first 0→N jump is starter / hydrate, not 凝香. */
export const BOOTSTRAP_CONDENSE_GRACE_MS = 2_500

export function shouldAnnounceCondensedIncense(
  previous: number,
  current: number,
  msSinceLive: number,
): boolean {
  if (earnedIncenseGain(previous, current) <= 0) return false
  if (msSinceLive < BOOTSTRAP_CONDENSE_GRACE_MS && previous === 0) return false
  return true
}

const buttonStyle: CSSProperties = {
  width: `${BADGE_SIZE}px`,
  height: `${BADGE_SIZE}px`,
  padding: 0,
  border: `1px solid color-mix(in srgb, ${color.ritualGold} 28%, ${color.border})`,
  borderRadius: '50%',
  background: `radial-gradient(circle at 50% 38%, color-mix(in srgb, ${color.ritualGold} 16%, transparent), transparent 64%), color-mix(in srgb, ${color.bgLayer} 86%, transparent)`,
  boxShadow: '0 8px 22px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.10)',
  color: '#ffffff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'visible',
  pointerEvents: 'auto',
  touchAction: 'none',
  WebkitTapHighlightColor: 'transparent',
}

const BADGE_CSS = `
[data-liangxiang-badge] {
  transition: border-color 140ms ease, box-shadow 140ms ease, background-color 140ms ease;
  transform-origin: 50% 88%;
}

[data-liangxiang-badge][data-squish-pressed="true"] {
  transition: transform 80ms cubic-bezier(.2, .8, .3, 1);
  transform: scale(1.24, 0.74);
}
[data-liangxiang-badge][data-squish-release="true"] {
  animation: liangxiang-badge-squish-release ${SQUISH_ANIM_MS}ms both;
}
@keyframes liangxiang-badge-squish-release {
  0% { transform: scale(1.24, 0.74); animation-timing-function: cubic-bezier(.22, .9, .3, 1); }
  36% { transform: scale(0.92, 1.12); animation-timing-function: cubic-bezier(.4, 0, .6, 1); }
  60% { transform: scale(1.07, 0.94); animation-timing-function: cubic-bezier(.4, 0, .6, 1); }
  80% { transform: scale(0.98, 1.02); animation-timing-function: cubic-bezier(.4, 0, .6, 1); }
  100% { transform: scale(1, 1); }
}
[data-liangxiang-badge]:hover,
[data-liangxiang-badge][aria-expanded="true"] {
  border-color: color-mix(in srgb, ${color.ritualGold} 66%, ${color.border});
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.26), 0 0 0 3px color-mix(in srgb, ${color.ritualGold} 10%, transparent), inset 0 1px 0 rgba(255, 255, 255, 0.14);
}
[data-liangxiang-badge][data-dragging="true"] {
  cursor: grabbing;
  transform: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.08);
}
[data-liangxiang-badge]:focus-visible {
  outline: 2px solid ${color.brand};
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  [data-liangxiang-badge] { transition: none !important; }
  [data-liangxiang-badge][data-squish-release="true"] { animation: none !important; }
  [data-liangxiang-badge] { transform: none !important; }
}
[data-liangxiang-badge][data-reduced-motion="true"] { transform: none !important; animation: none !important; }
`

export interface BadgeButtonProps {
  open: boolean
  /** Drives the icon: the entry shows the current central 梁子 state. */
  liangziState: LiangziState
  policyVersion?: string
  /** Next-incense fill: logo and panel bob at the same cadence. */
  liangQiFill?: number
  reducedMotion?: boolean
  dragging?: boolean
  onToggle: (event: ReactMouseEvent<HTMLButtonElement>) => void
  onEscape: () => void
  /** Hover / keyboard focus: probe the host for a newer 梁案. */
  onProbeLatest?: () => void
  onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void
  buttonRef: RefObject<HTMLButtonElement> | null
}

/** Keyboard-reachable docked entry; hover and focus both surface `今日梁相`. */
export function BadgeButton({
  open,
  liangziState,
  policyVersion,
  liangQiFill = 1,
  reducedMotion = false,
  dragging = false,
  onToggle,
  onEscape,
  onProbeLatest,
  onPointerDown,
  buttonRef,
}: BadgeButtonProps): ReactElement {
  return (
    <button
      type="button"
      ref={buttonRef ?? undefined}
      aria-label={`${HOVER_TEXT}：${LIANGZI_STATE_LABELS[liangziState]}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onToggle}
      onPointerEnter={() => onProbeLatest?.()}
      onFocus={() => onProbeLatest?.()}
      onPointerDown={onPointerDown}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onEscape()
      }}
      style={{
        ...buttonStyle,
        cursor: dragging ? 'grabbing' : 'grab',
      }}
      data-liangxiang-badge=""
      data-liangxiang-badge-state={liangziState}
      data-dragging={dragging}
      data-reduced-motion={reducedMotion}
    >
      <style>{BADGE_CSS}</style>
      <span
        aria-hidden="true"
        data-liangxiang-badge-halo=""
        style={{
          position: 'absolute',
          inset: '4px',
          borderRadius: '50%',
          background: `radial-gradient(circle, color-mix(in srgb, ${color.ritualGold} 18%, transparent) 0%, transparent 68%)`,
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color.ritualGold} 18%, transparent)`,
          pointerEvents: 'none',
        }}
      />
      {/* The mini 梁子 is decorative here: the button already names the state. */}
      <span aria-hidden="true" style={{ position: 'relative', zIndex: 1, display: 'flex', pointerEvents: 'none', overflow: 'visible', background: 'transparent' }}>
        <LiangAvatar
          state={liangziState}
          {...(policyVersion === undefined ? {} : { policyVersion })}
          pulse={false}
          reducedMotion={reducedMotion}
          size={BADGE_ICON_SIZE}
          hideLabel
          chrome="none"
          liangQiFill={liangQiFill}
        />
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

export function LiangxiangBadge(): ReactElement {
  // One live connection per mounted badge; disposed on unmount (plugin
  // unload / HMR), so streams and timers never multiply.
  const [store] = useState(() => createLiveLiangxiangStore())
  useEffect(() => {
    store.start()
    return () => store.dispose()
  }, [store])
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const historyState = useSyncExternalStore(store.subscribeHistory, store.getHistorySnapshot)
  // Default open so the stacked left-dock can stay visible without covering
  // the DSH composer. × / the badge persist the preference per browser.
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof location !== 'undefined'
      && location.hash.includes('liangxiang-open')) return true
    return loadPanelOpen(typeof localStorage === 'undefined' ? null : localStorage)
  })
  const [welcomeVisible, setWelcomeVisible] = useState(() => !hasSeenWelcome())
  const [releaseNotesVisible, setReleaseNotesVisible] = useState(() => !hasSeenReleaseNotes())
  useEffect(() => {
    // Another tab completing guidance must not leave this one blocked or ask
    // for a second authority choice. Clearing storage never chooses a mode.
    const onStorage = (event: StorageEvent): void => {
      if (event.storageArea !== localStorage || event.newValue !== 'seen') return
      if (event.key === WELCOME_STORAGE_KEY) setWelcomeVisible(false)
      if (event.key === releaseNotesStorageKey()) setReleaseNotesVisible(false)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  const [dismissedBroadcastId, setDismissedBroadcastId] = useState(() => loadDismissedBroadcastId())
  // Reopening the panel while offline reconnects; while live it forces a
  // host re-bootstrap so the expanded 今日梁案 is not up to ~1s stale.
  useEffect(() => {
    if (open) store.refresh({ force: true })
  }, [open, store])
  useEffect(() => {
    if (welcomeVisible || releaseNotesVisible) setOpen(true)
  }, [welcomeVisible, releaseNotesVisible])
  const reducedMotion = useReducedMotion()
  // Smoothed + rate-extrapolated ring fill for the 油门 feel (presentation only).
  const throttle = useThrottleFill(state.personal, reducedMotion)
  const displayTotalIncense = useTweenedCount(state.snapshot.totalIncense, reducedMotion)
  const displayUniqueVoters = useTweenedCount(state.snapshot.uniqueVoters, reducedMotion)
  const [soundLevel, setSoundLevel] = useState(() => readSoundLevel())
  const onCycleSound = useCallback(() => {
    const next = cycleSoundLevel()
    setSoundLevel(next)
    playVolumePreview()
  }, [])
  const [liangciOpen, setLiangciOpen] = useState(false)
  const closeLiangci = useCallback(() => setLiangciOpen(false), [])
  const selectWelcomeMode = useCallback((preference: HostAuthorityPreference) => {
    void store.selectAuthorityMode(preference).then(
      () => {
        markWelcomeSeen()
        setWelcomeVisible(false)
      },
      (error: unknown) => {
        console.warn(`[dsh-liangxiang] welcome mode selection failed: ${error instanceof Error ? error.message : String(error)}`)
      },
    )
  }, [store])
  const onChooseOnline = useCallback(() => selectWelcomeMode('online'), [selectWelcomeMode])
  const onChooseLocal = useCallback(() => selectWelcomeMode('local'), [selectWelcomeMode])
  const onReleaseNotesClose = useCallback(() => {
    markReleaseNotesSeen()
    setReleaseNotesVisible(false)
  }, [])
  const onBroadcastDismiss = useCallback((broadcastId: string) => {
    markBroadcastDismissed(broadcastId)
    setDismissedBroadcastId(broadcastId)
  }, [])

  const anchorRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open || welcomeVisible || !releaseNotesVisible) return
    const dialog = anchorRef.current?.querySelector<HTMLElement>('[data-liangxiang-release-notes]') ?? null
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onReleaseNotesClose()
        return
      }
      if (event.key !== 'Tab') return
      event.preventDefault()
      event.stopPropagation()
      dialog?.querySelector<HTMLButtonElement>('[data-liangxiang-release-notes-close]')?.focus()
    }
    document.addEventListener('keydown', onKeyDown, true)
    const frame = requestAnimationFrame(() => {
      if (dialog === null) return
      dialog.scrollTop = 0
      dialog.focus({ preventScroll: true })
    })
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown, true)
      if (dialog?.contains(document.activeElement)) {
        anchorRef.current?.querySelector<HTMLElement>('[data-liangxiang-panel]')?.focus()
      }
    }
  }, [open, welcomeVisible, releaseNotesVisible, onReleaseNotesClose])

  // Free placement: drag the entry anywhere; the point is clamped into the
  // frame on load and on resize, and persisted as a cosmetic preference only.
  const viewport = useViewport()
  const freshDock = useRef(false)
  const [position, setPosition] = useState<BadgePoint>(() => {
    const storage = typeof localStorage === 'undefined' ? null : localStorage
    freshDock.current = !hasSavedBadgePosition(storage)
    return loadBadgePosition(viewport, storage)
  })
  useLayoutEffect(() => {
    if (!freshDock.current) return
    freshDock.current = false
    // Read after the shell's DOM commit, before the first paint. Never follow
    // footer changes or modify a user-saved point after the panel is visible.
    const clearance = initialDshDockClearance(viewport.height, document) ?? SETTINGS_CLEARANCE
    setPosition(defaultBadgePosition(viewport, clearance))
  }, [viewport])
  useEffect(() => {
    setPosition((current) => settleBadgePosition(current, viewport))
  }, [viewport])
  useEffect(() => {
    preloadLiangziArt(LIANGZI_ART)
  }, [])
  const [pinnedHint, setPinnedHint] = useState<'epithet' | null>(null)
  const prevArchiveVersion = useRef(0)
  useEffect(() => {
    const version = historyState.archive?.archiveVersion ?? 0
    if (prevArchiveVersion.current === 0) {
      prevArchiveVersion.current = version
      return
    }
    if (version > prevArchiveVersion.current) {
      prevArchiveVersion.current = version
      playArchiveSeal()
    }
  }, [historyState.archive?.archiveVersion])

  const [dragging, setDragging] = useState(false)
  // A drag must not also toggle the panel: the click that follows the release
  // is swallowed once, and only when the pointer actually travelled.
  const suppressClick = useRef(false)
  const [tapPending, setTapPending] = useState(false)
  const tap = useRef<{ last: number, timer: number | null }>({ last: -Infinity, timer: null })
  const cancelTap = useCallback(() => {
    if (tap.current.timer !== null) window.clearTimeout(tap.current.timer)
    tap.current = { last: -Infinity, timer: null }
    setTapPending(false)
  }, [])
  const [comments, setComments] = useState<BadgeComment[]>([])
  const lastComment = useRef({ time: -Infinity, text: '', id: 0 })
  const squishTimer = useRef<number | null>(null)
  useEffect(() => () => {
    if (tap.current.timer !== null) window.clearTimeout(tap.current.timer)
    if (squishTimer.current !== null) window.clearTimeout(squishTimer.current)
  }, [])
  useEffect(() => {
    if (comments.length === 0) return
    const oldest = comments[comments.length - 1]!
    const timer = window.setTimeout(() => setComments(current =>
      current.filter(comment => Date.now() - comment.createdAt < SQUISH_LABEL_LINGER_MS)),
    Math.max(0, oldest.createdAt + SQUISH_LABEL_LINGER_MS - Date.now()))
    return () => window.clearTimeout(timer)
  }, [comments])
  const dragState = useRef<{ pointerId: number, dx: number, dy: number, moved: boolean } | null>(null)

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0 || dragState.current !== null) return
    // A fresh press interrupts the bounce still running from the previous tap,
    // so a fast burst reads as one continuous squash instead of a stutter.
    const el = buttonRef.current
    if (el !== null) {
      el.removeAttribute('data-squish-release')
      el.setAttribute('data-squish-pressed', 'true')
      if (squishTimer.current !== null) {
        window.clearTimeout(squishTimer.current)
        squishTimer.current = null
      }
    }
    suppressClick.current = false
    dragState.current = {
      pointerId: event.pointerId,
      dx: event.clientX - position.x,
      dy: event.clientY - position.y,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [position.x, position.y])

  /**
   * Replay the release bounce. The attribute is cleared on a timer rather than
   * on `animationend`: `prefers-reduced-motion` sets `animation: none`, so that
   * event would never fire and the attribute would stay set forever.
   */
  const replaySquishRelease = useCallback((): void => {
    const el = buttonRef.current
    if (el === null) return
    if (squishTimer.current !== null) window.clearTimeout(squishTimer.current)
    el.setAttribute('data-squish-release', 'true')
    squishTimer.current = window.setTimeout(() => {
      el.removeAttribute('data-squish-release')
      squishTimer.current = null
    }, SQUISH_ANIM_MS + 40)
  }, [])

  useEffect(() => {
    const onMove = (event: PointerEvent): void => {
      const drag = dragState.current
      if (drag === null || drag.pointerId !== event.pointerId) return
      const next = { x: event.clientX - drag.dx, y: event.clientY - drag.dy }
      if (!drag.moved) {
        const travelled = Math.abs(next.x - position.x) + Math.abs(next.y - position.y)
        if (travelled < DRAG_THRESHOLD_PX) return
        drag.moved = true
        cancelTap()
        setComments([])
        buttonRef.current?.removeAttribute('data-squish-pressed')
        setDragging(true)
      }
      setPosition(clampBadgePosition(next, viewport))
    }
    const onUp = (event: PointerEvent): void => {
      const drag = dragState.current
      if (drag === null || drag.pointerId !== event.pointerId) return
      dragState.current = null
      buttonRef.current?.removeAttribute('data-squish-pressed')
      if (drag.moved) {
        suppressClick.current = true
        setDragging(false)
        setPosition((current) => {
          const settled = settleBadgePosition(current, viewport)
          saveBadgePosition(settled, typeof localStorage === 'undefined' ? null : localStorage)
          return settled
        })
      } else if (event.type === 'pointercancel') {
        cancelTap()
        suppressClick.current = true
        setComments([])
      } else {
        // Only a tap bounces back: dropping the badge somewhere must not.
        playSquish()
        replaySquishRelease()
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
  }, [position.x, position.y, viewport, replaySquishRelease, cancelTap])

  // One short avatar pulse when the GLOBAL Liangzi state crosses a threshold.
  const [avatarPulse, setAvatarPulse] = useState(false)
  const prevLiangziState = useRef(state.snapshot.liangziState)
  const liangziSoundPrimed = useRef(false)
  useEffect(() => {
    if (!liangziSoundPrimed.current) {
      liangziSoundPrimed.current = true
      prevLiangziState.current = state.snapshot.liangziState
      return undefined
    }
    if (prevLiangziState.current === state.snapshot.liangziState) return undefined
    const from = prevLiangziState.current
    prevLiangziState.current = state.snapshot.liangziState
    playLiangziShift(from, state.snapshot.liangziState)
    setAvatarPulse(true)
    const timer = window.setTimeout(() => setAvatarPulse(false), 1100)
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
    const timer = window.setTimeout(() => setPositionPulse(false), 640)
    return () => window.clearTimeout(timer)
  }, [state.snapshot.upVotes, state.snapshot.downVotes])

  // One short 凝香 feedback showing how many incense sticks were earned in
  // this update. The first
  // live frame is a baseline (Cmd+Shift+R starts at earned=0 then hydrates),
  // never a condensation. Bob / 下一炷 may replay; this overlay must not.
  const [condensedIncense, setCondensedIncense] = useState(0)
  const prevEarned = useRef(state.observedEarnedIncenseToday)
  const incenseEarnPrimed = useRef(false)
  const liveSince = useRef<number | null>(null)
  useEffect(() => {
    if (state.connection !== 'live') {
      incenseEarnPrimed.current = false
      liveSince.current = null
      return undefined
    }
    if (liveSince.current === null) liveSince.current = performance.now()
    if (!incenseEarnPrimed.current) {
      incenseEarnPrimed.current = true
      prevEarned.current = state.observedEarnedIncenseToday
      return undefined
    }
    const previous = prevEarned.current
    const current = state.observedEarnedIncenseToday
    prevEarned.current = current
    const gained = earnedIncenseGain(previous, current)
    if (!shouldAnnounceCondensedIncense(previous, current, performance.now() - liveSince.current)) {
      return undefined
    }
    setCondensedIncense(gained)
    playIncenseEarn()
    const timer = window.setTimeout(() => setCondensedIncense(0), 1400)
    return () => window.clearTimeout(timer)
  }, [state.connection, state.observedEarnedIncenseToday])

  // Transient vote feedback (已上香).
  const [voteFeedback, setVoteFeedback] = useState('')
  const [utilityOpen, setUtilityOpen] = useState(false)
  const [dayEndPending, setDayEndPending] = useState(false)
  const dayEndSaving = useRef(false)
  const [reconcilePending, setReconcilePending] = useState(false)
  const [modeConfirmOpen, setModeConfirmOpen] = useState(false)
  const [modeChanging, setModeChanging] = useState(false)
  useEffect(() => {
    if (voteFeedback === '') return undefined
    const lingerMs = isEmptyIncenseFeedback(voteFeedback) ? EMPTY_INCENSE_FEEDBACK_MS : VOTE_FEEDBACK_MS
    const timer = window.setTimeout(() => setVoteFeedback(''), lingerMs)
    return () => window.clearTimeout(timer)
  }, [voteFeedback])
  useEffect(() => {
    if (!open) {
      setUtilityOpen(false)
      setReconcilePending(false)
      setModeConfirmOpen(false)
    }
  }, [open])

  // The panel stays open until the × (onClose) or Escape (Panel onKeyDown).
  // No outside-click close: an expanded panel is a deliberate view, not a popover.

  // Focus management: focus the dialog on open, return to the entry on close.
  const wasOpen = useRef(false)
  useEffect(() => {
    const anchor = anchorRef.current
    if (open && anchor !== null) {
      const panel = anchor.querySelector<HTMLElement>('[data-liangxiang-panel]')
      panel?.focus()
    } else if (!open && wasOpen.current) {
      buttonRef.current?.focus()
    }
    wasOpen.current = open
  }, [open])

  const [localIncense, setLocalIncense] = useState(() => readLocalIncenseStats(state.businessDate))
  useEffect(() => {
    setLocalIncense(readLocalIncenseStats(state.businessDate))
  }, [state.businessDate])
  const visibleIncense = combineLocalIncenseStats(localIncense, state.timedIncense)
  const localEpithet = deriveLocalEpithet({ up: visibleIncense.today.up, down: visibleIncense.today.down })
  const [chargeVoteType, setChargeVoteType] = useState<VoteType | null>(null)
  const [charge, setCharge] = useState(0)
  const [dumpBurst, setDumpBurst] = useState<VoteType | null>(null)
  const chargeRef = useRef<{
    type: VoteType
    pointerId: number
    startedAt: number
    frame: number
    timeout: number
    target: HTMLButtonElement
  } | null>(null)
  const voteInFlight = useRef(false)
  const pointerConsumedRef = useRef(false)
  const dumpBurstTimer = useRef(0)

  const clearCharge = useCallback((): void => {
    const current = chargeRef.current
    if (current !== null) {
      cancelAnimationFrame(current.frame)
      window.clearTimeout(current.timeout)
    }
    chargeRef.current = null
    setChargeVoteType(null)
    setCharge(0)
  }, [])
  useEffect(() => () => {
    const current = chargeRef.current
    if (current !== null) {
      cancelAnimationFrame(current.frame)
      window.clearTimeout(current.timeout)
    }
    window.clearTimeout(dumpBurstTimer.current)
  }, [])

  const onInsufficientVote = (voteType: VoteType): void => {
    playNoIncense(voteType)
    setVoteFeedback(NO_INCENSE_GAG)
  }

  const onVote = (voteType: VoteType, count = 1): void => {
    if (voteInFlight.current) return
    const remainingBefore = store.getSnapshot().personal.remainingIncense
    if (remainingBefore <= 0) {
      onInsufficientVote(voteType)
      return
    }
    const requested = Math.min(Math.max(1, count), remainingBefore, VOTE_COUNT_MAX)
    voteInFlight.current = true
    store.vote(voteType, { count: requested }).then(
      (result) => {
        if (result.status === 'accepted') {
          const spent = result.spentIncense ?? 1
          if (spent > 1) {
            playVoteDump(voteType)
            setDumpBurst(voteType)
            window.clearTimeout(dumpBurstTimer.current)
            dumpBurstTimer.current = window.setTimeout(() => {
              setDumpBurst((current) => current === voteType ? null : current)
            }, 460)
          } else if (voteType === 'up') playVoteUp()
          else playVoteDown()
          if (spent > 0) {
            const date = store.getSnapshot().businessDate
            rememberLocalEpithetVote(voteType, spent, date)
            setLocalIncense(rememberLocalIncenseVote(voteType, spent, date))
          }
          setVoteFeedback(formatAcceptedVoteFeedback(
            voteType === 'up' ? VOTE_UP_NAME : VOTE_DOWN_NAME,
            spent,
            result.remainingIncense,
          ))
        } else if (result.reason === 'insufficient_incense') {
          // The panel painted optimistic local incense the backend has not
          // authorized. Re-read the authoritative ledger so the count is honest
          // and the buttons disable, instead of silently doing nothing.
          setVoteFeedback(NO_INCENSE_REASON)
          void store.reconcile().catch(() => undefined)
        } else {
          setVoteFeedback(`打梁被拒绝：${result.reason}`)
        }
      },
      (error: unknown) => {
        console.warn(`[dsh-liangxiang] 打梁失败: ${error instanceof Error ? error.message : String(error)}`)
        setVoteFeedback(error instanceof LiveTransportError && error.status === 429
          ? VOTE_RATE_LIMITED
          : '打梁失败，请稍后重试')
      },
    ).finally(() => {
      voteInFlight.current = false
    })
  }

  const finishHold = (voteType: VoteType, pointerId: number, target?: HTMLButtonElement): void => {
    const hold = chargeRef.current
    if (hold === null || hold.pointerId !== pointerId) return
    const elapsed = performance.now() - hold.startedAt
    clearCharge()
    if (target !== undefined) {
      try {
        target.releasePointerCapture(pointerId)
      } catch {
        /* already released */
      }
    }
    const action = holdReleaseAction(elapsed)
    if (action === 'cancel') return
    const remaining = store.getSnapshot().personal.remainingIncense
    if (remaining <= 0) {
      onInsufficientVote(voteType)
      return
    }
    onVote(voteType, action === 'dump' ? remaining : 1)
  }

  const onVotePointerDown = (voteType: VoteType, event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0 || chargeRef.current !== null || voteInFlight.current) return
    store.noteVoteActivity()
    pointerConsumedRef.current = true
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const startedAt = performance.now()
    const hold: {
      type: VoteType
      pointerId: number
      startedAt: number
      frame: number
      timeout: number
      target: HTMLButtonElement
    } = {
      type: voteType,
      pointerId: event.pointerId,
      startedAt,
      frame: 0,
      timeout: 0,
      target: event.currentTarget,
    }
    const tick = (): void => {
      if (chargeRef.current !== hold) return
      const elapsed = performance.now() - hold.startedAt
      setCharge(chargeProgress(elapsed))
      if (elapsed >= DUMP_AUTO_RELEASE_MS) {
        finishHold(hold.type, hold.pointerId, hold.target)
        return
      }
      hold.frame = requestAnimationFrame(tick)
    }
    chargeRef.current = hold
    setChargeVoteType(voteType)
    setCharge(0)
    hold.frame = requestAnimationFrame(tick)
    hold.timeout = window.setTimeout(() => {
      if (chargeRef.current !== hold) return
      finishHold(hold.type, hold.pointerId, hold.target)
    }, DUMP_AUTO_RELEASE_MS)
  }

  const onVotePointerUp = (voteType: VoteType, event: ReactPointerEvent<HTMLButtonElement>): void => {
    finishHold(voteType, event.pointerId, event.currentTarget)
  }

  const onVoteClick = (voteType: VoteType): void => {
    if (pointerConsumedRef.current) {
      pointerConsumedRef.current = false
      return
    }
    onVote(voteType, 1)
  }

  const onVotePointerCancel = (): void => {
    // Keep the pointer-consumed flag so a leftover click after cancel
    // cannot submit. Never finishHold / vote from a cancelled gesture.
    clearCharge()
  }

  const changeDayEnd = (voteType?: VoteType): void => {
    const current = state.dayEnd
    if (dayEndSaving.current || !current?.available) return
    clearCharge()
    dayEndSaving.current = true
    setDayEndPending(true)
    const preferences = { enabled: voteType === undefined ? !current.enabled : current.enabled, voteType: voteType ?? current.voteType }
    store.setDayEndPreferences(preferences).then(
      () => setVoteFeedback(voteType === undefined
        ? (preferences.enabled ? '已开启定时上香' : '已关闭定时上香')
        : `定时上香：默认投${voteType === 'up' ? '夯' : '拉'}`),
      () => setVoteFeedback('定时设置未保存，请稍后重试'),
    ).finally(() => { dayEndSaving.current = false; setDayEndPending(false) })
  }
  const onReconcileAsk = (): void => {
    setModeConfirmOpen(false)
    setReconcilePending(true)
  }
  const onReconcileCancel = (): void => {
    setReconcilePending(false)
  }
  const onReconcileConfirm = (): void => {
    setReconcilePending(false)
    store.reconcile().then(
      () => {
        setUtilityOpen(false)
        setModeConfirmOpen(false)
        setVoteFeedback(RECONCILE_DONE)
      },
      () => setVoteFeedback('核对香火失败，请稍后重试'),
    )
  }
  const onOpenHomepage = (): void => {
    setUtilityOpen(false)
    setModeConfirmOpen(false)
    window.open(HOMEPAGE_URL, '_blank', 'noopener,noreferrer')
  }
  const onModeAsk = (): void => {
    setReconcilePending(false)
    setModeConfirmOpen(true)
  }
  const onModeCancel = (): void => {
    if (!modeChanging) setModeConfirmOpen(false)
  }
  const onModeConfirm = (): void => {
    if (modeChanging) return
    const target: HostAuthorityPreference = state.authorityMode === 'LOCAL_FAKE_DEV' ? 'online' : 'local'
    setModeChanging(true)
    store.selectAuthorityMode(target).then(
      () => {
        setModeConfirmOpen(false)
        setUtilityOpen(false)
        setVoteFeedback(target === 'local'
          ? '已进入离线模式 · 香火与梁祠只记本机'
          : '已进入在线模式 · 重新连接天庭')
      },
      (error: unknown) => {
        console.warn(`[dsh-liangxiang] mode change failed: ${error instanceof Error ? error.message : String(error)}`)
        setModeConfirmOpen(false)
        setVoteFeedback(target === 'online' ? '无法连接天庭，仍保持离线模式' : '切换离线模式失败，请稍后重试')
      },
    ).finally(() => setModeChanging(false))
  }
  const onShowVersion = (): void => {
    setUtilityOpen(false)
    setModeConfirmOpen(false)
    setReleaseNotesVisible(true)
  }
  const closePanel = (): void => {
    cancelTap()
    setComments([])
    if (welcomeVisible) return
    if (releaseNotesVisible) {
      onReleaseNotesClose()
      return
    }
    savePanelOpen(false, typeof localStorage === 'undefined' ? null : localStorage)
    setOpen(false)
  }
  const onBadgeToggle = (event: ReactMouseEvent<HTMLButtonElement>): void => {
    if (suppressClick.current && event.detail > 0) {
      suppressClick.current = false
      return
    }
    suppressClick.current = false
    const togglePanel = (): void => {
      setComments([])
      if (open && (welcomeVisible || releaseNotesVisible)) return
      savePanelOpen(!open, typeof localStorage === 'undefined' ? null : localStorage)
      setOpen(!open)
    }
    if (event.detail === 0) {
      cancelTap()
      togglePanel()
      return
    }
    const now = Date.now()
    const consecutive = now - tap.current.last <= SQUISH_DOUBLE_MS
    if (tap.current.timer !== null) window.clearTimeout(tap.current.timer)
    tap.current.last = now
    tap.current.timer = null
    if (!consecutive) {
      setTapPending(true)
      tap.current.timer = window.setTimeout(() => {
        cancelTap()
        togglePanel()
      }, SQUISH_DOUBLE_MS)
      return
    }
    setTapPending(false)
    if (now - lastComment.current.time < SQUISH_COMMENT_GAP_MS) return
    const text = pickSquishLabel(lastComment.current.text)
    const id = lastComment.current.id + 1
    lastComment.current = { time: now, text, id }
    setComments(current => [{ id, text, createdAt: now }, ...current].slice(0, SQUISH_MAX_ROWS))
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
      data-liangxiang-root=""
    >
      <BadgeButton
        open={open}
        liangziState={state.snapshot.liangziState}
        {...(state.snapshot.liangziPolicyVersion === undefined ? {} : { policyVersion: state.snapshot.liangziPolicyVersion })}
        liangQiFill={throttle.fill}
        reducedMotion={reducedMotion}
        dragging={dragging}
        onToggle={onBadgeToggle}
        onEscape={closePanel}
        onProbeLatest={() => {
          if (!dragging) store.refresh()
        }}
        onPointerDown={onPointerDown}
        buttonRef={buttonRef}
      />
      <BadgeFeedback position={position} viewport={viewport} open={open}
        comments={comments} suppressed={tapPending || dragging || comments.length > 0} reducedMotion={reducedMotion} />
      {open && (
        <Panel
          state={state}
          reducedMotion={reducedMotion}
          throttle={throttle}
          soundLevel={soundLevel}
          onCycleSound={onCycleSound}
          welcomeVisible={welcomeVisible}
          onChooseOnline={onChooseOnline}
          onChooseLocal={onChooseLocal}
          releaseNotesVisible={releaseNotesVisible}
          onReleaseNotesClose={onReleaseNotesClose}
          avatarPulse={avatarPulse}
          condensedIncense={condensedIncense}
          voteFeedback={voteFeedback}
          positionPulse={positionPulse}
          placement={panelPlacementFor(position, viewport)}
          pinnedHint={pinnedHint}
          onToggleHint={(kind) => setPinnedHint((current) => current === kind ? null : kind)}
          displayTotalIncense={displayTotalIncense}
          displayUniqueVoters={displayUniqueVoters}
          onVote={onVote}
          dayEndPending={dayEndPending}
          onDayEndToggle={() => changeDayEnd()}
          onDayEndDirection={type => changeDayEnd(type)}
          onVoteClick={onVoteClick}
          onVotePointerDown={onVotePointerDown}
          onVotePointerUp={onVotePointerUp}
          onVotePointerCancel={onVotePointerCancel}
          chargeVoteType={chargeVoteType}
          charge={charge}
          dumpBurst={dumpBurst}
          localEpithet={localEpithet}
          localIncense={visibleIncense}
          dismissedBroadcastId={dismissedBroadcastId}
          onBroadcastDismiss={onBroadcastDismiss}
          onInsufficientVote={onInsufficientVote}
          onClose={closePanel}
          reconcilePending={reconcilePending}
          utilityOpen={utilityOpen}
          onUtilityToggle={() => {
            if (utilityOpen) {
              setUtilityOpen(false)
              setReconcilePending(false)
              setModeConfirmOpen(false)
            } else {
              setUtilityOpen(true)
            }
          }}
          onUtilityClose={() => {
            setUtilityOpen(false)
            setReconcilePending(false)
            setModeConfirmOpen(false)
          }}
          onOpenHomepage={onOpenHomepage}
          modeConfirmOpen={modeConfirmOpen}
          modeChanging={modeChanging}
          onModeAsk={onModeAsk}
          onModeConfirm={onModeConfirm}
          onModeCancel={onModeCancel}
          onShowVersion={onShowVersion}
          onReconcileAsk={onReconcileAsk}
          onReconcileConfirm={onReconcileConfirm}
          onReconcileCancel={onReconcileCancel}
          onOpenLiangci={() => {
            setUtilityOpen(false)
            setReconcilePending(false)
            setModeConfirmOpen(false)
            setLiangciOpen(true)
            void store.loadHistory()
          }}
          {...(state.authorityMode === 'LOCAL_FAKE_DEV'
            ? { onCycleLocalCase: () => store.cycleLocalCase() }
            : {})}
        />
      )}
      {liangciOpen && (
        <LiangciModal
          businessDate={state.businessDate}
          history={historyState}
          reducedMotion={reducedMotion}
          onClose={closeLiangci}
          onRetry={() => { void store.loadHistory() }}
        />
      )}
    </div>
  )
}
