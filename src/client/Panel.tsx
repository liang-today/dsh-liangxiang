/**
 * The expanded 梁向 panel — exactly four visual regions (frozen UI contract):
 *
 *   1. 今日梁案 (single active case)
 *   2. overlay flanks | centered 梁子 + 香火环 | 梁位
 *   3. two equal-width vote buttons 夯 · 升梁 / 拉 · 降梁
 *   4. 三界香火 + 五行香客 + 右侧礼仪控制列（上达天听 / 进入梁祠）
 *
 * No personal-growth section, no ranking, no third option.
 * Presentational only (no hooks); the container wires state and callbacks.
 */
import type { CSSProperties, KeyboardEvent, ReactElement } from 'react'
import { LIANG_POSITION_DECIMALS, formatCompactCount, formatRatioPercents, formatZhCompactCount, type VoteType } from '../domain/index.ts'
import {
  ABSURD_CLAIM_NOTICE,
  ACCOUNTING_UNAVAILABLE_HINT,
  AUTHORITY_MODE_NOTES,
  INCENSE_STAT_HINT,
  INCENSE_STAT_LABEL,
  LIANGZI_STATE_LABELS,
  LIANG_POSITION_LABEL,
  LIANGCI_ENTRY_HINT,
  LIANGCI_ENTRY_LABEL,
  MY_INCENSE_LABEL,
  NEXT_INCENSE_LABEL,
  NEXT_INCENSE_PROGRESS_LABEL,
  NEXT_INCENSE_UNIT,
  NEXT_INCENSE_WEIGHT_ROWS,
  NEXT_INCENSE_WEIGHT_TITLE,
  NO_INCENSE_REASON,
  OFFLINE_REASON,
  PANEL_TITLE,
  PANEL_TITLE_LOCAL,
  PLUGIN_PACKAGE_NAME,
  PLUGIN_VERSION,
  CYCLE_LOCAL_CASE_LABEL,
  STAT_LIFETIME_LABEL,
  STAT_TODAY_LABEL,
  VOTER_STAT_HINT,
  VOTER_STAT_LABEL,
  VOTE_DOWN_LABEL,
  VOTE_DOWN_NAME,
  VOTE_UP_LABEL,
  VOTE_UP_NAME,
  RECONCILE_CONFIRM_CANCEL,
  RECONCILE_CONFIRM_OK,
  RECONCILE_CONFIRM_PROMPT,
  RECONCILE_HINT,
  RECONCILE_LABEL,
  WELCOME_LINES,
  WELCOME_LOCAL_LABEL,
  WELCOME_ONLINE_LABEL,
  WELCOME_PRIVACY_NOTE,
  WELCOME_TITLE,
  liangziRatioRangeText,
} from '../shared/index.ts'
import { BADGE_SIZE, PANEL_GAP, PANEL_WIDTH, type PanelPlacement } from './badge-position.ts'
import { HeavenHearIcon } from './HeavenHearIcon.tsx'
import { ThreeRealmsIncenseIcon, FivePhasePilgrimIcon } from './SocialStatIcons.tsx'
import { LiangAvatar } from './LiangAvatar.tsx'
import { LiangciIcon } from './LiangciIcon.tsx'
import { LiangQiRing, AVATAR_SLOT, RING_SIZE } from './LiangQiRing.tsx'
import { SoundIcon } from './SoundIcon.tsx'
import type { LiangbiaoViewState } from './store.ts'
import { color, font } from './theme.ts'
import type { ThrottledProgress } from './use-throttle-fill.ts'

export interface PanelProps {
  state: LiangbiaoViewState
  reducedMotion: boolean
  /** Smoothed + rate-extrapolated fill for the 油门 animation (optional). */
  throttle?: ThrottledProgress
  /** Sound volume step 0-3 (无/小/中/大). */
  soundLevel: number
  onCycleSound: () => void
  /** Long-press (3s) on the sound icon reveals the version; a revealed pill shows. */
  versionReveal: boolean
  onSoundPressStart: () => void
  onSoundPressEnd: () => void
  /** First-run welcome overlay visibility. */
  welcomeVisible: boolean
  /** Seconds remaining before the welcome auto-enters online. */
  welcomeSeconds: number
  onDismissWelcome: () => void
  /** First-run: switch this Host to the in-process local loop. */
  onChooseLocal: () => void
  avatarPulse: boolean
  /** Actual incense gained in the latest live update; 0 means no feedback. */
  condensedIncense: number
  /** Transient feedback line under the buttons (e.g. 已上香), empty = none. */
  voteFeedback: string
  /** Play one short pop on the 梁位 value (the container detects the change). */
  positionPulse?: boolean
  /** Where to draw relative to the (freely placeable) badge. */
  placement?: PanelPlacement
  onVote: (voteType: VoteType) => void
  /** Empty-pool click: never sends a vote; plays the playful local cue. */
  onInsufficientVote: (voteType: VoteType) => void
  onClose: () => void
  /** First click: open the confirm chip. Confirm is the expensive sync. */
  onReconcileAsk: () => void
  onReconcileConfirm: () => void
  onReconcileCancel: () => void
  reconcilePending: boolean
  /** Open the read-only 梁祠 calendar; remains inside Region 4. */
  onOpenLiangci: () => void
  /** LOCAL_FAKE_DEV only: cycle the prepared 今日梁案 list. */
  onCycleLocalCase?: () => void
}

