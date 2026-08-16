/**
 * The expanded 梁标 panel — exactly four visual regions (frozen UI contract):
 *
 *   1. 今日梁案 (single active case)
 *   2. overlay flanks | centered 梁子 + 梁气环 | 梁位
 *   3. two equal-width vote buttons 夯：升梁！ / 拉：降梁！
 *   4. global 香火 + 香客
 *
 * No personal-growth section, no ranking, no third option.
 * Presentational only (no hooks); the container wires state and callbacks.
 */
import type { CSSProperties, KeyboardEvent, ReactElement } from 'react'
import { LIANG_POSITION_DECIMALS, formatRatioPercents, type VoteType } from '../domain/index.ts'
import {
  ACCOUNTING_UNAVAILABLE_HINT,
  AUTHORITY_MODE_NOTES,
  INCENSE_STAT_ICON,
  INCENSE_STAT_LABEL,
  LIANGZI_STATE_LABELS,
  LIANG_POSITION_LABEL,
  MY_INCENSE_LABEL,
  NEXT_INCENSE_LABEL,
  NO_INCENSE_REASON,
  OFFLINE_REASON,
  PANEL_TITLE,
  VOTER_STAT_ICON,
  VOTER_STAT_LABEL,
  VOTE_DOWN_LABEL,
  VOTE_DOWN_NAME,
  VOTE_UP_LABEL,
  VOTE_UP_NAME,
  liangziRatioRangeText,
} from '../shared/index.ts'
import { PANEL_GAP, PANEL_WIDTH, type PanelPlacement } from './badge-position.ts'
import { LiangAvatar } from './LiangAvatar.tsx'
import { LiangQiRing, RING_SIZE } from './LiangQiRing.tsx'
import type { LiangbiaoViewState } from './store.ts'
import { color, font } from './theme.ts'

export interface PanelProps {
  state: LiangbiaoViewState
  reducedMotion: boolean
  avatarPulse: boolean
  justCondensed: boolean
  /** Transient feedback line under the buttons (e.g. 已上香), empty = none. */
  voteFeedback: string
  /** Play one short pop on the 梁位 value (the container detects the change). */
  positionPulse?: boolean
  /** Where to draw relative to the (freely placeable) badge. */
  placement?: PanelPlacement
  onVote: (voteType: VoteType) => void
  onClose: () => void
}

const panelStyle: CSSProperties = {
  position: 'absolute',
  width: `${PANEL_WIDTH}px`,
  maxHeight: 'min(560px, 80vh)',
  overflowY: 'auto',
  boxSizing: 'border-box',
  padding: '16px',
  borderRadius: '14px',
  border: `1px solid ${color.border}`,
  background: color.bgLayer,
  color: color.textPrimary,
  fontFamily: font.family,
  boxShadow: '0 12px 32px rgba(0, 0, 0, 0.18)',
  pointerEvents: 'auto',
}

const statStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  width: '132px',
  flex: '0 0 auto',
  whiteSpace: 'nowrap',
}

const statIconStyle: CSSProperties = {
  fontSize: '17px',
  lineHeight: 1,
}

const statValueStyle: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: '"tnum"',
  fontSize: '17px',
  fontWeight: 700,
  color: color.textPrimary,
}

/**
 * Every number in the panel is monospaced-by-digit and lives in a
 * FIXED-WIDTH box. Layout must not depend on how large a value happens to be:
 * `5 炷` -> `12 炷` or `3,000` -> `46,935` used to re-centre the whole row and
 * visibly nudge the central 梁子 sideways.
 */
const numericStyle: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: '"tnum"',
}

/**
 * Personal flanks overlay the core; they never take in-flow width. Otherwise
 * 「我的香火」(wider copy) vs 「下一炷」 pulls `space-between` off-center and
 * the 梁子, ring, and incense dots drift sideways.
 */
const FLANK_WIDTH = 64
const CORE_PAD_Y = 8

const coreStyle: CSSProperties = {
  position: 'relative',
  padding: `${CORE_PAD_Y}px 0 18px`,
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
  gap: '1px',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
}

const flankCaptionStyle: CSSProperties = {
  fontSize: '11px',
  color: color.textSecondary,
}

const voteRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '10px',
  marginTop: '6px',
}

const voteButtonBase: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 0',
  borderRadius: '10px',
  fontFamily: font.family,
  fontSize: '15px',
  fontWeight: 700,
  lineHeight: '22px',
  textAlign: 'center',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  border: `1px solid ${color.border}`,
}

