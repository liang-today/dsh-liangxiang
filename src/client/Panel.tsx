/**
 * The expanded 梁相 panel — exactly four visual regions (frozen UI contract):
 *
 *   1. 今日梁案 (single active case)
 *   2. overlay flanks | centered 梁子 + 香火环 | 梁位
 *   3. two equal-width vote buttons 夯 · 升梁 / 拉 · 降梁
 *   4. 三界香火 + 五行香客 + 右侧礼仪控制列（梁相案牍 / 进入梁祠）
 *
 * No personal-growth section, no ranking, no third option.
 * Presentational only (no hooks); the container wires state and callbacks.
 */
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactElement } from 'react'
import { LIANG_POSITION_DECIMALS, VOTE_COUNT_MAX, formatCompactCount, formatIncenseShare, formatRatioPercents, type LocalEpithet, type LocalIncenseStats, type VoteType } from '../domain/index.ts'
import {
  ABSURD_CLAIM_NOTICE,
  ACCOUNTING_UNAVAILABLE_HINT,
  COMMUNITY_UNAVAILABLE_REASON,
  AUTHORITY_MODE_NOTES,
  INCENSE_STAT_HINT,
  INCENSE_STAT_LABEL,
  MY_INCENSE_STAT_HINT,
  MY_INCENSE_STAT_LABEL,
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
  PLUGIN_VERSION,
  CYCLE_LOCAL_CASE_LABEL,
  STAT_LIFETIME_LABEL,
  STAT_SHARE_LABEL,
  STAT_TODAY_LABEL,
  VOTER_STAT_HINT,
  VOTER_STAT_LABEL,
  VOTE_DOWN_LABEL,
  VOTE_DOWN_NAME,
  VOTE_UP_LABEL,
  VOTE_UP_NAME,
  LOCAL_EPITHET_HINT,
  LOCAL_EPITHET_TITLE,
  formatLocalEpithetLine,
  isEmptyIncenseFeedback,
  RECONCILE_CONFIRM_CANCEL,
  RECONCILE_CONFIRM_OK,
  RECONCILE_CONFIRM_PROMPT,
  MODE_CONFIRM_CANCEL,
  MODE_CONFIRM_LOCAL,
  MODE_CONFIRM_OK,
  MODE_CONFIRM_ONLINE,
  UTILITY_HINT,
  UTILITY_HOME_HINT,
  UTILITY_HOME_LABEL,
  UTILITY_LABEL,
  UTILITY_RECONCILE_HINT,
  UTILITY_RECONCILE_LABEL,
  UTILITY_MODE_LOCAL_HINT,
  UTILITY_MODE_LOCAL_LABEL,
  UTILITY_MODE_ONLINE_HINT,
  UTILITY_MODE_ONLINE_LABEL,
  UTILITY_VERSION_LABEL,
  WELCOME_DISMISS,
  WELCOME_LINES,
  WELCOME_LOCAL_LABEL,
  WELCOME_ONLINE_LABEL,
  WELCOME_PRIVACY_NOTE,
  WELCOME_TAGLINE,
  WELCOME_TITLE,
  liangziRatioRangeText,
} from '../shared/index.ts'
import { DUMP_ARMED_CHARGE } from './vote-charge.ts'
import { BADGE_SIZE, PANEL_GAP, PANEL_WIDTH, type PanelPlacement } from './badge-position.ts'
import { HeavenHearIcon } from './HeavenHearIcon.tsx'
import { ArchiveDeskIcon, HomepageIcon, ModeSwitchIcon, VersionSealIcon } from './UtilityIcons.tsx'
import { ThreeRealmsIncenseIcon, FivePhasePilgrimIcon } from './SocialStatIcons.tsx'
import { LiangAvatar } from './LiangAvatar.tsx'
import { LiangciIcon } from './LiangciIcon.tsx'
import { LiangQiRing, AVATAR_SLOT, RING_SIZE } from './LiangQiRing.tsx'
import { SoundIcon } from './SoundIcon.tsx'
import type { LiangxiangViewState } from './store.ts'
import { color, font } from './theme.ts'
import type { ThrottledProgress } from './use-throttle-fill.ts'