const panelStyle: CSSProperties = {
  position: 'absolute',
  width: `${PANEL_WIDTH}px`,
  maxHeight: 'min(440px, calc(100vh - 24px))',
  overflow: 'visible',
  boxSizing: 'border-box',
  padding: '14px',
  borderRadius: '18px',
  border: `1px solid ${color.border}`,
  background: `radial-gradient(circle at 50% 34%, color-mix(in srgb, ${color.ritualGold} 10%, transparent), transparent 38%), linear-gradient(180deg, color-mix(in srgb, ${color.ritualEmber} 5%, ${color.bgLayer}) 0%, ${color.bgLayer} 40%)`,
  color: color.textPrimary,
  fontFamily: font.family,
  boxShadow: '0 18px 48px rgba(0, 0, 0, 0.24), 0 2px 8px rgba(0, 0, 0, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
  pointerEvents: 'auto',
  isolation: 'isolate',
  outline: 'none',
}

const statStyle: CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  flex: '1 1 0',
  minWidth: 0,
  whiteSpace: 'nowrap',
  cursor: 'help',
  outline: 'none',
}

const statCopyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '1px',
  minWidth: 0,
}

const statLabelStyle: CSSProperties = {
  fontSize: '10px',
  lineHeight: 1.2,
  color: color.textSecondary,
}

const statValueStyle: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: '"tnum"',
  fontSize: '13px',
  fontWeight: 700,
  lineHeight: 1.2,
  color: color.textPrimary,
}

/**
 * Flank numbers use compact K/M/B so `5 炷` and `50K 当量` stay the same
 * visual width. The ring is already overlay-centered; this stops the *text*
 * of the two wings from looking ragged when one side hits thousands.
 */
const numericStyle: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: '"tnum"',
}

/** One voice for `梁位 83.021952% → 梁祖` — same size/weight, quiet glue vs facts. */
const positionLineStyle: CSSProperties = {
  fontFamily: font.family,
  fontSize: '13px',
  fontWeight: 600,
  lineHeight: '18px',
  letterSpacing: '0.15px',
}

const positionGlueStyle: CSSProperties = {
  ...positionLineStyle,
  color: color.textSecondary,
}

const positionFactStyle: CSSProperties = {
  ...positionLineStyle,
  color: color.textPrimary,
}

/**
 * Personal flanks overlay the core; they never take in-flow width. Otherwise
 * 「今日凝香」(wider copy) vs 「下一炷」 pulls `space-between` off-center and
 * the 梁子, ring, and incense dots drift sideways.
 */
const FLANK_WIDTH = 54
const CORE_PAD_Y = 20

const coreStyle: CSSProperties = {
  position: 'relative',
  padding: `${CORE_PAD_Y}px 0 42px`,
  overflow: 'visible',
}

const coreAnchorStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
}

const flankStyle: CSSProperties = {
  position: 'absolute',
  top: `${CORE_PAD_Y}px`,
  height: `${RING_SIZE}px`,
  width: `${FLANK_WIDTH}px`,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '2px',
  overflow: 'visible',
  whiteSpace: 'nowrap',
  pointerEvents: 'auto',
}

const flankCaptionStyle: CSSProperties = {
  fontSize: '10px',
  lineHeight: '14px',
  color: color.textSecondary,
}

/** Shared by 今日凝香 and 下一炷 so the two numbers are one voice. */
const flankValueStyle: CSSProperties = {
  ...numericStyle,
  fontSize: '13px',
  fontWeight: 700,
  color: color.ritualEmber,
  lineHeight: '18px',
}

const flankUnitStyle: CSSProperties = {
  fontSize: '9px',
  fontWeight: 500,
  color: color.textTertiary,
  lineHeight: '14px',
}

const voteRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '8px',
  marginTop: '10px',
}

