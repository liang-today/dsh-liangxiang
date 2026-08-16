/**
 * The expanded 梁标 panel — exactly four visual regions (frozen UI contract):
 *
 *   1. 今日梁案 (single active case)
 *   2. overlay flanks | centered 梁子 + 梁气环 | 梁位
 *   3. two equal-width vote buttons 夯：升梁！ / 拉：降梁！
 *   4. 三界香火 + 五行香客 + 上达天听（同一行）
 *
 * No personal-growth section, no ranking, no third option.
 * Presentational only (no hooks); the container wires state and callbacks.
 */
import type { CSSProperties, KeyboardEvent, ReactElement } from 'react'
import { LIANG_POSITION_DECIMALS, formatCompactCount, formatRatioPercents, type VoteType } from '../domain/index.ts'
import {
  ABSURD_CLAIM_NOTICE,
  ACCOUNTING_UNAVAILABLE_HINT,
  AUTHORITY_MODE_NOTES,
  INCENSE_STAT_HINT,
  INCENSE_STAT_LABEL,
  LIANGZI_STATE_LABELS,
  LIANG_POSITION_LABEL,
  MY_INCENSE_LABEL,
  NEXT_INCENSE_LABEL,
  NEXT_INCENSE_UNIT,
  NEXT_INCENSE_WEIGHT_ROWS,
  NEXT_INCENSE_WEIGHT_TITLE,
  NO_INCENSE_REASON,
  OFFLINE_REASON,
  PANEL_TITLE,
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
  DEV_CREDIT_HINT,
  DEV_CREDIT_LABEL,
  liangziRatioRangeText,
} from '../shared/index.ts'
import { PANEL_GAP, PANEL_WIDTH, type PanelPlacement } from './badge-position.ts'
import { HeavenHearIcon } from './HeavenHearIcon.tsx'
import { ThreeRealmsIncenseIcon, FivePhasePilgrimIcon } from './SocialStatIcons.tsx'
import { LiangAvatar } from './LiangAvatar.tsx'
import { LiangQiRing, AVATAR_SLOT, RING_SIZE } from './LiangQiRing.tsx'
import type { LiangbiaoViewState } from './store.ts'
import { color, font } from './theme.ts'
import type { ThrottledProgress } from './use-throttle-fill.ts'

export interface PanelProps {
  state: LiangbiaoViewState
  reducedMotion: boolean
  /** Smoothed + rate-extrapolated fill for the 油门 animation (optional). */
  throttle?: ThrottledProgress
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
  /** First click: open the confirm chip. Confirm is the expensive sync. */
  onReconcileAsk: () => void
  onReconcileConfirm: () => void
  onReconcileCancel: () => void
  reconcilePending: boolean
  /** Frontend-only UI probe: +1 炷 on this tab's picture, no Host/backend. */
  onDevCredit?: () => void
}

const panelStyle: CSSProperties = {
  position: 'absolute',
  width: `${PANEL_WIDTH}px`,
  maxHeight: 'min(420px, 80vh)',
  overflow: 'visible',
  boxSizing: 'border-box',
  padding: '12px',
  borderRadius: '12px',
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
  gap: '5px',
  flex: '1 1 0',
  minWidth: 0,
  whiteSpace: 'nowrap',
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

/** One voice for `梁位 83.021952% → 梁圣` — same size/weight, quiet glue vs facts. */
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
 * 「我的香火」(wider copy) vs 「下一炷」 pulls `space-between` off-center and
 * the 梁子, ring, and incense dots drift sideways.
 */
const FLANK_WIDTH = 48
const CORE_PAD_Y = 6

const coreStyle: CSSProperties = {
  position: 'relative',
  padding: `${CORE_PAD_Y}px 0 34px`,
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
  gap: '1px',
  overflow: 'visible',
  whiteSpace: 'nowrap',
  pointerEvents: 'auto',
}

const flankCaptionStyle: CSSProperties = {
  fontSize: '9px',
  color: color.textSecondary,
}

const voteRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '8px',
  marginTop: '4px',
}