export interface PanelProps {
  state: LiangxiangViewState
  reducedMotion: boolean
  /** Smoothed + rate-extrapolated fill for the 油门 animation (optional). */
  throttle?: ThrottledProgress
  /** Sound volume step 0-3 (无/小/中/大). */
  soundLevel: number
  onCycleSound: () => void
  /** Version details are exposed only from 梁相案牍. */
  versionInfoOpen: boolean
  onVersionInfoClose: () => void
  /** First-run welcome overlay visibility. */
  welcomeVisible: boolean
  onChooseOnline: () => void
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
  /** Synthetic/read-screen click. Pointer holds must not also fire this. */
  onVoteClick?: (voteType: VoteType) => void
  /** Pointer charge for dump; the container owns timers (this file stays hook-free). */
  onVotePointerDown?: (voteType: VoteType, event: PointerEvent<HTMLButtonElement>) => void
  onVotePointerUp?: (voteType: VoteType, event: PointerEvent<HTMLButtonElement>) => void
  onVotePointerCancel?: () => void
  chargeVoteType?: VoteType | null
  /** 0..1 lightning intensity while a button is held. */
  charge?: number
  /** After a dump lands: strike the vote row once. */
  dumpBurst?: VoteType | null
  /** Local-only 梁号 painted in the reserved feedback row when idle. */
  localEpithet?: LocalEpithet | null
  /** Local-only incense ledger painted under 三界香火 on hover. */
  localIncense?: LocalIncenseStats | null
  /** Empty-pool click: never sends a vote; plays the playful local cue. */
  onInsufficientVote: (voteType: VoteType) => void
  onClose: () => void
  /** First click: open the confirm chip. Confirm is the expensive sync. */
  onReconcileAsk: () => void
  onReconcileConfirm: () => void
  onReconcileCancel: () => void
  reconcilePending: boolean
  /** Region 4's themed utility drawer; normal synchronization remains automatic. */
  utilityOpen: boolean
  onUtilityToggle: () => void
  onUtilityClose: () => void
  onOpenHomepage: () => void
  modeConfirmOpen: boolean
  modeChanging: boolean
  onModeAsk: () => void
  onModeConfirm: () => void
  onModeCancel: () => void
  onShowVersion: () => void
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
  padding: '10px 12px 8px',
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
/** Top pad must clear 日/月 glyphs that sit outside the 126px ring box. */
const CORE_PAD_Y = 20
/** Room for the absolutely positioned 梁位 pill under the ring. */
const CORE_PAD_BOTTOM = 36

const coreStyle: CSSProperties = {
  position: 'relative',
  padding: `${CORE_PAD_Y}px 0 ${CORE_PAD_BOTTOM}px`,
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
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '8px',
  marginTop: '6px',
}

const voteButtonBase: CSSProperties = {
  position: 'relative',
  isolation: 'isolate',
  overflow: 'hidden',
  width: '100%',
  boxSizing: 'border-box',
  minHeight: '38px',
  padding: '7px 0',
  borderRadius: '11px',
  fontFamily: font.family,
  fontSize: '13px',
  fontWeight: 700,
  lineHeight: '18px',
  textAlign: 'center',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  border: `1px solid ${color.border}`,
  touchAction: 'manipulation',
  userSelect: 'none',
  WebkitUserSelect: 'none',
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
[data-liangxiang-panel] {
  animation: liangxiang-panel-enter 150ms cubic-bezier(.2,.8,.2,1) both;
}
[data-liangxiang-panel] button:focus-visible {
  outline: 2px solid ${color.brand};
  outline-offset: 2px;
}
[data-liangxiang-panel] button[disabled] {
  opacity: 0.55;
  cursor: not-allowed;
}
[data-liangxiang-panel] button[aria-disabled="true"]:not([disabled]) {
  opacity: 0.72;
  cursor: pointer;
}
[data-liangxiang-vote]:hover:not([disabled]) {
  transform: translateY(-1px);
  filter: brightness(1.04);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.16);
}
[data-liangxiang-vote]:active:not([disabled]) {
  transform: translateY(1px) scale(0.985);
  box-shadow: 0 2px 7px rgba(0, 0, 0, 0.14);
}
[data-liangxiang-vote][data-charging] {
  --charge: 0;
  z-index: 1;
  color: #fffdf3 !important;
  filter: brightness(calc(1.08 + (var(--charge) * 1.15))) saturate(calc(1 + (var(--charge) * 0.55)));
  box-shadow:
    0 0 calc(10px + (var(--charge) * 28px)) color-mix(in srgb, #fff1a8 calc(40% + (var(--charge) * 60%)), transparent),
    0 0 calc(22px + (var(--charge) * 36px)) color-mix(in srgb, #ffb347 calc(var(--charge) * 70%), transparent),
    inset 0 0 calc(12px + (var(--charge) * 18px)) color-mix(in srgb, #fff6c8 calc(var(--charge) * 55%), transparent);
  animation: liangxiang-vote-quake calc(130ms - (var(--charge) * 80ms)) linear infinite;
}
[data-liangxiang-vote][data-charging][data-armed] {
  animation-duration: 55ms;
}
[data-liangxiang-vote-fill] {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: calc(var(--charge) * 100%);
  pointer-events: none;
  background: linear-gradient(180deg, rgba(255, 252, 220, 0.96) 0%, rgba(255, 168, 46, 0.88) 55%, rgba(190, 40, 16, 0.72) 100%);
  opacity: calc(0.25 + (var(--charge) * 0.7));
  mix-blend-mode: screen;
}
[data-liangxiang-vote="down"] [data-liangxiang-vote-fill] {
  background: linear-gradient(180deg, rgba(245, 252, 255, 0.96) 0%, rgba(120, 190, 255, 0.82) 55%, rgba(40, 70, 160, 0.7) 100%);
}
[data-liangxiang-vote-bolt] {
  position: absolute;
  top: -28%;
  width: 18px;
  height: 160%;
  pointer-events: none;
  background: linear-gradient(180deg, #ffffff 0%, #fff3b0 38%, #ffbe3b 70%, transparent 100%);
  clip-path: polygon(42% 0, 78% 22%, 52% 22%, 88% 58%, 36% 40%, 58% 40%, 12% 100%, 48% 62%, 30% 62%, 62% 0);
  mix-blend-mode: plus-lighter;
  opacity: calc(var(--charge) * 0.95);
  filter: drop-shadow(0 0 6px #fff4b8);
  animation: liangxiang-vote-bolt calc(160ms - (var(--charge) * 90ms)) steps(2, end) infinite;
}
[data-liangxiang-vote="down"] [data-liangxiang-vote-bolt] {
  background: linear-gradient(180deg, #ffffff 0%, #d7f0ff 38%, #7ec8ff 70%, transparent 100%);
  filter: drop-shadow(0 0 6px #c8ecff);
}
[data-liangxiang-vote-bolt="a"] { left: 18%; }
[data-liangxiang-vote-bolt="b"] { right: 16%; transform: scaleX(-1); animation-delay: 40ms; }
[data-liangxiang-vote-label] {
  position: relative;
  z-index: 1;
}
[data-liangxiang-region="vote"][data-dump-burst] {
  animation: liangxiang-dump-row 420ms ease-out;
}
[data-liangxiang-region="vote"][data-dump-burst]::after {
  content: "";
  position: absolute;
  inset: -18px -8px;
  pointer-events: none;
  background:
    linear-gradient(100deg, transparent 30%, rgba(255, 255, 230, 0.88) 48%, rgba(255, 210, 90, 0.55) 50%, rgba(255, 255, 230, 0.88) 52%, transparent 70%),
    radial-gradient(ellipse at 50% 50%, rgba(255, 244, 180, 0.55), transparent 62%);
  mix-blend-mode: screen;
  animation: liangxiang-dump-sheet 420ms ease-out both;
}
@keyframes liangxiang-vote-quake {
  0% { transform: translate(0, 0) rotate(0deg); }
  25% { transform: translate(calc(var(--charge) * -3.6px), calc(var(--charge) * 2.4px)) rotate(calc(var(--charge) * -1.4deg)); }
  50% { transform: translate(calc(var(--charge) * 3.2px), calc(var(--charge) * -2.2px)) rotate(calc(var(--charge) * 1.1deg)); }
  75% { transform: translate(calc(var(--charge) * -2.6px), calc(var(--charge) * -1.8px)) rotate(calc(var(--charge) * 0.9deg)); }
  100% { transform: translate(0, 0) rotate(0deg); }
}
@keyframes liangxiang-vote-bolt {
  0% { opacity: 0.05; transform: translateY(8%) scaleY(0.86); }
  50% { opacity: calc(0.55 + (var(--charge) * 0.45)); transform: translateY(-4%) scaleY(1.12); }
  100% { opacity: 0.12; transform: translateY(6%) scaleY(0.9); }
}
@keyframes liangxiang-dump-row {
  0% { filter: brightness(2.2); transform: scale(1.03); }
  100% { filter: brightness(1); transform: scale(1); }
}
@keyframes liangxiang-dump-sheet {
  0% { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes liangxiang-panel-enter {
  from { opacity: 0; transform: translateY(4px) scale(0.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes liangxiang-position-pop {
  0% { transform: translateY(3px); opacity: 0.35; }
  45% { transform: translateY(0); opacity: 1; filter: brightness(1.5); }
  100% { transform: translateY(0); opacity: 1; }
}
[data-liangxiang-ritual] {
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
[data-liangxiang-ritual]:hover:not(:disabled),
[data-liangxiang-ritual]:focus-visible {
  color: ${color.textPrimary};
  background: ${color.bgLayer};
  box-shadow: inset 0 0 0 1px ${color.brand}, 0 4px 10px rgba(0, 0, 0, 0.12);
  transform: translateY(-1px);
}
[data-liangxiang-utility-drawer] {
  animation: liangxiang-panel-enter 120ms cubic-bezier(.2,.8,.2,1) both;
}
[data-liangxiang-utility-action] {
  min-width: 0;
  min-height: 62px;
  display: grid;
  grid-template-columns: 24px 1fr;
  grid-template-rows: auto auto;
  align-items: center;
  column-gap: 7px;
  padding: 8px;
  border: 1px solid ${color.border};
  border-radius: 9px;
  background: ${color.bgSubtle};
  color: ${color.textPrimary};
  font: inherit;
  text-align: left;
  cursor: pointer;
}
[data-liangxiang-utility-action] > svg {
  grid-row: 1 / 3;
  color: ${color.ritualEmber};
}
[data-liangxiang-utility-action]:hover:not(:disabled),
[data-liangxiang-utility-action]:focus-visible {
  border-color: ${color.brand};
  background: color-mix(in srgb, ${color.brand} 5%, ${color.bgLayer});
}
[data-liangxiang-ritual] [data-liangxiang-hint] {
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
[data-liangxiang-ritual]:hover:not(:disabled) [data-liangxiang-hint],
[data-liangxiang-ritual]:focus-visible [data-liangxiang-hint] {
  opacity: 1;
  transform: translateY(0);
}
[data-liangxiang-personal="next-incense"] {
  cursor: help;
  outline: none;
}
[data-liangxiang-personal="next-incense"] [data-liangxiang-weight-hint] {
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
[data-liangxiang-personal="next-incense"]:hover [data-liangxiang-weight-hint],
[data-liangxiang-personal="next-incense"]:focus-within [data-liangxiang-weight-hint] {
  opacity: 1;
  transform: translateY(0);
}
[data-liangxiang-stat] [data-liangxiang-stat-hint] {
  position: absolute;
  left: 0;
  bottom: calc(100% + 8px);
  z-index: 3;
  min-width: 168px;
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
[data-liangxiang-stat]:hover [data-liangxiang-stat-hint],
[data-liangxiang-stat]:focus-visible [data-liangxiang-stat-hint] {
  opacity: 1;
  transform: translateY(0);
}
[data-liangxiang-stat-hint] strong {
  display: block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.2px;
  margin-bottom: 6px;
}
[data-liangxiang-stat-hint] dl {
  margin: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 12px;
  row-gap: 3px;
  font-size: 11px;
  line-height: 1.35;
}
[data-liangxiang-stat-hint] dt {
  margin: 0;
  color: ${color.textTertiary};
  font-weight: 500;
}
[data-liangxiang-stat-hint] dd {
  margin: 0;
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
  font-weight: 600;
  color: ${color.textPrimary};
}
[data-liangxiang-stat-mine] {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid color-mix(in srgb, ${color.border} 80%, transparent);
}
[data-liangxiang-weight-hint] table {
  border-collapse: collapse;
  width: 100%;
}
[data-liangxiang-weight-hint] th,
[data-liangxiang-weight-hint] td {
  padding: 2px 4px;
  text-align: left;
  font-weight: 500;
}
[data-liangxiang-weight-hint] caption {
  caption-side: top;
  text-align: left;
  font-weight: 700;
  padding-bottom: 4px;
}
@keyframes liangxiang-condense {
  0% { opacity: 0; transform: translate(-50%, 12px) scale(0.85); }
  22% { opacity: 1; transform: translate(-50%, 0) scale(1); }
  70% { opacity: 1; transform: translate(-50%, -3px) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -8px) scale(0.95); }
}
@media (prefers-reduced-motion: reduce) {
  [data-liangxiang-panel] * {
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

function formatMineLine(total: number, upShare: string, up: number, down: number): string {
  if (total <= 0) return `0 · ${upShare}`
  return `${total.toLocaleString('zh-CN')} · 夯${upShare}（${up}/${down}）`
}

function SocialStatHint(props: {
  kind: 'incense' | 'voters'
  label: string
  today: number
  lifetime: number
  mine?: LocalIncenseStats | null
}): ReactElement {
  const todayText = props.today.toLocaleString('zh-CN')
  const lifetimeText = props.lifetime.toLocaleString('zh-CN')
  const mine = props.mine
  return (
    <div data-liangxiang-stat-hint={props.kind} role="tooltip">
      <strong>{props.label}</strong>
      <dl>
        <dt>{STAT_TODAY_LABEL}</dt>
        <dd>{todayText}</dd>
        <dt>{STAT_LIFETIME_LABEL}</dt>
        <dd>{lifetimeText}</dd>
      </dl>
      {mine === undefined || mine === null ? null : (
        <div data-liangxiang-stat-mine="">
          <strong>{MY_INCENSE_STAT_LABEL}</strong>
          <dl>
            <dt>{STAT_TODAY_LABEL}</dt>
            <dd>{formatMineLine(mine.today.total, mine.today.upShare, mine.today.up, mine.today.down)}</dd>
            <dt>{STAT_LIFETIME_LABEL}</dt>
            <dd>{formatMineLine(mine.lifetime.total, mine.lifetime.upShare, mine.lifetime.up, mine.lifetime.down)}</dd>
            <dt>{STAT_SHARE_LABEL}</dt>
            <dd>
              {STAT_TODAY_LABEL}
              {' '}
              {formatIncenseShare(mine.today.total, props.today)}
              {' · '}
              {STAT_LIFETIME_LABEL}
              {' '}
              {formatIncenseShare(mine.lifetime.total, props.lifetime)}
            </dd>
          </dl>
        </div>
      )}
    </div>
  )
}

export function Panel(props: PanelProps): ReactElement {
  const {
    state, reducedMotion, throttle, soundLevel, onCycleSound, versionInfoOpen, onVersionInfoClose,
    welcomeVisible, onChooseOnline, onChooseLocal, avatarPulse, condensedIncense, voteFeedback,
    onVote,
    onVoteClick = () => undefined,
    onVotePointerDown = () => undefined,
    onVotePointerUp = () => undefined,
    onVotePointerCancel = () => undefined,
    chargeVoteType = null,
    charge = 0,
    dumpBurst = null,
    localEpithet = null,
    localIncense = null,
    onInsufficientVote, onClose, onReconcileAsk, onReconcileConfirm, onReconcileCancel,
    reconcilePending, utilityOpen, onUtilityToggle, onUtilityClose, onOpenHomepage,
    modeConfirmOpen, modeChanging, onModeAsk, onModeConfirm, onModeCancel,
    onShowVersion, onOpenLiangci, onCycleLocalCase,
  } = props
  const placement = props.placement ?? { stack: 'above', align: 'start' }
  const positionPulse = props.positionPulse ?? false
  const { snapshot, personal, activeCase, lifetimeIncense, lifetimeVoters } = state
  // Throttled (smoothed/extrapolated) display values — presentation only. The
  // authoritative remaining incense / vote availability stay on `personal`.
  const displayFill = throttle?.fill ?? personal.liangQiFill
  const displayTokensToNext = throttle?.tokensToNext ?? personal.tokensToNextIncense
  const offline = state.connection !== 'live'
  const communityUnavailable = state.authorityMode === 'DEV_STAGING_ONLY' && !state.authorityAvailable
  const targetMode = state.authorityMode === 'LOCAL_FAKE_DEV' ? 'online' : 'local'
  const modeLabel = targetMode === 'online' ? UTILITY_MODE_ONLINE_LABEL : UTILITY_MODE_LOCAL_LABEL
  const modeHint = targetMode === 'online' ? UTILITY_MODE_ONLINE_HINT : UTILITY_MODE_LOCAL_HINT
  const modePrompt = targetMode === 'online' ? MODE_CONFIRM_ONLINE : MODE_CONFIRM_LOCAL
  const authorityUnavailable = offline || communityUnavailable
  const communityUnavailableReason = state.authorityReason === null
    ? COMMUNITY_UNAVAILABLE_REASON
    : `无法连接天庭：${state.authorityReason}`
  const outOfIncense = personal.remainingIncense <= 0
  const votingDisabled = outOfIncense || authorityUnavailable
  const disabledReason = offline
    ? OFFLINE_REASON
    : communityUnavailable
      ? communityUnavailableReason
    : outOfIncense
      ? NO_INCENSE_REASON
      : ''
  const absurdNotice = state.accountingNotice === 'claim_capped_absurd'
  const epithetLine = localEpithet === null ? '' : formatLocalEpithetLine(localEpithet.dedication, localEpithet.stance)
  const statusLine = offline
    ? OFFLINE_REASON
    : communityUnavailable
      ? communityUnavailableReason
    : !state.accountingAvailable
      ? ACCOUNTING_UNAVAILABLE_HINT
      : absurdNotice
        ? ABSURD_CLAIM_NOTICE
        : voteFeedback !== ''
          ? voteFeedback
          : epithetLine
  const showingEpithet = statusLine === epithetLine && epithetLine !== '' && localEpithet !== null

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      if (versionInfoOpen) onVersionInfoClose()
      else if (modeConfirmOpen) onModeCancel()
      else if (reconcilePending) onReconcileCancel()
      else if (utilityOpen) onUtilityClose()
      else onClose()
    }
  }

  // Percentages come from the snapshot's own raw counts, so they can never
  // contradict the Liangzi state rendered beside them (AGENTS.md §12).
  const panelTitle = state.authorityMode === 'LOCAL_FAKE_DEV' ? PANEL_TITLE_LOCAL : PANEL_TITLE
  const percents = formatRatioPercents(snapshot.upVotes, snapshot.downVotes, LIANG_POSITION_DECIMALS)
  const earnedObserved = state.observedEarnedIncenseToday
  const earnedExact = earnedObserved.toLocaleString('zh-CN')
  const remainingExact = personal.remainingIncense.toLocaleString('zh-CN')
  const toNextExact = personal.tokensToNextIncense.toLocaleString('zh-CN')
  const earnedCompact = formatCompactCount(earnedObserved)
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
      data-liangxiang-panel=""
      data-liangxiang-authority={state.authorityMode}
      tabIndex={-1}
      style={{ ...panelStyle, ...placementStyle(placement) }}
      onKeyDown={onKeyDown}
      onPointerDownCapture={(event: PointerEvent<HTMLElement>) => {
        if (!utilityOpen) return
        const target = event.target
        if (target instanceof Element && target.closest('[data-liangxiang-utility-slot]') !== null) return
        onUtilityClose()
      }}
    >
      <style>{PANEL_CSS}</style>

      {welcomeVisible && (
        <div
          role="dialog"
          aria-label={WELCOME_TITLE}
          data-liangxiang-welcome=""
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
          <p
            data-liangxiang-welcome-tagline=""
            style={{
              margin: '-2px 0 1px',
              padding: '3px 10px',
              borderTop: `1px solid color-mix(in srgb, ${color.ritualGold} 48%, transparent)`,
              borderBottom: `1px solid color-mix(in srgb, ${color.ritualGold} 48%, transparent)`,
              color: color.ritualEmber,
              fontSize: '13px',
              lineHeight: 1.45,
              fontWeight: 750,
              letterSpacing: '1.2px',
            }}
          >
            {WELCOME_TAGLINE}
          </p>
          {WELCOME_LINES.map((line) => (
            <p key={line} style={{ margin: 0, fontSize: '12px', lineHeight: '1.6', color: color.textSecondary, textAlign: 'center' }}>
              {line}
            </p>
          ))}
          <p
            data-liangxiang-welcome-privacy=""
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
              data-liangxiang-welcome-online=""
              onClick={onChooseOnline}
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
              {WELCOME_ONLINE_LABEL}
            </button>
            <button
              type="button"
              data-liangxiang-welcome-local=""
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

      {versionInfoOpen && (
        <div
          data-liangxiang-version-backdrop=""
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '18px',
            borderRadius: '18px',
            background: 'rgba(10, 8, 7, 0.34)',
            backdropFilter: 'blur(3px)',
            boxSizing: 'border-box',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="版本信息"
            data-liangxiang-version-dialog=""
            style={{
              width: '100%',
              padding: '16px',
              border: `1px solid color-mix(in srgb, ${color.ritualGold} 34%, ${color.border})`,
              borderRadius: '14px',
              background: `linear-gradient(180deg, color-mix(in srgb, ${color.ritualGold} 10%, ${color.bgLayer}), ${color.bgLayer})`,
              boxShadow: '0 18px 42px rgba(0, 0, 0, 0.28)',
              textAlign: 'center',
              boxSizing: 'border-box',
            }}
          >
            <VersionSealIcon size={28} />
            <strong style={{ display: 'block', marginTop: '6px', color: color.textPrimary, fontSize: '15px', letterSpacing: '1px' }}>梁相</strong>
            <span data-liangxiang-version-value="" style={{ display: 'block', marginTop: '3px', color: color.ritualEmber, fontSize: '14px', fontWeight: 700 }}>v{PLUGIN_VERSION}</span>
            <button
              type="button"
              autoFocus
              data-liangxiang-version-close=""
              onClick={onVersionInfoClose}
              style={{
                marginTop: '13px',
                minWidth: '84px',
                padding: '6px 12px',
                border: 'none',
                borderRadius: '8px',
                background: color.buttonPrimaryFill,
                color: color.buttonPrimaryText,
                font: `600 11px/16px ${font.family}`,
                cursor: 'pointer',
              }}
            >
              {WELCOME_DISMISS}
            </button>
          </div>
        </div>
      )}

      {/* Region 1 — 今日梁案 */}
      <header
        data-liangxiang-region="case"
        style={{ position: 'relative', marginBottom: '2px', padding: '0 24px', textAlign: 'center' }}
      >
        <h2 style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: color.textTertiary, letterSpacing: '1.6px' }}>
          {panelTitle}
        </h2>
        <p
          data-liangxiang-case-title=""
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
            data-liangxiang-cycle-case=""
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
      <div data-liangxiang-region="core" style={coreStyle}>
        <div data-liangxiang-core-anchor="" style={coreAnchorStyle}>
          <LiangQiRing
            personal={personal}
            reducedMotion={reducedMotion}
            condensedIncense={condensedIncense}
            fillOverride={displayFill}
            footer={(
              <span
                data-liangxiang-liang-position=""
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
                <span data-liangxiang-liang-position-label="" style={positionGlueStyle}>
                  {LIANG_POSITION_LABEL}
                </span>
                <strong
                  data-liangxiang-liang-position-value=""
                  style={{
                    ...positionFactStyle,
                    ...numericStyle,
                    animation: positionPulse && !reducedMotion
                      ? 'liangxiang-position-pop 0.5s ease-out 1'
                      : undefined,
                  }}
                >
                  {percents.up}
                </strong>
                <span aria-hidden="true" data-liangxiang-liang-position-causal="" style={{ ...positionGlueStyle, color: color.textTertiary }}>→</span>
                <span
                  data-liangxiang-liangzi-title=""
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
        <div style={{ ...flankStyle, left: '0px' }} data-liangxiang-personal="incense">
          <span style={flankCaptionStyle}>{MY_INCENSE_LABEL}</span>
          <span title={`今日生成 ${earnedExact} 炷`} style={flankValueStyle}>
            <span data-liangxiang-compact="incense">{earnedCompact}</span>
            <span style={flankUnitStyle}> 炷</span>
          </span>
          <span title={`余 ${remainingExact} 炷`} style={flankUnitStyle}>
            余 {remainingCompact} 炷
          </span>
        </div>
        <div
          style={{ ...flankStyle, right: '0px' }}
          data-liangxiang-personal="next-incense"
          tabIndex={0}
          aria-label={`${NEXT_INCENSE_LABEL} ${toNextExact} ${NEXT_INCENSE_UNIT}，悬停查看模型权重`}
        >
          <span style={flankCaptionStyle}>{NEXT_INCENSE_LABEL}</span>
          <span style={flankValueStyle}>
            <span
              data-liangxiang-compact="next-incense"
              title={`${toNextExact} ${NEXT_INCENSE_UNIT}`}
            >
              {formatCompactCount(displayTokensToNext, 0)}
            </span>
            <span style={flankUnitStyle}> {NEXT_INCENSE_UNIT}</span>
          </span>
          <span style={flankUnitStyle}>
            {NEXT_INCENSE_PROGRESS_LABEL} {Math.trunc(Math.min(1, Math.max(0, displayFill)) * 100)}%
          </span>
          <div data-liangxiang-weight-hint="" role="tooltip">
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
      <div
        data-liangxiang-region="vote"
        data-dump-burst={dumpBurst ?? undefined}
        style={voteRowStyle}
      >
        <button
          type="button"
          data-liangxiang-vote="up"
          disabled={authorityUnavailable}
          aria-disabled={votingDisabled}
          title={votingDisabled ? disabledReason : `${VOTE_UP_NAME}一炷香，长按倾炉`}
          data-charging={chargeVoteType === 'up' ? '' : undefined}
          data-armed={chargeVoteType === 'up' && charge >= DUMP_ARMED_CHARGE ? '' : undefined}
          onContextMenu={(event) => event.preventDefault()}
          onClick={() => {
            if (outOfIncense) onInsufficientVote('up')
            else onVoteClick('up')
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            if (outOfIncense) onInsufficientVote('up')
            else onVote('up')
          }}
          onPointerDown={(event) => {
            if (outOfIncense || authorityUnavailable) return
            onVotePointerDown('up', event)
          }}
          onPointerUp={(event) => onVotePointerUp('up', event)}
          onPointerCancel={onVotePointerCancel}
          style={{
            ...voteButtonBase,
            ...(chargeVoteType === 'up' ? { ['--charge']: String(charge) } as CSSProperties : {}),
            background: `linear-gradient(135deg, ${color.ritualEmber}, color-mix(in srgb, ${color.ritualEmber} 74%, #7f2f25))`,
            borderColor: `color-mix(in srgb, ${color.ritualEmber} 84%, ${color.border})`,
            color: '#ffffff',
            boxShadow: `0 5px 14px color-mix(in srgb, ${color.ritualEmber} 18%, transparent), inset 0 1px 0 rgba(255, 255, 255, 0.18)`,
          }}
        >
          {chargeVoteType === 'up' ? (
            <>
              <span data-liangxiang-vote-fill="" />
              <span data-liangxiang-vote-bolt="a" />
              <span data-liangxiang-vote-bolt="b" />
            </>
          ) : null}
          <span data-liangxiang-vote-label="">
            {chargeVoteType === 'up' && charge >= DUMP_ARMED_CHARGE
              ? `倾炉 ×${Math.min(personal.remainingIncense, VOTE_COUNT_MAX)}`
              : VOTE_UP_LABEL}
          </span>
        </button>
        <button
          type="button"
          data-liangxiang-vote="down"
          disabled={authorityUnavailable}
          aria-disabled={votingDisabled}
          title={votingDisabled ? disabledReason : `${VOTE_DOWN_NAME}一炷香，长按倾炉`}
          data-charging={chargeVoteType === 'down' ? '' : undefined}
          data-armed={chargeVoteType === 'down' && charge >= DUMP_ARMED_CHARGE ? '' : undefined}
          onContextMenu={(event) => event.preventDefault()}
          onClick={() => {
            if (outOfIncense) onInsufficientVote('down')
            else onVoteClick('down')
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            if (outOfIncense) onInsufficientVote('down')
            else onVote('down')
          }}
          onPointerDown={(event) => {
            if (outOfIncense || authorityUnavailable) return
            onVotePointerDown('down', event)
          }}
          onPointerUp={(event) => onVotePointerUp('down', event)}
          onPointerCancel={onVotePointerCancel}
          style={{
            ...voteButtonBase,
            ...(chargeVoteType === 'down' ? { ['--charge']: String(charge) } as CSSProperties : {}),
            background: `color-mix(in srgb, ${color.ritualCool} 13%, ${color.bgSubtle})`,
            borderColor: `color-mix(in srgb, ${color.ritualCool} 42%, ${color.border})`,
            color: color.textPrimary,
            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
          }}
        >
          {chargeVoteType === 'down' ? (
            <>
              <span data-liangxiang-vote-fill="" />
              <span data-liangxiang-vote-bolt="a" />
              <span data-liangxiang-vote-bolt="b" />
            </>
          ) : null}
          <span data-liangxiang-vote-label="">
            {chargeVoteType === 'down' && charge >= DUMP_ARMED_CHARGE
              ? `倾炉 ×${Math.min(personal.remainingIncense, VOTE_COUNT_MAX)}`
              : VOTE_DOWN_LABEL}
          </span>
        </button>
      </div>
      <p
        role="status"
        data-liangxiang-vote-feedback=""
        data-liangxiang-epithet={showingEpithet ? '' : undefined}
        title={showingEpithet ? LOCAL_EPITHET_HINT : undefined}
        style={{
          margin: '6px 0 0',
          minHeight: '22px',
          height: '22px',
          lineHeight: '22px',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          fontSize: '12px',
          fontWeight: voteFeedback !== '' ? 700 : 600,
          color: offline || absurdNotice || isEmptyIncenseFeedback(voteFeedback)
            ? color.warn
            : voteFeedback !== ''
              ? color.textPrimary
              : color.textSecondary,
          textAlign: 'center',
        }}
      >
        {showingEpithet && localEpithet !== null ? (
          <span
            data-liangxiang-epithet-line=""
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              maxWidth: '100%',
              overflow: 'hidden',
            }}
          >
            <span data-liangxiang-epithet-title="" style={{ color: color.textTertiary, fontWeight: 650 }}>
              {LOCAL_EPITHET_TITLE}：
            </span>
            {localEpithet.dedication}
            <span
              data-liangxiang-epithet-mark=""
              aria-hidden="true"
              style={{
                display: 'block',
                width: '5px',
                height: '5px',
                margin: '0 5px',
                borderRadius: '50%',
                background: color.ritualEmber,
                flex: '0 0 auto',
              }}
            />
            {localEpithet.stance}
          </span>
        ) : statusLine}
      </p>

      {/* Region 4 — stats + the compact ritual-control column. */}
      <footer
        data-liangxiang-region="social"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginTop: 0,
          paddingTop: '8px',
          borderTop: `1px solid ${color.border}`,
          color: color.textSecondary,
        }}
      >
        <span
          data-liangxiang-stat="incense"
          tabIndex={0}
          aria-label={`${INCENSE_STAT_LABEL}。${INCENSE_STAT_HINT}。${STAT_TODAY_LABEL} ${snapshot.totalIncense.toLocaleString('zh-CN')}，${STAT_LIFETIME_LABEL} ${lifetimeIncense.toLocaleString('zh-CN')}。${MY_INCENSE_STAT_LABEL}。${MY_INCENSE_STAT_HINT}`}
          style={statStyle}
        >
          <ThreeRealmsIncenseIcon size={18} />
          <span style={statCopyStyle}>
            <span data-liangxiang-stat-label="incense" style={statLabelStyle}>{INCENSE_STAT_LABEL}</span>
            <strong style={statValueStyle}>{snapshot.totalIncense.toLocaleString('zh-CN')}</strong>
          </span>
          <SocialStatHint
            kind="incense"
            label={INCENSE_STAT_LABEL}
            today={snapshot.totalIncense}
            lifetime={lifetimeIncense}
            mine={localIncense}
          />
        </span>
        <span
          data-liangxiang-stat="voters"
          tabIndex={0}
          aria-label={`${VOTER_STAT_LABEL}。${VOTER_STAT_HINT}。${STAT_TODAY_LABEL} ${snapshot.uniqueVoters.toLocaleString('zh-CN')}，${STAT_LIFETIME_LABEL} ${lifetimeVoters.toLocaleString('zh-CN')}`}
          style={statStyle}
        >
          <FivePhasePilgrimIcon size={18} />
          <span style={statCopyStyle}>
            <span data-liangxiang-stat-label="voters" style={statLabelStyle}>{VOTER_STAT_LABEL}</span>
            <strong style={statValueStyle}>{snapshot.uniqueVoters.toLocaleString('zh-CN')}</strong>
          </span>
          <SocialStatHint
            kind="voters"
            label={VOTER_STAT_LABEL}
            today={snapshot.uniqueVoters}
            lifetime={lifetimeVoters}
          />
        </span>
        <div
          data-liangxiang-utility-slot=""
          style={{ position: 'relative', flex: '0 0 auto', marginLeft: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}
        >
          <button
            type="button"
            data-liangxiang-utility-trigger=""
            data-liangxiang-ritual=""
            aria-label={`${UTILITY_LABEL}：${UTILITY_HINT}`}
            aria-expanded={utilityOpen}
            onClick={onUtilityToggle}
          >
            <ArchiveDeskIcon size={14} />
            {UTILITY_LABEL}
            <span data-liangxiang-hint="" aria-hidden="true">{UTILITY_HINT}</span>
          </button>
          <button
            type="button"
            data-liangxiang-liangci-entry=""
            data-liangxiang-ritual=""
            aria-label={`${LIANGCI_ENTRY_LABEL}：${LIANGCI_ENTRY_HINT}`}
            onClick={onOpenLiangci}
          >
            <LiangciIcon size={14} />
            {LIANGCI_ENTRY_LABEL}
            <span data-liangxiang-hint="" aria-hidden="true">{LIANGCI_ENTRY_HINT}</span>
          </button>
          {utilityOpen
            ? (
              <div
                role="group"
                aria-label={UTILITY_LABEL}
                data-liangxiang-utility-drawer=""
                style={{
                  position: 'absolute',
                  right: 0,
                  bottom: 'calc(100% + 6px)',
                  zIndex: 3,
                  width: '220px',
                  padding: '10px',
                  borderRadius: '12px',
                  border: `1px solid ${color.border}`,
                  background: `linear-gradient(180deg, color-mix(in srgb, ${color.ritualGold} 7%, ${color.bgLayer}), ${color.bgLayer})`,
                  boxShadow: '0 12px 28px rgba(0, 0, 0, 0.2)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <strong style={{ fontSize: '12px', letterSpacing: '1px', color: color.textPrimary }}>{UTILITY_LABEL}</strong>
                  <span style={{ fontSize: '9px', color: color.textTertiary }}>一卷在手 · 模式分明</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px' }}>
                  <button
                    type="button"
                    data-liangxiang-utility-action="home"
                    onClick={onOpenHomepage}
                  >
                    <HomepageIcon />
                    <strong style={{ fontSize: '11px' }}>{UTILITY_HOME_LABEL}</strong>
                    <span style={{ fontSize: '9px', color: color.textTertiary }}>{UTILITY_HOME_HINT}</span>
                  </button>
                  <button
                    type="button"
                    data-liangxiang-utility-action="reconcile"
                    disabled={offline}
                    onClick={onReconcileAsk}
                  >
                    <HeavenHearIcon size={19} />
                    <strong style={{ fontSize: '11px' }}>{UTILITY_RECONCILE_LABEL}</strong>
                    <span style={{ fontSize: '9px', color: color.textTertiary }}>{UTILITY_RECONCILE_HINT}</span>
                  </button>
                  <button
                    type="button"
                    data-liangxiang-utility-action="mode"
                    disabled={modeChanging}
                    aria-label={`${modeLabel}：${modeHint}`}
                    onClick={onModeAsk}
                  >
                    <ModeSwitchIcon online={targetMode === 'online'} />
                    <strong style={{ fontSize: '11px' }}>{modeChanging ? '切换中…' : modeLabel}</strong>
                    <span style={{ fontSize: '9px', color: color.textTertiary }}>{modeHint}</span>
                  </button>
                  <button
                    type="button"
                    data-liangxiang-utility-action="version"
                    aria-label={`${UTILITY_VERSION_LABEL} v${PLUGIN_VERSION}`}
                    onClick={onShowVersion}
                  >
                    <VersionSealIcon />
                    <strong style={{ fontSize: '11px' }}>v{PLUGIN_VERSION}</strong>
                  </button>
                </div>
                {reconcilePending && (
                  <div
                    role="alertdialog"
                    aria-label={RECONCILE_CONFIRM_PROMPT}
                    data-liangxiang-reconcile-confirm=""
                    style={{ marginTop: '8px', paddingTop: '8px', borderTop: `1px solid ${color.border}` }}
                  >
                    <span style={{ display: 'block', fontSize: '10px', color: color.warn, lineHeight: 1.45 }}>
                      {RECONCILE_CONFIRM_PROMPT}
                    </span>
                    <span style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '7px' }}>
                      <button type="button" data-liangxiang-reconcile-cancel="" onClick={onReconcileCancel} style={{ border: `1px solid ${color.border}`, background: color.bgSubtle, color: color.textPrimary, borderRadius: '6px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer', fontFamily: font.family }}>{RECONCILE_CONFIRM_CANCEL}</button>
                      <button type="button" data-liangxiang-reconcile-ok="" onClick={onReconcileConfirm} style={{ border: 'none', background: color.buttonPrimaryFill, color: color.buttonPrimaryText, borderRadius: '6px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer', fontFamily: font.family }}>{RECONCILE_CONFIRM_OK}</button>
                    </span>
                  </div>
                )}
                {modeConfirmOpen && (
                  <div
                    role="alertdialog"
                    aria-label={modePrompt}
                    data-liangxiang-mode-confirm=""
                    style={{ marginTop: '8px', paddingTop: '8px', borderTop: `1px solid ${color.border}` }}
                  >
                    <span style={{ display: 'block', fontSize: '10px', color: color.warn, lineHeight: 1.45 }}>
                      {modePrompt}
                    </span>
                    <span style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '7px' }}>
                      <button type="button" data-liangxiang-mode-cancel="" disabled={modeChanging} onClick={onModeCancel} style={{ border: `1px solid ${color.border}`, background: color.bgSubtle, color: color.textPrimary, borderRadius: '6px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer', fontFamily: font.family }}>{MODE_CONFIRM_CANCEL}</button>
                      <button type="button" data-liangxiang-mode-ok="" disabled={modeChanging} onClick={onModeConfirm} style={{ border: 'none', background: color.buttonPrimaryFill, color: color.buttonPrimaryText, borderRadius: '6px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer', fontFamily: font.family }}>{modeChanging ? '切换中…' : MODE_CONFIRM_OK}</button>
                    </span>
                  </div>
                )}
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