const voteButtonBase: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: '44px',
  padding: '10px 0',
  borderRadius: '11px',
  fontFamily: font.family,
  fontSize: '13px',
  fontWeight: 700,
  lineHeight: '18px',
  textAlign: 'center',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  border: `1px solid ${color.border}`,
  transition: 'transform 100ms ease, box-shadow 120ms ease, filter 120ms ease, border-color 120ms ease',
}

/** Anchor the panel above or below the badge — never beside it. */
function placementStyle(placement: PanelPlacement): CSSProperties {
  const stack = placement.stack === 'below'
    ? { top: `calc(100% + ${PANEL_GAP}px)` }
    : { bottom: `calc(100% + ${PANEL_GAP}px)` }
  const horizontal = placement.align === 'end'
    ? { left: `calc(${BADGE_SIZE}px - ${PANEL_WIDTH}px)` }
    : { left: '0px' }
  return { ...horizontal, ...stack }
}

/** Panel-scoped CSS that inline styles cannot express (focus ring, keyframes). */
const PANEL_CSS = `
[data-liangbiao-panel] {
  animation: liangbiao-panel-enter 150ms cubic-bezier(.2,.8,.2,1) both;
}
[data-liangbiao-panel] button:focus-visible {
  outline: 2px solid ${color.brand};
  outline-offset: 2px;
}
[data-liangbiao-panel] button[disabled] {
  opacity: 0.55;
  cursor: not-allowed;
}
[data-liangbiao-panel] button[aria-disabled="true"]:not([disabled]) {
  opacity: 0.72;
  cursor: pointer;
}
[data-liangbiao-vote]:hover:not([disabled]) {
  transform: translateY(-1px);
  filter: brightness(1.04);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.16);
}
[data-liangbiao-vote]:active:not([disabled]) {
  transform: translateY(1px) scale(0.985);
  box-shadow: 0 2px 7px rgba(0, 0, 0, 0.14);
}
@keyframes liangbiao-panel-enter {
  from { opacity: 0; transform: translateY(4px) scale(0.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes liangbiao-position-pop {
  0% { transform: translateY(3px); opacity: 0.35; }
  45% { transform: translateY(0); opacity: 1; filter: brightness(1.5); }
  100% { transform: translateY(0); opacity: 1; }
}
[data-liangbiao-ritual] {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: none;
  background: ${color.bgSubtle};
  padding: 3px 6px;
  margin: 0;
  border-radius: 9px;
  cursor: pointer;
  font-family: inherit;
  font-size: 10px;
  line-height: 1;
  letter-spacing: 0.4px;
  color: ${color.textSecondary};
  box-shadow: inset 0 0 0 1px ${color.border};
  transform: translateY(0);
  transition: color 60ms ease, background-color 60ms ease, box-shadow 60ms ease, transform 60ms ease;
}
[data-liangbiao-ritual]:hover:not(:disabled),
[data-liangbiao-ritual]:focus-visible {
  color: ${color.textPrimary};
  background: ${color.bgLayer};
  box-shadow: inset 0 0 0 1px ${color.brand}, 0 4px 10px rgba(0, 0, 0, 0.12);
  transform: translateY(-1px);
}
[data-liangbiao-ritual] [data-liangbiao-hint] {
  position: absolute;
  right: 0;
  bottom: calc(100% + 6px);
  z-index: 2;
  padding: 5px 8px;
  border-radius: 9px;
  border: 1px solid ${color.border};
  background: ${color.bgLayer};
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.16);
  color: ${color.textPrimary};
  font-size: 11px;
  letter-spacing: 0;
  line-height: 1.35;
  white-space: nowrap;
  opacity: 0;
  transform: translateY(4px);
  pointer-events: none;
  transition: opacity 40ms ease, transform 40ms ease;
  transition-delay: 0s;
}
[data-liangbiao-ritual]:hover:not(:disabled) [data-liangbiao-hint],
[data-liangbiao-ritual]:focus-visible [data-liangbiao-hint] {
  opacity: 1;
  transform: translateY(0);
}
[data-liangbiao-personal="next-incense"] {
  cursor: help;
  outline: none;
}
[data-liangbiao-personal="next-incense"] [data-liangbiao-weight-hint] {
  position: absolute;
  right: 0;
  top: calc(100% - 8px);
  z-index: 3;
  min-width: 168px;
  padding: 6px 8px;
  border-radius: 10px;
  border: 1px solid ${color.border};
  background: ${color.bgLayer};
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.16);
  color: ${color.textPrimary};
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
  opacity: 0;
  transform: translateY(4px);
  pointer-events: none;
  transition: opacity 40ms ease, transform 40ms ease;
}
[data-liangbiao-personal="next-incense"]:hover [data-liangbiao-weight-hint],
[data-liangbiao-personal="next-incense"]:focus-within [data-liangbiao-weight-hint] {
  opacity: 1;
  transform: translateY(0);
}
[data-liangbiao-stat] [data-liangbiao-stat-hint] {
  position: absolute;
  left: 0;
  bottom: calc(100% + 8px);
  z-index: 3;
  min-width: 128px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid ${color.border};
  background: ${color.bgLayer};
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.16);
  color: ${color.textPrimary};
  opacity: 0;
  transform: translateY(4px);
  pointer-events: none;
  transition: opacity 40ms ease, transform 40ms ease;
}
[data-liangbiao-stat]:hover [data-liangbiao-stat-hint],
[data-liangbiao-stat]:focus-visible [data-liangbiao-stat-hint] {
  opacity: 1;
  transform: translateY(0);
}
[data-liangbiao-stat-hint] strong {
  display: block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.2px;
  margin-bottom: 6px;
}
[data-liangbiao-stat-hint] dl {
  margin: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 12px;
  row-gap: 3px;
  font-size: 11px;
  line-height: 1.35;
}
[data-liangbiao-stat-hint] dt {
  margin: 0;
  color: ${color.textTertiary};
  font-weight: 500;
}
[data-liangbiao-stat-hint] dd {
  margin: 0;
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
  font-weight: 600;
  color: ${color.textPrimary};
}
[data-liangbiao-weight-hint] table {
  border-collapse: collapse;
  width: 100%;
}
[data-liangbiao-weight-hint] th,
[data-liangbiao-weight-hint] td {
  padding: 2px 4px;
  text-align: left;
  font-weight: 500;
}
[data-liangbiao-weight-hint] caption {
  caption-side: top;
  text-align: left;
  font-weight: 700;
  padding-bottom: 4px;
}
@keyframes liangbiao-condense {
  0% { opacity: 0; transform: translate(-50%, 12px) scale(0.85); }
  22% { opacity: 1; transform: translate(-50%, 0) scale(1); }
  70% { opacity: 1; transform: translate(-50%, -3px) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -8px) scale(0.95); }
}
@media (prefers-reduced-motion: reduce) {
  [data-liangbiao-panel] * {
    animation: none !important;
    transition: none !important;
  }
}
`

