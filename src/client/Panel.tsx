/**
 * The expanded 梁标 panel — exactly four visual regions (frozen UI contract):
 *
 *   1. 今日梁案 (single active case)
 *   2. 夯 ratio | central 梁子 + personal 梁气环 | 拉 ratio
 *   3. two vote buttons 夯！/ 拉！
 *   4. global 香火 + 香客
 *
 * No personal-growth section, no ranking, no third option.
 * Presentational only (no hooks); the container wires state and callbacks.
 */
import type { CSSProperties, KeyboardEvent, ReactElement } from 'react'
import type { VoteType } from '../domain/index.ts'
import {
  INCENSE_STAT_LABEL,
  LIANGZI_STATE_LABELS,
  NO_INCENSE_REASON,
  PANEL_TITLE,
  VOTER_STAT_LABEL,
  VOTE_DOWN_LABEL,
  VOTE_DOWN_NAME,
  VOTE_UP_LABEL,
  VOTE_UP_NAME,
} from '../shared/index.ts'
import { LiangAvatar } from './LiangAvatar.tsx'
import { LiangQiRing } from './LiangQiRing.tsx'
import type { LiangbiaoViewState } from './store.ts'
import { color, font } from './theme.ts'

export interface PanelProps {
  state: LiangbiaoViewState
  reducedMotion: boolean
  avatarPulse: boolean
  justCondensed: boolean
  /** Transient feedback line under the buttons (e.g. 已上香), empty = none. */
  voteFeedback: string
  onVote: (voteType: VoteType) => void
  onClose: () => void
}

function formatRatio(ratio: number | null): string {
  if (ratio === null) return '--'
  return `${Math.round(ratio * 100)}%`
}

const panelStyle: CSSProperties = {
  position: 'absolute',
  right: 'calc(100% + 10px)',
  top: '50%',
  transform: 'translateY(-50%)',
  width: '336px',
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

const ratioBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '2px',
  minWidth: '52px',
}

const voteButtonBase: CSSProperties = {
  flex: 1,
  padding: '9px 0',
  borderRadius: '10px',
  fontFamily: font.family,
  fontSize: '15px',
  fontWeight: 700,
  cursor: 'pointer',
  border: `1px solid ${color.border}`,
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
  const { snapshot, personal, activeCase } = state
  const outOfIncense = personal.remainingIncense <= 0

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
    }
  }

  const summary = `当前梁子状态：${LIANGZI_STATE_LABELS[snapshot.liangziState]}。`
    + `${VOTE_UP_NAME}占比 ${formatRatio(snapshot.upRatio)}，${VOTE_DOWN_NAME}占比 ${formatRatio(snapshot.downRatio)}。`
    + `我的剩余香火 ${personal.remainingIncense} 炷，距下一炷还差 ${personal.tokensToNextIncense.toLocaleString('zh-CN')} Token。`

  return (
    <section
      role="dialog"
      aria-label={PANEL_TITLE}
      data-liangbiao-panel=""
      tabIndex={-1}
      style={panelStyle}
      onKeyDown={onKeyDown}
    >
      <style>{PANEL_CSS}</style>

      {/* Region 1 — 今日梁案 */}
      <header
        data-liangbiao-region="case"
        style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '10px' }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: color.textTertiary, letterSpacing: '1px' }}>
            {PANEL_TITLE}
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '15px', fontWeight: 600, color: color.textPrimary }}>
            {activeCase.title}
          </p>
        </div>
        <button
          type="button"
          aria-label="关闭面板"
          onClick={onClose}
          style={{
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

      {/* Region 2 — 夯 ratio | 梁子 + 梁气环 | 拉 ratio */}
      <div
        data-liangbiao-region="core"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', padding: '8px 0 14px' }}
      >
        <div style={ratioBlockStyle} data-liangbiao-ratio="up">
          <span style={{ fontSize: '13px', color: color.textSecondary }}>{VOTE_UP_NAME}</span>
          <span style={{ fontSize: '20px', fontWeight: 700, color: color.up }}>{formatRatio(snapshot.upRatio)}</span>
        </div>
        <LiangQiRing personal={personal} reducedMotion={reducedMotion} justCondensed={justCondensed}>
          <LiangAvatar state={snapshot.liangziState} pulse={avatarPulse} reducedMotion={reducedMotion} />
        </LiangQiRing>
        <div style={ratioBlockStyle} data-liangbiao-ratio="down">
          <span style={{ fontSize: '13px', color: color.textSecondary }}>{VOTE_DOWN_NAME}</span>
          <span style={{ fontSize: '20px', fontWeight: 700, color: color.danger }}>{formatRatio(snapshot.downRatio)}</span>
        </div>
      </div>

      {/* Region 3 — exactly two vote buttons */}
      <div data-liangbiao-region="vote" style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
        <button
          type="button"
          data-liangbiao-vote="up"
          disabled={outOfIncense}
          aria-disabled={outOfIncense}
          title={outOfIncense ? NO_INCENSE_REASON : `${VOTE_UP_NAME}一炷香`}
          onClick={() => onVote('up')}
          style={{ ...voteButtonBase, background: color.buttonPrimaryFill, borderColor: color.buttonPrimaryFill, color: color.buttonPrimaryText }}
        >
          {VOTE_UP_LABEL}
        </button>
        <button
          type="button"
          data-liangbiao-vote="down"
          disabled={outOfIncense}
          aria-disabled={outOfIncense}
          title={outOfIncense ? NO_INCENSE_REASON : `${VOTE_DOWN_NAME}一炷香`}
          onClick={() => onVote('down')}
          style={{ ...voteButtonBase, background: color.bgSubtle, color: color.textPrimary }}
        >
          {VOTE_DOWN_LABEL}
        </button>
      </div>
      <p
        role="status"
        data-liangbiao-vote-feedback=""
        style={{ margin: '6px 0 0', minHeight: '16px', fontSize: '12px', color: outOfIncense ? color.warn : color.textTertiary, textAlign: 'center' }}
      >
        {outOfIncense ? NO_INCENSE_REASON : voteFeedback}
      </p>

      {/* Region 4 — social stats */}
      <footer
        data-liangbiao-region="social"
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '18px',
          marginTop: '10px',
          paddingTop: '10px',
          borderTop: `1px solid ${color.border}`,
          fontSize: '13px',
          color: color.textSecondary,
        }}
      >
        <span data-liangbiao-stat="incense">
          {'🔥 '}
          {INCENSE_STAT_LABEL}
          {' '}
          <strong style={{ color: color.textPrimary }}>{snapshot.totalIncense.toLocaleString('zh-CN')}</strong>
        </span>
        <span data-liangbiao-stat="voters">
          {'👤 '}
          {VOTER_STAT_LABEL}
          {' '}
          <strong style={{ color: color.textPrimary }}>{snapshot.uniqueVoters.toLocaleString('zh-CN')}</strong>
        </span>
      </footer>

      {/* Screen-reader summary of the full state. */}
      <p aria-live="polite" style={visuallyHidden}>{summary}</p>
    </section>
  )
}
