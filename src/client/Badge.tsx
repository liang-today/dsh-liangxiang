/**
 * 梁相 entry + panel container.
 *
 * `BadgeButton` is the presentational docked entry: the current 梁子 state IS
 * the icon (so the global mood is readable without opening anything), and the
 * hover/focus tooltip stays the frozen `今日梁相`. It is freely placeable —
 * drag it anywhere in the frame; the position is remembered per browser.
 *
 * `LiangxiangBadge` is the stateful container that the overlay slot renders: it
 * owns placement, open/close, Escape/outside-click dismissal, focus return,
 * reduced-motion detection, and the transient avatar-pulse / 凝香 /
 * vote-feedback timers. All business state lives in the store.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactElement, RefObject } from 'react'
import type { LiangziState, VoteType } from '../domain/index.ts'
import { HOMEPAGE_URL, HOVER_TEXT, LIANGZI_STATE_LABELS, NO_INCENSE_GAG, NO_INCENSE_REASON, RECONCILE_DONE, VOTE_DOWN_NAME, VOTE_UP_NAME } from '../shared/index.ts'
import type { HostAuthorityPreference } from '../shared/wire.ts'
import { cycleSoundLevel, playIncenseEarn, playLiangziShift, playNoIncense, playVolumePreview, playVoteDown, playVoteUp, soundLevel as readSoundLevel } from './sound.ts'
import { hasSeenWelcome, markWelcomeSeen, WELCOME_TIMEOUT_SECONDS } from './welcome.ts'
import {
  BADGE_ICON_SIZE,
  BADGE_SIZE,
  clampBadgePosition,
  loadBadgePosition,
  loadPanelOpen,
  panelPlacementFor,
  saveBadgePosition,
  savePanelOpen,
  type BadgePoint,
} from './badge-position.ts'
import { LiangAvatar } from './LiangAvatar.tsx'
import { LiangciModal } from './LiangciModal.tsx'
import { createLiveLiangxiangStore } from './live-store.ts'
import { Panel } from './Panel.tsx'
import { color, font } from './theme.ts'
import { useThrottleFill } from './use-throttle-fill.ts'

/** Preserve the exact earned-incense jump carried by one authoritative frame. */
export function earnedIncenseGain(previous: number, current: number): number {
  return Math.max(0, current - previous)
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
}
[data-liangxiang-badge]:hover,
[data-liangxiang-badge][aria-expanded="true"] {
  border-color: color-mix(in srgb, ${color.ritualGold} 66%, ${color.border});
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.26), 0 0 0 3px color-mix(in srgb, ${color.ritualGold} 10%, transparent), inset 0 1px 0 rgba(255, 255, 255, 0.14);
}
[data-liangxiang-badge][data-dragging="true"] {
  cursor: grabbing;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.08);
}
[data-liangxiang-badge]:focus-visible,
[data-liangxiang-badge][aria-expanded="true"]:focus-visible {
  outline: 2px solid ${color.brand};
  outline-offset: 2px;
}
[data-liangxiang-badge-tooltip] {
  position: absolute;
  left: 50%;
  padding: 4px 8px;
  border: 1px solid ${color.border};
  border-radius: 8px;
  background: ${color.bgLayer};
  color: ${color.textPrimary};
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.18);
  font: 600 11px/16px ${font.family};
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 100ms ease, transform 100ms ease;
}
[data-liangxiang-badge][data-tooltip-side="above"] [data-liangxiang-badge-tooltip] {
  bottom: calc(100% + 8px);
  transform: translate(-50%, 3px);
}
[data-liangxiang-badge][data-tooltip-side="below"] [data-liangxiang-badge-tooltip] {
  top: calc(100% + 8px);
  transform: translate(-50%, -3px);
}
[data-liangxiang-badge]:hover [data-liangxiang-badge-tooltip],
[data-liangxiang-badge]:focus-visible [data-liangxiang-badge-tooltip] {
  opacity: 1;
}
[data-liangxiang-badge][data-tooltip-side="above"]:hover [data-liangxiang-badge-tooltip],
[data-liangxiang-badge][data-tooltip-side="above"]:focus-visible [data-liangxiang-badge-tooltip],
[data-liangxiang-badge][data-tooltip-side="below"]:hover [data-liangxiang-badge-tooltip],
[data-liangxiang-badge][data-tooltip-side="below"]:focus-visible [data-liangxiang-badge-tooltip] {
  transform: translate(-50%, 0);
}
@media (prefers-reduced-motion: reduce) {
  [data-liangxiang-badge],
  [data-liangxiang-badge-tooltip] { transition: none !important; }
}
`

export interface BadgeButtonProps {
  open: boolean
  /** Drives the icon: the entry shows the current central 梁子 state. */
  liangziState: LiangziState
  /** Next-incense fill: logo and panel bob at the same cadence. */
  liangQiFill?: number
  reducedMotion?: boolean
  dragging?: boolean
  /** Keep the hover label on the opposite side from the expanded panel. */
  tooltipSide?: 'above' | 'below'
  onToggle: () => void
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
  liangQiFill = 1,
  reducedMotion = false,
  dragging = false,
  tooltipSide = 'above',
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
      title={HOVER_TEXT}
      aria-label={`${HOVER_TEXT}：${LIANGZI_STATE_LABELS[liangziState]}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onToggle}
      onPointerEnter={() => onProbeLatest?.()}
      onFocus={() => onProbeLatest?.()}
      onPointerDown={onPointerDown}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) onEscape()
      }}
      style={{
        ...buttonStyle,
        cursor: dragging ? 'grabbing' : 'grab',
      }}
      data-liangxiang-badge=""
      data-liangxiang-badge-state={liangziState}
      data-dragging={dragging}
      data-tooltip-side={tooltipSide}
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
          pulse={false}
          reducedMotion={reducedMotion}
          size={BADGE_ICON_SIZE}
          hideLabel
          chrome="none"
          liangQiFill={liangQiFill}
        />
      </span>
      <span aria-hidden="true" data-liangxiang-badge-tooltip="">{HOVER_TEXT}</span>
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
  // Reopening the panel while offline reconnects; while live it forces a
  // host re-bootstrap so the expanded 今日梁案 is not up to ~1s stale.
  useEffect(() => {
    if (open) store.refresh({ force: true })
  }, [open, store])
  useEffect(() => {
    if (welcomeVisible) setOpen(true)
  }, [welcomeVisible])
  const reducedMotion = useReducedMotion()
  // Smoothed + rate-extrapolated ring fill for the 油门 feel (presentation only).
  const throttle = useThrottleFill(state.personal, reducedMotion)
  const [soundLevel, setSoundLevel] = useState(() => readSoundLevel())
  const onCycleSound = useCallback(() => {
    const next = cycleSoundLevel()
    setSoundLevel(next)
    playVolumePreview()
  }, [])
  const [welcomeSeconds, setWelcomeSeconds] = useState(WELCOME_TIMEOUT_SECONDS)
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
  useEffect(() => {
    if (!welcomeVisible) return undefined
    setWelcomeSeconds(WELCOME_TIMEOUT_SECONDS)
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      const left = WELCOME_TIMEOUT_SECONDS - Math.floor((Date.now() - startedAt) / 1000)
      if (left <= 0) {
        window.clearInterval(timer)
        onChooseOnline()
        return
      }
      setWelcomeSeconds(left)
    }, 250)
    return () => window.clearInterval(timer)
  }, [welcomeVisible, onChooseOnline])

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

  // One short 凝香 feedback showing how many incense sticks were earned in
  // this update. The first
  // live frame is a baseline (Cmd+Shift+R starts at earned=0 then hydrates),
  // never a condensation. Bob / 下一炷 may replay; this overlay must not.
  const [condensedIncense, setCondensedIncense] = useState(0)
  const prevEarned = useRef(state.observedEarnedIncenseToday)
  const incenseEarnPrimed = useRef(false)
  useEffect(() => {
    if (state.connection !== 'live') {
      incenseEarnPrimed.current = false
      return undefined
    }
    if (!incenseEarnPrimed.current) {
      incenseEarnPrimed.current = true
      prevEarned.current = state.observedEarnedIncenseToday
      return undefined
    }
    const gained = earnedIncenseGain(prevEarned.current, state.observedEarnedIncenseToday)
    prevEarned.current = state.observedEarnedIncenseToday
    if (gained === 0) return undefined
    setCondensedIncense(gained)
    playIncenseEarn()
    const timer = window.setTimeout(() => setCondensedIncense(0), 1400)
    return () => window.clearTimeout(timer)
  }, [state.connection, state.observedEarnedIncenseToday])

  // Transient vote feedback (已上香).
  const [voteFeedback, setVoteFeedback] = useState('')
  const [utilityOpen, setUtilityOpen] = useState(false)
  const [versionInfoOpen, setVersionInfoOpen] = useState(false)
  const [reconcilePending, setReconcilePending] = useState(false)
  const [modeConfirmOpen, setModeConfirmOpen] = useState(false)
  const [modeChanging, setModeChanging] = useState(false)
  useEffect(() => {
    if (voteFeedback === '') return undefined
    const timer = window.setTimeout(() => setVoteFeedback(''), 2000)
    return () => window.clearTimeout(timer)
  }, [voteFeedback])
  useEffect(() => {
    if (!open) {
      setUtilityOpen(false)
      setVersionInfoOpen(false)
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

  const onVote = (voteType: VoteType): void => {
    store.vote(voteType).then(
      (result) => {
        if (result.status === 'accepted') {
          if (voteType === 'up') playVoteUp()
          else playVoteDown()
          setVoteFeedback(`已上香 · ${voteType === 'up' ? VOTE_UP_NAME : VOTE_DOWN_NAME}（剩余 ${result.remainingIncense} 炷）`)
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
        setVoteFeedback('打梁失败，请稍后重试')
      },
    )
  }

  const onInsufficientVote = (voteType: VoteType): void => {
    playNoIncense(voteType)
    setVoteFeedback(NO_INCENSE_GAG)
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
    setVersionInfoOpen(true)
  }

  const placement = panelPlacementFor(position, viewport)

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
        liangQiFill={throttle.fill}
        reducedMotion={reducedMotion}
        dragging={dragging}
        tooltipSide={placement.stack === 'above' ? 'below' : 'above'}
        onToggle={() => {
          if (suppressClick.current) {
            suppressClick.current = false
            return
          }
          setOpen((value) => {
            if (welcomeVisible && value) return value
            const next = !value
            savePanelOpen(next, typeof localStorage === 'undefined' ? null : localStorage)
            return next
          })
        }}
        onEscape={() => {
          if (welcomeVisible) return
          savePanelOpen(false, typeof localStorage === 'undefined' ? null : localStorage)
          setOpen(false)
        }}
        onProbeLatest={() => {
          if (!dragging) store.refresh()
        }}
        onPointerDown={onPointerDown}
        buttonRef={buttonRef}
      />
      {open && (
        <Panel
          state={state}
          reducedMotion={reducedMotion}
          throttle={throttle}
          soundLevel={soundLevel}
          onCycleSound={onCycleSound}
          versionInfoOpen={versionInfoOpen}
          onVersionInfoClose={() => setVersionInfoOpen(false)}
          welcomeVisible={welcomeVisible}
          welcomeSeconds={welcomeSeconds}
          onChooseOnline={onChooseOnline}
          onChooseLocal={onChooseLocal}
          avatarPulse={avatarPulse}
          condensedIncense={condensedIncense}
          voteFeedback={voteFeedback}
          positionPulse={positionPulse}
          placement={placement}
          onVote={onVote}
          onInsufficientVote={onInsufficientVote}
          onClose={() => {
            if (welcomeVisible) return
            savePanelOpen(false, typeof localStorage === 'undefined' ? null : localStorage)
            setVersionInfoOpen(false)
            setOpen(false)
          }}
          reconcilePending={reconcilePending}
          utilityOpen={utilityOpen}
          onUtilityToggle={() => {
            if (utilityOpen) {
              setUtilityOpen(false)
              setReconcilePending(false)
              setModeConfirmOpen(false)
            } else {
              setVersionInfoOpen(false)
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