const visuallyHidden: CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

function SocialStatHint(props: {
  kind: 'incense' | 'voters'
  label: string
  today: number
  lifetime: number
}): ReactElement {
  const todayText = props.today.toLocaleString('zh-CN')
  const lifetimeText = props.lifetime.toLocaleString('zh-CN')
  return (
    <div data-liangbiao-stat-hint={props.kind} role="tooltip">
      <strong>{props.label}</strong>
      <dl>
        <dt>{STAT_TODAY_LABEL}</dt>
        <dd>{todayText}</dd>
        <dt>{STAT_LIFETIME_LABEL}</dt>
        <dd>{lifetimeText}</dd>
      </dl>
    </div>
  )
}

export function Panel(props: PanelProps): ReactElement {
  const {
    state, reducedMotion, throttle, soundLevel, onCycleSound, versionReveal, onSoundPressStart, onSoundPressEnd,
    welcomeVisible, welcomeSeconds, onDismissWelcome, onChooseLocal, avatarPulse, condensedIncense, voteFeedback,
    onVote, onInsufficientVote, onClose, onReconcileAsk, onReconcileConfirm, onReconcileCancel,
    reconcilePending, onOpenLiangci, onCycleLocalCase,
  } = props
  const placement = props.placement ?? { stack: 'above', align: 'start' }
  const positionPulse = props.positionPulse ?? false
  const { snapshot, personal, activeCase, lifetimeIncense, lifetimeVoters } = state
  // Throttled (smoothed/extrapolated) display values — presentation only. The
  // authoritative remaining incense / vote availability stay on `personal`.
  const displayFill = throttle?.fill ?? personal.liangQiFill
  const displayTokensToNext = throttle?.tokensToNext ?? personal.tokensToNextIncense
  const offline = state.connection !== 'live'
  const outOfIncense = personal.remainingIncense <= 0
  const votingDisabled = outOfIncense || offline
  const disabledReason = offline
    ? OFFLINE_REASON
    : outOfIncense
      ? NO_INCENSE_REASON
      : ''
  const absurdNotice = state.accountingNotice === 'claim_capped_absurd'
  const statusLine = offline
    ? OFFLINE_REASON
    : !state.accountingAvailable
      ? ACCOUNTING_UNAVAILABLE_HINT
      : absurdNotice
        ? ABSURD_CLAIM_NOTICE
        : voteFeedback !== ''
          ? voteFeedback
          : outOfIncense
            ? NO_INCENSE_REASON
            : ''

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      if (reconcilePending) onReconcileCancel()
      else onClose()
    }
  }

  // Percentages come from the snapshot's own raw counts, so they can never
  // contradict the Liangzi state rendered beside them (AGENTS.md §12).
  const panelTitle = state.authorityMode === 'LOCAL_FAKE_DEV' ? PANEL_TITLE_LOCAL : PANEL_TITLE
  const percents = formatRatioPercents(snapshot.upVotes, snapshot.downVotes, LIANG_POSITION_DECIMALS)
  const earnedExact = personal.earnedIncenseToday.toLocaleString('zh-CN')
  const remainingExact = personal.remainingIncense.toLocaleString('zh-CN')
  const toNextExact = personal.tokensToNextIncense.toLocaleString('zh-CN')
  const earnedCompact = formatCompactCount(personal.earnedIncenseToday)
  const remainingCompact = formatCompactCount(personal.remainingIncense)
  const summary = `当前梁子状态：${LIANGZI_STATE_LABELS[snapshot.liangziState]}`
    + `（${liangziRatioRangeText(snapshot.liangziState)}）。`
    + `${LIANG_POSITION_LABEL} ${percents.up}（即${VOTE_UP_NAME} ${percents.up}，${VOTE_DOWN_NAME} ${percents.down}）。`
    + `今日生成香火 ${earnedExact} 炷，剩余 ${remainingExact} 炷，距下一炷还差 ${toNextExact} 当量（Pro 口径）。`
    + `${AUTHORITY_MODE_NOTES[state.authorityMode]}。`

  return (
    <section
      role="dialog"
      aria-label={panelTitle}
      data-liangbiao-panel=""
      data-liangbiao-authority={state.authorityMode}
      tabIndex={-1}
      style={{ ...panelStyle, ...placementStyle(placement) }}
      onKeyDown={onKeyDown}
    >
      <style>{PANEL_CSS}</style>

      {welcomeVisible && (
        <div
          role="dialog"
          aria-label={WELCOME_TITLE}
          data-liangbiao-welcome=""
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 5,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '10px',
            padding: '18px',
            borderRadius: '18px',
            border: `1px solid color-mix(in srgb, ${color.ritualGold} 24%, ${color.border})`,
            background: `linear-gradient(180deg, color-mix(in srgb, ${color.ritualGold} 9%, ${color.bgLayer}), color-mix(in srgb, ${color.bgLayer} 94%, transparent))`,
            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.10)',
            backdropFilter: 'blur(7px)',
            boxSizing: 'border-box',
          }}
        >
          <strong style={{ fontSize: '15px', fontWeight: 700, color: color.textPrimary }}>{WELCOME_TITLE}</strong>
          {WELCOME_LINES.map((line) => (
            <p key={line} style={{ margin: 0, fontSize: '12px', lineHeight: '1.6', color: color.textSecondary, textAlign: 'center' }}>
              {line}
            </p>
          ))}
          <p
            data-liangbiao-welcome-privacy=""
            style={{
              margin: '2px 0 0',
              fontSize: '10px',
              lineHeight: '1.5',
              color: color.textTertiary,
              textAlign: 'center',
            }}
          >
            {WELCOME_PRIVACY_NOTE}
          </p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px', width: '100%' }}>
            <button
              type="button"
              data-liangbiao-welcome-online=""
              onClick={onDismissWelcome}
              style={{
                flex: 1,
                border: 'none',
                borderRadius: '10px',
                padding: '8px 10px',
                background: `linear-gradient(135deg, ${color.ritualEmber}, color-mix(in srgb, ${color.ritualEmber} 74%, #7f2f25))`,
                color: '#ffffff',
                fontFamily: font.family,
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {WELCOME_ONLINE_LABEL}（{welcomeSeconds}）
            </button>
            <button
              type="button"
              data-liangbiao-welcome-local=""
              onClick={onChooseLocal}
              style={{
                flex: 1,
                border: `1px solid ${color.border}`,
                borderRadius: '10px',
                padding: '8px 10px',
                background: 'transparent',
                color: color.textSecondary,
                fontFamily: font.family,
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {WELCOME_LOCAL_LABEL}
            </button>
          </div>
        </div>
      )}

      {/* Region 1 — 今日梁案 */}
      <header
        data-liangbiao-region="case"
        style={{ position: 'relative', marginBottom: '6px', padding: '0 24px', textAlign: 'center' }}
      >
        <h2 style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: color.textTertiary, letterSpacing: '1.6px' }}>
          {panelTitle}
        </h2>
        <p
          data-liangbiao-case-title=""
          title={activeCase.title}
          style={{
            // Sound / close controls only occupy the title row. Let the case
            // copy reclaim the full panel content width beneath them.
            margin: '6px -24px 0',
            fontSize: '14px',
            lineHeight: '20px',
            fontWeight: 650,
            color: color.textPrimary,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            whiteSpace: 'normal',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {activeCase.title}
        </p>
        {onCycleLocalCase !== undefined && (
          <button
            type="button"
            data-liangbiao-cycle-case=""
            onClick={onCycleLocalCase}
            style={{
              margin: '4px 0 0',
              border: 'none',
              background: 'transparent',
              color: color.brand,
              fontSize: '11px',
              fontWeight: 600,
              lineHeight: '14px',
              padding: '0',
              cursor: 'pointer',
            }}
          >
            {CYCLE_LOCAL_CASE_LABEL}
          </button>
        )}
        <button
          type="button"
          aria-label={`声音：${['无', '小', '中', '大'][soundLevel] ?? ''}`}
          aria-pressed={soundLevel > 0}
          onClick={onCycleSound}
          onPointerDown={onSoundPressStart}
          onPointerUp={onSoundPressEnd}
          onPointerLeave={onSoundPressEnd}
          onPointerCancel={onSoundPressEnd}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            border: 'none',
            background: 'transparent',
            color: soundLevel > 0 ? color.textSecondary : color.textTertiary,
            padding: '4px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <SoundIcon level={soundLevel} />
        </button>
        {versionReveal && (
          <span
            role="status"
            data-liangbiao-version=""
            style={{
              position: 'absolute',
              top: '26px',
              left: '0px',
              padding: '2px 8px',
              borderRadius: '999px',
              border: `1px solid ${color.border}`,
              background: color.bgLayer,
              fontSize: '11px',
              lineHeight: '16px',
              color: color.textSecondary,
              whiteSpace: 'nowrap',
            }}
          >
            {PLUGIN_PACKAGE_NAME}@{PLUGIN_VERSION}
          </span>
        )}
        <button
          type="button"
          aria-label="关闭面板"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            border: 'none',
            background: 'transparent',
            color: color.textTertiary,
            fontSize: '16px',
            lineHeight: '16px',
            padding: '4px',
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      </header>

      {/*
        Region 2 — the ring/avatar/incense-dots occupy the only in-flow column
        and are therefore always the panel's horizontal center. Personal
        numbers overlay left/right and cannot shove that column.

          今日凝香 N 炷   [香火环 + 梁子]   下一炷 X 当量
                          梁位 83.021952% → 梁祖
      */}
      <div data-liangbiao-region="core" style={coreStyle}>
        <div data-liangbiao-core-anchor="" style={coreAnchorStyle}>
          <LiangQiRing
            personal={personal}
            reducedMotion={reducedMotion}
            condensedIncense={condensedIncense}
            fillOverride={displayFill}
            footer={(
              <span
                data-liangbiao-liang-position=""
                title={`${VOTE_UP_NAME} ${percents.up} / ${VOTE_DOWN_NAME} ${percents.down} → ${LIANGZI_STATE_LABELS[snapshot.liangziState]}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  boxSizing: 'border-box',
                  padding: '4px 9px',
                  borderRadius: '999px',
                  border: `1px solid color-mix(in srgb, ${color.ritualGold} 20%, ${color.border})`,
                  background: `color-mix(in srgb, ${color.bgLayer} 90%, ${color.ritualGold})`,
                  boxShadow: '0 5px 16px rgba(0, 0, 0, 0.10)',
                  whiteSpace: 'nowrap',
                  ...positionLineStyle,
                }}
              >
                <span data-liangbiao-liang-position-label="" style={positionGlueStyle}>
                  {LIANG_POSITION_LABEL}
                </span>
                <strong
                  data-liangbiao-liang-position-value=""
                  style={{
                    ...positionFactStyle,
                    ...numericStyle,
                    animation: positionPulse && !reducedMotion
                      ? 'liangbiao-position-pop 0.5s ease-out 1'
                      : undefined,
                  }}
                >
                  {percents.up}
                </strong>
                <span aria-hidden="true" data-liangbiao-liang-position-causal="" style={{ ...positionGlueStyle, color: color.textTertiary }}>→</span>
                <span
                  data-liangbiao-liangzi-title=""
                  title={`${LIANGZI_STATE_LABELS[snapshot.liangziState]}：${liangziRatioRangeText(snapshot.liangziState)}`}
                  style={{ ...positionFactStyle, color: color.ritualEmber }}
                >
                  {LIANGZI_STATE_LABELS[snapshot.liangziState]}
                </span>
              </span>
            )}
          >
            <LiangAvatar
              state={snapshot.liangziState}
              pulse={avatarPulse}
              reducedMotion={reducedMotion}
              size={AVATAR_SLOT}
              hideLabel
              liangQiFill={displayFill}
            />
          </LiangQiRing>
        </div>
        <div style={{ ...flankStyle, left: '0px' }} data-liangbiao-personal="incense">
          <span style={flankCaptionStyle}>{MY_INCENSE_LABEL}</span>
          <span title={`今日生成 ${earnedExact} 炷`} style={flankValueStyle}>
            <span data-liangbiao-compact="incense">{earnedCompact}</span>
            <span style={flankUnitStyle}> 炷</span>
          </span>
          <span title={`余 ${remainingExact} 炷`} style={flankUnitStyle}>
            余 {remainingCompact} 炷
          </span>
        </div>
        <div
          style={{ ...flankStyle, right: '0px' }}
          data-liangbiao-personal="next-incense"
          tabIndex={0}
          aria-label={`${NEXT_INCENSE_LABEL} ${toNextExact} ${NEXT_INCENSE_UNIT}，悬停查看模型权重`}
        >
          <span style={flankCaptionStyle}>{NEXT_INCENSE_LABEL}</span>
          <span style={flankValueStyle}>
            <span
              data-liangbiao-compact="next-incense"
              title={`${toNextExact} ${NEXT_INCENSE_UNIT}`}
            >
              {formatCompactCount(displayTokensToNext, 0)}
            </span>
            <span style={flankUnitStyle}> {NEXT_INCENSE_UNIT}</span>
          </span>
          <span style={flankUnitStyle}>
            {NEXT_INCENSE_PROGRESS_LABEL} {Math.trunc(Math.min(1, Math.max(0, displayFill)) * 100)}%
          </span>
          <div data-liangbiao-weight-hint="" role="tooltip">
            <table>
              <caption>{NEXT_INCENSE_WEIGHT_TITLE}</caption>
              <tbody>
                {NEXT_INCENSE_WEIGHT_ROWS.map((row) => (
                  <tr key={row.model}>
                    <th scope="row">{row.model}</th>
                    <td>{row.weight}</td>
                    <td>{row.stick}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Region 3 — exactly two equal-width vote buttons */}
      <div data-liangbiao-region="vote" style={voteRowStyle}>
        <button
          type="button"
          data-liangbiao-vote="up"
          disabled={offline}
          aria-disabled={votingDisabled}
          title={votingDisabled ? disabledReason : `${VOTE_UP_NAME}一炷香`}
          onClick={() => outOfIncense ? onInsufficientVote('up') : onVote('up')}
          style={{
            ...voteButtonBase,
            background: `linear-gradient(135deg, ${color.ritualEmber}, color-mix(in srgb, ${color.ritualEmber} 74%, #7f2f25))`,
            borderColor: `color-mix(in srgb, ${color.ritualEmber} 84%, ${color.border})`,
            color: '#ffffff',
            boxShadow: `0 5px 14px color-mix(in srgb, ${color.ritualEmber} 18%, transparent), inset 0 1px 0 rgba(255, 255, 255, 0.18)`,
          }}
        >
          {VOTE_UP_LABEL}
        </button>
        <button
          type="button"
          data-liangbiao-vote="down"
          disabled={offline}
          aria-disabled={votingDisabled}
          title={votingDisabled ? disabledReason : `${VOTE_DOWN_NAME}一炷香`}
          onClick={() => outOfIncense ? onInsufficientVote('down') : onVote('down')}
          style={{
            ...voteButtonBase,
            background: `color-mix(in srgb, ${color.ritualCool} 13%, ${color.bgSubtle})`,
            borderColor: `color-mix(in srgb, ${color.ritualCool} 42%, ${color.border})`,
            color: color.textPrimary,
            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
          }}
        >
          {VOTE_DOWN_LABEL}
        </button>
      </div>
      <p
        role="status"
        data-liangbiao-vote-feedback=""
        style={{ margin: '5px 0 0', minHeight: '15px', lineHeight: '15px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontSize: '10px', color: outOfIncense || offline || absurdNotice ? color.warn : color.textTertiary, textAlign: 'center' }}
      >
        {statusLine}
      </p>

      {/* Region 4 — stats + the compact ritual-control column. */}
      <footer
        data-liangbiao-region="social"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginTop: '9px',
          paddingTop: '10px',
          borderTop: `1px solid ${color.border}`,
          color: color.textSecondary,
        }}
      >
        <span
          data-liangbiao-stat="incense"
          tabIndex={0}
          aria-label={`${INCENSE_STAT_LABEL}。${INCENSE_STAT_HINT}。${STAT_TODAY_LABEL} ${snapshot.totalIncense.toLocaleString('zh-CN')}，${STAT_LIFETIME_LABEL} ${lifetimeIncense.toLocaleString('zh-CN')}`}
          style={statStyle}
        >
          <ThreeRealmsIncenseIcon size={18} />
          <span style={statCopyStyle}>
            <span data-liangbiao-stat-label="incense" style={statLabelStyle}>{INCENSE_STAT_LABEL}</span>
            <strong style={statValueStyle}>{formatZhCompactCount(snapshot.totalIncense)}</strong>
          </span>
          <SocialStatHint
            kind="incense"
            label={INCENSE_STAT_LABEL}
            today={snapshot.totalIncense}
            lifetime={lifetimeIncense}
          />
        </span>
        <span
          data-liangbiao-stat="voters"
          tabIndex={0}
          aria-label={`${VOTER_STAT_LABEL}。${VOTER_STAT_HINT}。${STAT_TODAY_LABEL} ${snapshot.uniqueVoters.toLocaleString('zh-CN')}，${STAT_LIFETIME_LABEL} ${lifetimeVoters.toLocaleString('zh-CN')}`}
          style={statStyle}
        >
          <FivePhasePilgrimIcon size={18} />
          <span style={statCopyStyle}>
            <span data-liangbiao-stat-label="voters" style={statLabelStyle}>{VOTER_STAT_LABEL}</span>
            <strong style={statValueStyle}>{formatZhCompactCount(snapshot.uniqueVoters)}</strong>
          </span>
          <SocialStatHint
            kind="voters"
            label={VOTER_STAT_LABEL}
            today={snapshot.uniqueVoters}
            lifetime={lifetimeVoters}
          />
        </span>
        <div
          data-liangbiao-reconcile-slot=""
          style={{ position: 'relative', flex: '0 0 auto', marginLeft: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}
        >
          <button
            type="button"
            data-liangbiao-reconcile=""
            data-liangbiao-ritual=""
            aria-label={`${RECONCILE_LABEL}：${RECONCILE_HINT}`}
            aria-hidden={reconcilePending || undefined}
            disabled={offline || reconcilePending}
            onClick={onReconcileAsk}
            style={reconcilePending ? { visibility: 'hidden' } : undefined}
          >
            <HeavenHearIcon size={14} />
            {RECONCILE_LABEL}
            <span data-liangbiao-hint="" aria-hidden="true">{RECONCILE_HINT}</span>
          </button>
          <button
            type="button"
            data-liangbiao-liangci-entry=""
            data-liangbiao-ritual=""
            aria-label={`${LIANGCI_ENTRY_LABEL}：${LIANGCI_ENTRY_HINT}`}
            onClick={onOpenLiangci}
          >
            <LiangciIcon size={14} />
            {LIANGCI_ENTRY_LABEL}
            <span data-liangbiao-hint="" aria-hidden="true">{LIANGCI_ENTRY_HINT}</span>
          </button>
          {reconcilePending
            ? (
              <div
                role="alertdialog"
                aria-label={RECONCILE_CONFIRM_PROMPT}
                data-liangbiao-reconcile-confirm=""
                style={{
                  position: 'absolute',
                  right: 0,
                  bottom: 'calc(100% + 6px)',
                  zIndex: 3,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: '6px',
                  minWidth: '148px',
                  padding: '8px',
                  borderRadius: '8px',
                  border: `1px solid ${color.border}`,
                  background: color.bgLayer,
                  boxShadow: '0 8px 20px rgba(0, 0, 0, 0.14)',
                }}
              >
                <span style={{ fontSize: '11px', color: color.textPrimary, lineHeight: 1.4 }}>
                  {RECONCILE_CONFIRM_PROMPT}
                </span>
                <span style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    data-liangbiao-reconcile-cancel=""
                    onClick={onReconcileCancel}
                    style={{
                      border: `1px solid ${color.border}`,
                      background: color.bgSubtle,
                      color: color.textPrimary,
                      borderRadius: '6px',
                      padding: '3px 8px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      fontFamily: font.family,
                    }}
                  >
                    {RECONCILE_CONFIRM_CANCEL}
                  </button>
                  <button
                    type="button"
                    data-liangbiao-reconcile-ok=""
                    onClick={onReconcileConfirm}
                    style={{
                      border: 'none',
                      background: color.buttonPrimaryFill,
                      color: color.buttonPrimaryText,
                      borderRadius: '6px',
                      padding: '3px 8px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      fontFamily: font.family,
                    }}
                  >
                    {RECONCILE_CONFIRM_OK}
                  </button>
                </span>
              </div>
            )
            : null}
        </div>
      </footer>

      {/* Screen-reader summary of the full state. */}
      <p aria-live="polite" style={visuallyHidden}>{summary}</p>
    </section>
  )
}