/** Anchor the panel to the badge on whichever side/edge has room. */
function placementStyle(placement: PanelPlacement): CSSProperties {
  const horizontal: CSSProperties = placement.side === 'left'
    ? { right: `calc(100% + ${PANEL_GAP}px)` }
    : { left: `calc(100% + ${PANEL_GAP}px)` }
  if (placement.vertical === 'top') return { ...horizontal, top: '0px' }
  if (placement.vertical === 'bottom') return { ...horizontal, bottom: '0px' }
  return { ...horizontal, top: '50%', transform: 'translateY(-50%)' }
}

/** Panel-scoped CSS that inline styles cannot express (focus ring, keyframes). */
const PANEL_CSS = `
[data-liangbiao-panel] button:focus-visible {
  outline: 2px solid ${color.brand};
  outline-offset: 2px;
}
[data-liangbiao-panel] button[disabled] {
  opacity: 0.55;
  cursor: not-allowed;
}
@keyframes liangbiao-avatar-pulse {
  0% { transform: scale(1); }
  40% { transform: scale(1.12); }
  100% { transform: scale(1); }
}
@keyframes liangbiao-avatar-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
@keyframes liangbiao-position-pop {
  0% { transform: translateY(3px); opacity: 0.35; }
  45% { transform: translateY(0); opacity: 1; filter: brightness(1.5); }
  100% { transform: translateY(0); opacity: 1; }
}
@keyframes liangbiao-condense {
  0% { opacity: 0; transform: translateX(-50%) translateY(8px); }
  30% { opacity: 1; transform: translateX(-50%) translateY(0); }
  100% { opacity: 1; }
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

export function Panel(props: PanelProps): ReactElement {
  const { state, reducedMotion, avatarPulse, justCondensed, voteFeedback, onVote, onClose } = props
  const placement = props.placement ?? { side: 'left', vertical: 'center' }
  const positionPulse = props.positionPulse ?? false
  const { snapshot, personal, activeCase } = state
  const offline = state.connection !== 'live'
  const outOfIncense = personal.remainingIncense <= 0
  const votingDisabled = outOfIncense || offline
  const disabledReason = offline
    ? OFFLINE_REASON
    : outOfIncense
      ? NO_INCENSE_REASON
      : ''
  const statusLine = offline
    ? OFFLINE_REASON
    : !state.accountingAvailable
      ? ACCOUNTING_UNAVAILABLE_HINT
      : outOfIncense
        ? NO_INCENSE_REASON
        : voteFeedback

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
    }
  }

  // Percentages come from the snapshot's own raw counts, so they can never
  // contradict the Liangzi state rendered beside them (AGENTS.md §12).
  const percents = formatRatioPercents(snapshot.upVotes, snapshot.downVotes, LIANG_POSITION_DECIMALS)
  const summary = `当前梁子状态：${LIANGZI_STATE_LABELS[snapshot.liangziState]}`
    + `（${liangziRatioRangeText(snapshot.liangziState)}）。`
    + `${LIANG_POSITION_LABEL} ${percents.up}（即${VOTE_UP_NAME} ${percents.up}，${VOTE_DOWN_NAME} ${percents.down}）。`
    + `我的剩余香火 ${personal.remainingIncense} 炷，距下一炷还差 ${personal.tokensToNextIncense.toLocaleString('zh-CN')} Token。`
    + `${AUTHORITY_MODE_NOTES[state.authorityMode]}。`

  return (
    <section
      role="dialog"
      aria-label={PANEL_TITLE}
      data-liangbiao-panel=""
      data-liangbiao-authority={state.authorityMode}
      tabIndex={-1}
      style={{ ...panelStyle, ...placementStyle(placement) }}
      onKeyDown={onKeyDown}
    >
      <style>{PANEL_CSS}</style>

      {/* Region 1 — 今日梁案 */}
      <header
        data-liangbiao-region="case"
        style={{ position: 'relative', marginBottom: '10px', padding: '0 22px', textAlign: 'center' }}
      >
        <h2 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: color.textTertiary, letterSpacing: '1px' }}>
          {PANEL_TITLE}
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: '15px', fontWeight: 600, color: color.textPrimary }}>
          {activeCase.title}
        </p>
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

          我的香火 N 炷   [梁气环 + 梁子]   下一炷 X Token
                          梁位 83.021952%
      */}
      <div data-liangbiao-region="core" style={coreStyle}>
        <div data-liangbiao-core-anchor="" style={coreAnchorStyle}>
          <LiangQiRing
            personal={personal}
            reducedMotion={reducedMotion}
            justCondensed={justCondensed}
            footer={(
              <span
                data-liangbiao-liang-position=""
                title={`${VOTE_UP_NAME} ${percents.up} / ${VOTE_DOWN_NAME} ${percents.down}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'baseline',
                  justifyContent: 'center',
                  gap: '4px',
                  width: '176px',
                  boxSizing: 'border-box',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  border: `1px solid ${color.border}`,
                  background: color.bgLayer,
                  lineHeight: '18px',
                }}
              >
                <span style={{ fontSize: '11px', color: color.textTertiary, letterSpacing: '0.5px' }}>
                  {LIANG_POSITION_LABEL}
                </span>
                <strong
                  data-liangbiao-liang-position-value=""
                  style={{
                    ...numericStyle,
                    fontSize: '15px',
                    fontWeight: 700,
                    color: color.up,
                    animation: positionPulse && !reducedMotion
                      ? 'liangbiao-position-pop 0.5s ease-out 1'
                      : undefined,
                  }}
                >
                  {percents.up}
                </strong>
              </span>
            )}
          >
            <LiangAvatar state={snapshot.liangziState} pulse={avatarPulse} reducedMotion={reducedMotion} />
          </LiangQiRing>
        </div>
        <div style={{ ...flankStyle, left: '0px' }} data-liangbiao-personal="incense">
          <span style={flankCaptionStyle}>{MY_INCENSE_LABEL}</span>
          <span style={{ ...numericStyle, fontSize: '18px', fontWeight: 700, color: color.warn }}>
            {personal.remainingIncense}
            <span style={{ fontSize: '12px', fontWeight: 600 }}> 炷</span>
          </span>
        </div>
        <div style={{ ...flankStyle, right: '0px' }} data-liangbiao-personal="next-incense">
          <span style={flankCaptionStyle}>{NEXT_INCENSE_LABEL}</span>
          <span style={{ ...numericStyle, fontSize: '15px', fontWeight: 700, color: color.textPrimary }}>
            {personal.tokensToNextIncense.toLocaleString('zh-CN')}
          </span>
          <span style={{ fontSize: '11px', color: color.textTertiary }}>Token</span>
        </div>
      </div>

      {/* Region 3 — exactly two equal-width vote buttons */}
      <div data-liangbiao-region="vote" style={voteRowStyle}>
        <button
          type="button"
          data-liangbiao-vote="up"
          disabled={votingDisabled}
          aria-disabled={votingDisabled}
          title={votingDisabled ? disabledReason : `${VOTE_UP_NAME}一炷香`}
          onClick={() => onVote('up')}
          style={{ ...voteButtonBase, background: color.buttonPrimaryFill, borderColor: color.buttonPrimaryFill, color: color.buttonPrimaryText }}
        >
          {VOTE_UP_LABEL}
        </button>
        <button
          type="button"
          data-liangbiao-vote="down"
          disabled={votingDisabled}
          aria-disabled={votingDisabled}
          title={votingDisabled ? disabledReason : `${VOTE_DOWN_NAME}一炷香`}
          onClick={() => onVote('down')}
          style={{ ...voteButtonBase, background: color.bgSubtle, color: color.textPrimary }}
        >
          {VOTE_DOWN_LABEL}
        </button>
      </div>
      <p
        role="status"
        data-liangbiao-vote-feedback=""
        style={{ margin: '6px 0 0', minHeight: '16px', fontSize: '12px', color: outOfIncense || offline ? color.warn : color.textTertiary, textAlign: 'center' }}
      >
        {statusLine}
      </p>

      {/* Region 4 — social stats */}
      <footer
        data-liangbiao-region="social"
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '22px',
          marginTop: '10px',
          paddingTop: '12px',
          borderTop: `1px solid ${color.border}`,
          fontSize: '15px',
          color: color.textSecondary,
        }}
      >
        <span data-liangbiao-stat="incense" style={statStyle}>
          <span aria-hidden="true" style={statIconStyle}>{INCENSE_STAT_ICON}</span>
          {INCENSE_STAT_LABEL}
          <strong style={statValueStyle}>{snapshot.totalIncense.toLocaleString('zh-CN')}</strong>
        </span>
        <span data-liangbiao-stat="voters" style={statStyle}>
          <span aria-hidden="true" style={statIconStyle}>{VOTER_STAT_ICON}</span>
          {VOTER_STAT_LABEL}
          <strong style={statValueStyle}>{snapshot.uniqueVoters.toLocaleString('zh-CN')}</strong>
        </span>
        {/* Both stats sit in fixed-width boxes for the same reason as Region 2. */}
      </footer>

      {/* Screen-reader summary of the full state. */}
      <p aria-live="polite" style={visuallyHidden}>{summary}</p>
    </section>
  )
}