const voteButtonBase: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '7px 0',
  borderRadius: '8px',
  fontFamily: font.family,
  fontSize: '13px',
  fontWeight: 700,
  lineHeight: '18px',
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
[data-liangbiao-reconcile] {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: none;
  background: ${color.bgSubtle};
  padding: 3px 6px;
  margin: 0;
  border-radius: 6px;
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
[data-liangbiao-reconcile]:hover:not(:disabled),
[data-liangbiao-reconcile]:focus-visible {
  color: ${color.textPrimary};
  background: ${color.bgLayer};
  box-shadow: inset 0 0 0 1px ${color.brand}, 0 4px 10px rgba(0, 0, 0, 0.12);
  transform: translateY(-1px);
}
[data-liangbiao-reconcile] [data-liangbiao-hint] {
  position: absolute;
  right: 0;
  bottom: calc(100% + 6px);
  z-index: 2;
  padding: 5px 8px;
  border-radius: 6px;
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
[data-liangbiao-reconcile]:hover:not(:disabled) [data-liangbiao-hint],
[data-liangbiao-reconcile]:focus-visible [data-liangbiao-hint] {
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
  border-radius: 6px;
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
  const {
    state, reducedMotion, throttle, avatarPulse, justCondensed, voteFeedback,
    onVote, onClose, onReconcileAsk, onReconcileConfirm, onReconcileCancel,
    reconcilePending, onDevCredit,
  } = props
  const placement = props.placement ?? { side: 'left', vertical: 'center' }
  const positionPulse = props.positionPulse ?? false
  const { snapshot, personal, activeCase } = state
  // Throttled (smoothed/extrapolated) display values — presentation only. The
  // authoritative remaining incense / vote availability stay on `personal`.
  const displayFill = throttle?.fill ?? personal.liangQiFill
  const displayTokensToNext = throttle?.tokensToNext ?? personal.tokensToNextIncense
  const displayEstimated = throttle?.isEstimated ?? false
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
        : outOfIncense
          ? NO_INCENSE_REASON
          : voteFeedback

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      if (reconcilePending) onReconcileCancel()
      else onClose()
    }
  }

  // Percentages come from the snapshot's own raw counts, so they can never
  // contradict the Liangzi state rendered beside them (AGENTS.md §12).
  const percents = formatRatioPercents(snapshot.upVotes, snapshot.downVotes, LIANG_POSITION_DECIMALS)
  const remainingExact = personal.remainingIncense.toLocaleString('zh-CN')
  const toNextExact = personal.tokensToNextIncense.toLocaleString('zh-CN')
  const remainingCompact = formatCompactCount(personal.remainingIncense)
  const summary = `当前梁子状态：${LIANGZI_STATE_LABELS[snapshot.liangziState]}`
    + `（${liangziRatioRangeText(snapshot.liangziState)}）。`
    + `${LIANG_POSITION_LABEL} ${percents.up}（即${VOTE_UP_NAME} ${percents.up}，${VOTE_DOWN_NAME} ${percents.down}）。`
    + `我的剩余香火 ${remainingExact} 炷，距下一炷还差 ${toNextExact} 当量（Pro 口径）。`
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
        style={{ position: 'relative', marginBottom: '8px', padding: '0 22px', textAlign: 'center' }}
      >
        <h2 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: color.textTertiary, letterSpacing: '1px' }}>
          {PANEL_TITLE}
        </h2>
        <p
          data-liangbiao-case-title=""
          title={activeCase.title}
          style={{
            margin: '4px 0 0',
            fontSize: '15px',
            fontWeight: 600,
            color: color.textPrimary,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
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

          我的香火 N 炷   [梁气环 + 梁子]   下一炷 X 当量
                          梁位 83.021952% → 梁圣
      */}
      <div data-liangbiao-region="core" style={coreStyle}>
        <div data-liangbiao-core-anchor="" style={coreAnchorStyle}>
          <LiangQiRing
            personal={personal}
            reducedMotion={reducedMotion}
            justCondensed={justCondensed}
            fillOverride={displayFill}
            footer={(
              <span
                data-liangbiao-liang-position=""
                title={`${VOTE_UP_NAME} ${percents.up} / ${VOTE_DOWN_NAME} ${percents.down} → ${LIANGZI_STATE_LABELS[snapshot.liangziState]}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  boxSizing: 'border-box',
                  padding: '3px 10px',
                  borderRadius: '999px',
                  border: `1px solid ${color.border}`,
                  background: color.bgLayer,
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
                <span aria-hidden="true" data-liangbiao-liang-position-arrow="" style={positionGlueStyle}>→</span>
                <span
                  data-liangbiao-liangzi-title=""
                  title={`${LIANGZI_STATE_LABELS[snapshot.liangziState]}：${liangziRatioRangeText(snapshot.liangziState)}`}
                  style={positionFactStyle}
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
          <span
            title={`${remainingExact} 炷`}
            style={{ ...numericStyle, fontSize: '11px', fontWeight: 600, color: color.warn, lineHeight: '16px' }}
          >
            <span data-liangbiao-compact="incense">{remainingCompact}</span>
            <span style={{ fontSize: '10px', fontWeight: 600 }}> 炷</span>
          </span>
        </div>
        <div
          style={{ ...flankStyle, right: '0px' }}
          data-liangbiao-personal="next-incense"
          tabIndex={0}
          aria-label={`${NEXT_INCENSE_LABEL} ${toNextExact} ${NEXT_INCENSE_UNIT}，悬停查看模型权重`}
        >
          <span style={flankCaptionStyle}>{NEXT_INCENSE_LABEL}</span>
          <span
            data-liangbiao-compact="next-incense"
            title={`${toNextExact} ${NEXT_INCENSE_UNIT}`}
            style={{ ...numericStyle, fontSize: '11px', fontWeight: 600, color: color.textPrimary, lineHeight: '16px' }}
          >
            {displayEstimated ? '≈ ' : ''}{formatCompactCount(displayTokensToNext)}
          </span>
          <span style={{ fontSize: '10px', color: color.textTertiary }}>{NEXT_INCENSE_UNIT}</span>
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
        style={{ margin: '4px 0 0', minHeight: '14px', fontSize: '11px', color: outOfIncense || offline || absurdNotice ? color.warn : color.textTertiary, textAlign: 'center' }}
      >
        {statusLine}
      </p>
      {onDevCredit !== undefined && (
        <p style={{ margin: '2px 0 0', textAlign: 'center' }}>
          <button
            type="button"
            data-liangbiao-dev-credit=""
            title={DEV_CREDIT_HINT}
            onClick={onDevCredit}
            style={{
              border: 'none',
              background: 'transparent',
              color: color.textTertiary,
              fontFamily: font.family,
              fontSize: '11px',
              cursor: 'pointer',
              textDecoration: 'underline',
              textUnderlineOffset: '2px',
            }}
          >
            {DEV_CREDIT_LABEL}
          </button>
        </p>
      )}

      {/* Region 4 — 三界香火 / 五行香客 / 上达天听 share one row. */}
      <footer
        data-liangbiao-region="social"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginTop: '8px',
          paddingTop: '8px',
          borderTop: `1px solid ${color.border}`,
          color: color.textSecondary,
        }}
      >
        <span
          data-liangbiao-stat="incense"
          title={INCENSE_STAT_HINT}
          style={statStyle}
        >
          <ThreeRealmsIncenseIcon size={18} />
          <span style={statCopyStyle}>
            <span data-liangbiao-stat-label="incense" style={statLabelStyle}>{INCENSE_STAT_LABEL}</span>
            <strong style={statValueStyle}>{snapshot.totalIncense.toLocaleString('zh-CN')}</strong>
          </span>
        </span>
        <span
          data-liangbiao-stat="voters"
          title={VOTER_STAT_HINT}
          style={statStyle}
        >
          <FivePhasePilgrimIcon size={18} />
          <span style={statCopyStyle}>
            <span data-liangbiao-stat-label="voters" style={statLabelStyle}>{VOTER_STAT_LABEL}</span>
            <strong style={statValueStyle}>{snapshot.uniqueVoters.toLocaleString('zh-CN')}</strong>
          </span>
        </span>
        <div
          data-liangbiao-reconcile-slot=""
          style={{ position: 'relative', flex: '0 0 auto', marginLeft: 'auto' }}
        >
          <button
            type="button"
            data-liangbiao-reconcile=""
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
