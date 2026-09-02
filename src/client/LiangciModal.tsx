/**
 * 梁祠 — centered read-only calendar archive.
 *
 * Visual direction: modern chronicle with restrained ritual accents. The
 * current business day is a dedicated unfinished calendar page; it never
 * borrows today's live Liangzi state and is excluded from temporary periods.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import {
  addBusinessDays,
  deriveTemporaryMonth,
  deriveTemporaryWeek,
  formatLiangPosition,
  isoWeekFor,
  type LiangDayArchive,
  type LiangMonthArchive,
  type LiangWeekArchive,
  type TemporaryLiangPeriod,
} from '../domain/index.ts'
import {
  LIANGCI_MISSING_LABEL,
  LIANGCI_STALE_LABEL,
  LIANGCI_TITLE,
  LIANGCI_TODAY_LABEL,
  LIANGZI_STATE_LABELS,
  VOTER_STAT_LABEL,
} from '../shared/index.ts'
import type { LiangciHistoryState } from './live-store.ts'
import { LiangAvatar, LIANGZI_LABEL_COLOR } from './LiangAvatar.tsx'
import { LiangciIcon } from './LiangciIcon.tsx'
import { color, font } from './theme.ts'

export interface LiangciModalProps {
  businessDate: string
  history: LiangciHistoryState
  reducedMotion: boolean
  onClose: () => void
  onRetry: () => void
}

type Selection =
  | { kind: 'day', id: string }
  | { kind: 'week', id: string, startDate: string, endDate: string }
  | { kind: 'month', id: string }

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const

function addMonths(monthId: string, amount: number): string {
  const [year, month] = monthId.split('-').map(Number)
  return new Date(Date.UTC(year as number, (month as number) - 1 + amount, 1)).toISOString().slice(0, 7)
}

export function calendarDates(monthId: string): string[] {
  const first = `${monthId}-01`
  const instant = new Date(`${first}T00:00:00.000Z`)
  const weekday = instant.getUTCDay() === 0 ? 7 : instant.getUTCDay()
  const start = addBusinessDays(first, 1 - weekday)
  const [year, month] = monthId.split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(year as number, month as number, 0)).getUTCDate()
  const occupiedCells = weekday - 1 + daysInMonth
  const cellCount = Math.ceil(occupiedCells / 7) * 7
  return Array.from({ length: cellCount }, (_unused, index) => addBusinessDays(start, index))
}

/** Six-row months keep the same dialog height by compacting marks, never labels. */
export function isCompactLiangciMonth(weekRows: number): boolean {
  return weekRows >= 6
}

function monthTitle(monthId: string): string {
  const [year, month] = monthId.split('-').map(Number)
  return `${year} 年 ${month} 月`
}

function shortDate(date: string): string {
  const [, month, day] = date.split('-')
  return `${Number(month)} 月 ${Number(day)} 日`
}

function stateColor(state: LiangDayArchive['liangziState']): string {
  if (state === 'waiting') return color.textTertiary
  if (state === 'liang_zong') return color.textPrimary
  return LIANGZI_LABEL_COLOR[state]
}

const MODAL_CSS = `
[data-liangci-dialog] { --liangxiang-ember-readable: color-mix(in srgb, var(--liangxiang-ember, #c95f38) 64%, var(--dsw-alias-label-primary, #1c2130)); }
@keyframes liangci-enter {
  from { opacity: 0; transform: translateY(8px) scale(.988); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
[data-liangci-dialog] { animation: liangci-enter 170ms cubic-bezier(.2,.8,.2,1) both; }
[data-liangci-dialog] button:focus-visible {
  outline: 2px solid ${color.brand};
  outline-offset: 2px;
}
[data-liangci-nav]:hover:not(:disabled),
[data-liangci-close]:hover,
[data-liangci-retry]:hover { background: ${color.bgHover} !important; color: ${color.textPrimary} !important; }
[data-liangci-cell]:hover,
[data-liangci-cell][data-selected="true"] {
  border-color: color-mix(in srgb, ${color.brand} 62%, ${color.border}) !important;
  background: color-mix(in srgb, ${color.brand} 5%, ${color.bgLayer}) !important;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, ${color.brand} 16%, transparent);
}
[data-liangci-period]:hover,
[data-liangci-period][data-selected="true"] {
  border-color: color-mix(in srgb, ${color.ritualEmber} 58%, ${color.border}) !important;
  background: color-mix(in srgb, ${color.ritualEmber} 5%, ${color.bgLayer}) !important;
}
[data-liangci-scroll] { scrollbar-width: thin; scrollbar-color: ${color.border} transparent; }
@media (max-height: 680px) {
  [data-liangci-dialog] { gap: 10px !important; padding: 14px 20px !important; }
  [data-liangci-detail] { height: 68px !important; flex-basis: 68px !important; padding: 7px 12px !important; }
  [data-liangci-detail] > div { margin-bottom: 3px !important; }
}
@media (max-width: 760px) {
  [data-liangci-dialog] { width: calc(100vw - 20px) !important; padding: 16px !important; }
  [data-liangci-header] { grid-template-columns: 1fr auto !important; }
  [data-liangci-summary-wrap] { grid-column: 1 / -1; justify-self: stretch !important; display: flex; justify-content: center; }
  [data-liangci-month-nav] { padding-right: 28px; }
}
@media (prefers-reduced-motion: reduce) {
  [data-liangci-dialog] { animation: none !important; }
  [data-liangci-dialog] * { scroll-behavior: auto !important; transition: none !important; }
}
@media (prefers-color-scheme: dark) {
  [data-liangci-dialog] { --liangxiang-ember-readable: #cf9a85; }
}
`

const bareButton: CSSProperties = {
  border: 0,
  background: 'transparent',
  color: color.textSecondary,
  fontFamily: font.family,
  cursor: 'pointer',
}

function ArchiveAvatar({
  state,
  reducedMotion,
  size = 34,
}: {
  state: LiangDayArchive['liangziState']
  reducedMotion: boolean
  size?: number
}): ReactElement {
  return (
    <LiangAvatar
      state={state}
      pulse={false}
      reducedMotion={reducedMotion}
      size={size}
      hideLabel
      liangQiFill={0}
    />
  )
}

function CurrentDayMark({ size = 38 }: { size?: number }): ReactElement {
  return (
    <span
      aria-hidden="true"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        display: 'grid',
        placeItems: 'center',
        border: `1.5px solid ${color.brand}`,
        borderRadius: '7px',
        color: color.brand,
        background: `linear-gradient(180deg, color-mix(in srgb, ${color.brand} 8%, ${color.bgLayer}), ${color.bgLayer})`,
        fontSize: '20px',
        lineHeight: 1,
        fontWeight: 750,
        boxShadow: `inset 0 5px 0 color-mix(in srgb, ${color.brand} 12%, transparent)`,
      }}
    >
      今
    </span>
  )
}

function EmptyDayMark({ size = 38 }: { size?: number }): ReactElement {
  return (
    <span
      aria-hidden="true"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        display: 'grid',
        placeItems: 'center',
        border: `1px dashed ${color.border}`,
        borderRadius: '7px',
        color: color.textTertiary,
        fontSize: '16px',
      }}
    >
      —
    </span>
  )
}

function periodLabel(period: TemporaryLiangPeriod | LiangWeekArchive | LiangMonthArchive): string {
  if ('status' in period && period.status === 'waiting') return '待积'
  return LIANGZI_STATE_LABELS[period.liangziState]
}

function MonthSummary({
  monthId,
  period,
  selected,
  reducedMotion,
  onSelect,
}: {
  monthId: string
  period: TemporaryLiangPeriod | LiangMonthArchive | null
  selected: boolean
  reducedMotion: boolean
  onSelect: () => void
}): ReactElement {
  const temporary = period !== null && 'status' in period
  const waiting = period === null || period.totalIncense === 0
  const label = period === null ? LIANGCI_MISSING_LABEL : periodLabel(period)
  return (
    <button
      type="button"
      data-liangci-month-summary=""
      data-liangci-period="month"
      data-selected={selected}
      onClick={onSelect}
      aria-label={`${monthTitle(monthId)}月梁：${label}`}
      style={{
        minWidth: '210px',
        minHeight: '68px',
        display: 'grid',
        gridTemplateColumns: '1fr 54px',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 10px 8px 13px',
        borderRadius: '10px',
        border: `${temporary ? '1px dashed' : '1px solid'} ${temporary ? color.warn : color.border}`,
        background: color.bgSubtle,
        color: color.textPrimary,
        fontFamily: font.family,
        textAlign: 'left',
        cursor: 'pointer',
        position: 'relative',
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
        <span style={{ fontSize: '10px', color: color.textTertiary, letterSpacing: '1px' }}>
          {temporary ? '本月暂梁' : '月梁档案'}
        </span>
        <strong style={{ fontSize: '13px', color: period === null ? color.textTertiary : stateColor(period.liangziState) }}>
          {label}
        </strong>
        <span style={{ fontSize: '10px', color: color.textSecondary, fontVariantNumeric: 'tabular-nums' }}>
          {period === null
            ? '尚无月档'
            : temporary
              ? period.status === 'waiting' ? '截至昨日 · 0 日' : `截至昨日 · ${period.coveredDays} 日`
              : `已封存 · ${period.coveredDays} 日`}
        </span>
      </span>
      {period === null
        ? <EmptyDayMark />
        : waiting
          ? <ArchiveAvatar state="waiting" reducedMotion={reducedMotion} size={48} />
          : <ArchiveAvatar state={period.liangziState} reducedMotion={reducedMotion} size={48} />}
      {temporary && (
        <span
          aria-hidden="true"
          style={{ position: 'absolute', top: '7px', right: '8px', fontSize: '9px', color: color.warn }}
        >
          暂
        </span>
      )}
    </button>
  )
}

function DayCell({
  date,
  displayedMonth,
  businessDate,
  archive,
  selected,
  reducedMotion,
  compact,
  onSelect,
}: {
  date: string
  displayedMonth: string
  businessDate: string
  archive: LiangDayArchive | undefined
  selected: boolean
  reducedMotion: boolean
  compact: boolean
  onSelect: () => void
}): ReactElement {
  const inMonth = date.startsWith(displayedMonth)
  if (!inMonth) {
    return <div aria-hidden="true" style={{ height: '100%', minHeight: 0, borderRadius: '8px', background: 'transparent' }} />
  }
  const day = Number(date.slice(-2))
  const today = date === businessDate
  const future = date > businessDate
  const missing = !today && !future && archive === undefined
  const label = today
    ? LIANGCI_TODAY_LABEL
    : future
      ? '尚未到来'
      : missing
        ? LIANGCI_MISSING_LABEL
        : LIANGZI_STATE_LABELS[archive?.liangziState ?? 'waiting']
  return (
    <button
      type="button"
      data-liangci-cell="day"
      data-liangci-day={date}
      data-liangci-cell-density={compact ? 'compact' : 'regular'}
      data-liangci-day-status={today ? 'today' : future ? 'future' : missing ? 'missing' : 'archived'}
      data-selected={selected}
      onClick={onSelect}
      onFocus={onSelect}
      onMouseEnter={onSelect}
      aria-label={`${shortDate(date)}：${label}`}
      style={{
        height: '100%',
        minHeight: 0,
        minWidth: 0,
        padding: compact ? '4px 4px' : '6px 5px 5px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: '8px',
        border: `1px ${today ? 'solid' : missing ? 'dashed' : 'solid'} ${today ? color.brand : color.border}`,
        background: today
          ? `color-mix(in srgb, ${color.brand} 5%, ${color.bgLayer})`
          : future ? 'transparent' : color.bgSubtle,
        color: future ? color.textTertiary : color.textPrimary,
        fontFamily: font.family,
        cursor: 'pointer',
        opacity: future ? 0.58 : 1,
        overflow: 'hidden',
      }}
    >
      <span style={{ alignSelf: 'flex-start', flex: '0 0 auto', fontSize: compact ? '9px' : '10px', lineHeight: 1, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {day}
      </span>
      {today
        ? <CurrentDayMark size={compact ? 24 : 38} />
        : future
          ? <span aria-hidden="true" style={{ height: compact ? '24px' : '38px' }} />
          : archive === undefined
            ? <EmptyDayMark size={compact ? 24 : 38} />
            : <ArchiveAvatar state={archive.liangziState} reducedMotion={reducedMotion} size={compact ? 24 : 34} />}
      <span
        style={{
          maxWidth: '100%',
          flex: '0 0 auto',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: '10px',
          lineHeight: 1.1,
          fontWeight: today ? 700 : 650,
          color: today
            ? color.brand
            : archive === undefined ? color.textTertiary : stateColor(archive.liangziState),
        }}
      >
        {label}
      </span>
    </button>
  )
}

function WeekCell({
  startDate,
  endDate,
  businessDate,
  period,
  selected,
  reducedMotion,
  compact,
  onSelect,
}: {
  startDate: string
  endDate: string
  businessDate: string
  period: TemporaryLiangPeriod | LiangWeekArchive | null
  selected: boolean
  reducedMotion: boolean
  compact: boolean
  onSelect: () => void
}): ReactElement {
  const week = isoWeekFor(startDate)
  const future = startDate > businessDate
  const temporary = period !== null && 'status' in period
  const label = future ? '尚未到来' : period === null ? LIANGCI_MISSING_LABEL : periodLabel(period)
  return (
    <button
      type="button"
      data-liangci-period="week"
      data-liangci-week={week.weekId}
      data-selected={selected}
      onClick={onSelect}
      onFocus={onSelect}
      onMouseEnter={onSelect}
      aria-label={`${week.weekId} 周梁，${shortDate(startDate)}至${shortDate(endDate)}：${label}`}
      style={{
        position: 'relative',
        height: '100%',
        minHeight: 0,
        minWidth: 0,
        padding: compact ? '5px 6px' : '7px 8px',
        display: 'grid',
        gridTemplateColumns: `1fr ${compact ? 32 : 42}px`,
        alignItems: 'center',
        gap: '5px',
        borderRadius: '8px',
        border: `${temporary ? '1px dashed' : '1px solid'} ${temporary ? color.warn : color.border}`,
        background: future ? 'transparent' : color.bgSubtle,
        color: color.textPrimary,
        fontFamily: font.family,
        textAlign: 'left',
        cursor: 'pointer',
        opacity: future ? 0.52 : 1,
        overflow: 'hidden',
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', gap: compact ? '2px' : '4px', minWidth: 0 }}>
        <span style={{ fontSize: '9px', color: color.textTertiary, fontVariantNumeric: 'tabular-nums' }}>
          {week.weekId.slice(5)} · 周梁
        </span>
        <strong
          title={label}
          style={{
            display: 'block',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontSize: '11px',
            lineHeight: 1.15,
            whiteSpace: 'nowrap',
            color: period === null ? color.textTertiary : stateColor(period.liangziState),
          }}
        >
          {label}
        </strong>
        <span aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
          {Array.from({ length: 7 }, (_unused, index) => (
            <i key={index} style={{ height: '2px', borderRadius: '2px', background: temporary && index >= (period?.coveredDays ?? 0) ? color.border : color.ritualCool }} />
          ))}
        </span>
        <span style={{ display: 'block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '9px', color: color.textTertiary }}>
          {period === null ? '—' : temporary ? `截至昨日 · ${period.coveredDays}/7 日` : `封 · ${period.coveredDays}/7 日`}
        </span>
      </span>
      {future || period === null
        ? <EmptyDayMark size={compact ? 26 : 38} />
        : <ArchiveAvatar state={period.liangziState} reducedMotion={reducedMotion} size={compact ? 26 : 40} />}
      {temporary && <span aria-hidden="true" style={{ position: 'absolute', top: '6px', right: '7px', color: color.warn, fontSize: '9px' }}>暂</span>}
    </button>
  )
}

function DetailPanel({
  selection,
  businessDate,
  days,
  weeks,
  months,
  openWeekUniqueVoters,
  openMonthUniqueVoters,
}: {
  selection: Selection
  businessDate: string
  days: readonly LiangDayArchive[]
  weeks: readonly LiangWeekArchive[]
  months: readonly LiangMonthArchive[]
  openWeekUniqueVoters: number
  openMonthUniqueVoters: number
}): ReactElement {
  let heading = ''
  let eyebrow = ''
  let body: ReactElement
  if (selection.kind === 'day') {
    const archive = days.find(day => day.businessDate === selection.id)
    heading = shortDate(selection.id)
    if (selection.id === businessDate) {
      eyebrow = LIANGCI_TODAY_LABEL
      body = <p style={{ margin: 0 }}>今日尚未结束，不生成终态，也不计入本周、本月暂梁。</p>
    } else if (selection.id > businessDate) {
      eyebrow = '尚未到来'
      body = <p style={{ margin: 0 }}>未来日期不预设梁位。</p>
    } else if (archive === undefined) {
      eyebrow = LIANGCI_MISSING_LABEL
      body = <p style={{ margin: 0 }}>该业务日没有梁祠档案；这与“有档但零票”的待开梁不同。</p>
    } else {
      eyebrow = `已封存日梁 · ${LIANGZI_STATE_LABELS[archive.liangziState]}`
      body = <ArchiveDayFactsRow archive={archive} />
    }
  } else if (selection.kind === 'week') {
    const permanent = weeks.find(week => week.weekId === selection.id)
    const isFuture = selection.startDate > businessDate
    const isCurrent = businessDate >= selection.startDate && businessDate <= selection.endDate
    const temporary = isCurrent && !isFuture
      ? deriveTemporaryWeek(businessDate, days, openWeekUniqueVoters)
      : null
    const period = permanent ?? temporary
    heading = `${selection.id} · ${shortDate(selection.startDate)}—${shortDate(selection.endDate)}`
    eyebrow = isFuture
      ? '尚未到来'
      : period === null
      ? LIANGCI_MISSING_LABEL
      : permanent !== undefined ? '已封存周梁' : temporary?.status === 'waiting' ? '本周待积' : '本周暂梁'
    body = isFuture
      ? <p style={{ margin: 0 }}>未来周期不预设周梁。</p>
      : period === null
      ? <p style={{ margin: 0 }}>该周没有永久周梁档案。</p>
      : <ArchiveFacts up={period.upVotes} down={period.downVotes} voters={period.uniqueVoters} covered={`${period.coveredDays}/7 日`} />
  } else {
    const permanent = months.find(month => month.monthId === selection.id)
    const isCurrent = selection.id === businessDate.slice(0, 7)
    const temporary = isCurrent ? deriveTemporaryMonth(businessDate, days, openMonthUniqueVoters) : null
    const period = permanent ?? temporary
    heading = `${monthTitle(selection.id)}月梁`
    eyebrow = period === null
      ? LIANGCI_MISSING_LABEL
      : permanent !== undefined ? '已封存月梁' : temporary?.status === 'waiting' ? '本月待积' : '本月暂梁'
    body = period === null
      ? <p style={{ margin: 0 }}>该月没有永久月梁档案。</p>
      : <ArchiveFacts up={period.upVotes} down={period.downVotes} voters={period.uniqueVoters} covered={`${period.coveredDays} 日`} />
  }
  return (
    <section
      aria-live="polite"
      data-liangci-detail=""
      style={{
        height: '94px',
        flex: '0 0 94px',
        boxSizing: 'border-box',
        padding: '13px 15px',
        borderRadius: '10px',
        border: `1px solid ${color.border}`,
        background: color.bgSubtle,
        color: color.textSecondary,
        fontSize: '11px',
        lineHeight: 1.5,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '9px', marginBottom: '7px' }}>
        <strong style={{ color: color.textPrimary, fontSize: '13px' }}>{heading}</strong>
        <span style={{ color: color.ritualEmberText, fontSize: '10px', fontWeight: 650 }}>{eyebrow}</span>
      </div>
      {body}
    </section>
  )
}

/** Day detail: five facts take their natural width; 当日梁案 uses leftover space. No scroller. */
export const ARCHIVE_DAY_DETAIL_COLUMNS = 'max-content minmax(140px, 1fr)'

export function ArchiveDayFactsRow({ archive }: { archive: LiangDayArchive }): ReactElement {
  return (
    <div
      data-liangci-day-detail=""
      style={{
        display: 'grid',
        gridTemplateColumns: ARCHIVE_DAY_DETAIL_COLUMNS,
        columnGap: '28px',
        alignItems: 'start',
      }}
    >
      <ArchiveFacts up={archive.upVotes} down={archive.downVotes} voters={archive.uniqueVoters} covered={`${archive.caseCount} 案`} />
      <div style={{ minWidth: 0 }}>
        <strong style={{ display: 'block', marginBottom: '3px', fontSize: '10px', color: color.textTertiary }}>当日梁案</strong>
        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={archive.caseTitles.join('；')}>
          {archive.caseTitles.join(' · ')}
        </span>
      </div>
    </div>
  )
}

export function buildArchiveFacts(
  up: number,
  down: number,
  voters: number,
  covered: string,
): ReadonlyArray<{ key: string, label: string, value: string }> {
  return [
    { key: 'position', label: '梁位', value: formatLiangPosition(up, down) },
    { key: 'incense', label: '香火', value: (up + down).toLocaleString('zh-CN') },
    { key: 'voters', label: VOTER_STAT_LABEL, value: voters.toLocaleString('zh-CN') },
    { key: 'split', label: '夯 / 拉', value: `${up.toLocaleString('zh-CN')} / ${down.toLocaleString('zh-CN')}` },
    { key: 'covered', label: '覆盖', value: covered },
  ]
}

export function ArchiveFacts({
  up, down, covered, voters,
}: {
  up: number
  down: number
  covered: string
  voters: number
}): ReactElement {
  return (
    <dl
      data-liangci-facts=""
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, max-content)',
        gridTemplateRows: 'auto auto',
        gridAutoFlow: 'column',
        columnGap: '16px',
        rowGap: '2px',
        margin: 0,
        overflow: 'visible',
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}
    >
      {buildArchiveFacts(up, down, voters, covered).map((fact) => (
        <Fragment key={fact.key}>
          <dt data-liangci-fact={fact.key} style={{ color: color.textTertiary }}>{fact.label}</dt>
          <dd style={{ margin: 0, color: fact.key === 'position' ? color.textPrimary : undefined, fontWeight: fact.key === 'position' ? 700 : undefined }}>{fact.value}</dd>
        </Fragment>
      ))}
    </dl>
  )
}

export function LiangciModal({
  businessDate,
  history,
  reducedMotion,
  onClose,
  onRetry,
}: LiangciModalProps): ReactElement {
  const currentMonth = businessDate.slice(0, 7)
  const [displayedMonth, setDisplayedMonth] = useState(currentMonth)
  const [selection, setSelection] = useState<Selection>({ kind: 'month', id: currentMonth })
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog?.focus()
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab' || dialog === null) return
      const focusable = [...dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      )]
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = focusable[0] as HTMLElement
      const last = focusable.at(-1) as HTMLElement
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === dialog || !dialog.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || active === dialog || !dialog.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = originalOverflow
      previous?.focus()
    }
  }, [onClose])

  const archive = history.archive
  const days = archive?.days ?? []
  const weeks = archive?.weeks ?? []
  const months = archive?.months ?? []
  const dates = useMemo(() => calendarDates(displayedMonth), [displayedMonth])
  const weekRows = dates.length / 7
  const compactCells = isCompactLiangciMonth(weekRows)
  const dayByDate = useMemo(() => new Map(days.map(day => [day.businessDate, day])), [days])
  const openWeekUniqueVoters = archive?.openWeekUniqueVoters ?? 0
  const openMonthUniqueVoters = archive?.openMonthUniqueVoters ?? 0
  const currentMonthPeriod = deriveTemporaryMonth(businessDate, days, openMonthUniqueVoters)
  const monthPeriod = displayedMonth === currentMonth
    ? currentMonthPeriod
    : months.find(month => month.monthId === displayedMonth) ?? null

  const moveMonth = (amount: number): void => {
    const next = addMonths(displayedMonth, amount)
    setDisplayedMonth(next)
    setSelection({ kind: 'month', id: next })
  }

  return (
    <div
      data-liangci-backdrop=""
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2_147_483_000,
        display: 'grid',
        placeItems: 'center',
        padding: '16px',
        boxSizing: 'border-box',
        background: 'rgba(8, 12, 20, 0.56)',
        backdropFilter: 'blur(2px)',
        pointerEvents: 'auto',
      }}
    >
      <style>{MODAL_CSS}</style>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="liangci-title"
        tabIndex={-1}
        data-liangci-dialog=""
        style={{
          width: 'min(880px, calc(100vw - 32px))',
          // One stable height across 4/5/6-week months. Use the viewport minus
          // the backdrop padding rather than 86vh: the latter needlessly lost
          // ~100px on laptop screens and squeezed a six-row month.
          height: 'min(760px, calc(100vh - 32px))',
          boxSizing: 'border-box',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          padding: '22px 24px 20px',
          borderRadius: '12px',
          border: `1px solid ${color.border}`,
          background: `linear-gradient(180deg, color-mix(in srgb, ${color.ritualGold} 4%, ${color.bgLayer}), ${color.bgLayer} 96px)`,
          color: color.textPrimary,
          boxShadow: '0 24px 70px rgba(0, 0, 0, 0.34)',
          fontFamily: font.family,
          outline: 'none',
          overflow: 'hidden',
        }}
      >
        <header
          data-liangci-header=""
          style={{
            display: 'grid',
            gridTemplateColumns: '210px 1fr 220px',
            alignItems: 'center',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ width: '34px', height: '34px', display: 'grid', placeItems: 'center', borderRadius: '9px', color: color.ritualEmber, background: `color-mix(in srgb, ${color.ritualEmber} 9%, ${color.bgSubtle})`, border: `1px solid color-mix(in srgb, ${color.ritualEmber} 28%, ${color.border})` }}>
              <LiangciIcon size={19} />
            </span>
            <span>
              <h2 id="liangci-title" style={{ margin: 0, fontSize: '19px', lineHeight: 1.1, fontWeight: 750, letterSpacing: '2px' }}>{LIANGCI_TITLE}</h2>
              <span style={{ display: 'block', marginTop: '4px', fontSize: '10px', color: color.textTertiary }}>日梁 · 周梁 · 月梁</span>
            </span>
          </div>
          <div data-liangci-month-nav="" style={{ justifySelf: 'center', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button type="button" data-liangci-nav="previous" aria-label="上个月" onClick={() => moveMonth(-1)} style={{ ...bareButton, width: '30px', height: '30px', borderRadius: '8px', fontSize: '20px' }}>‹</button>
            <strong style={{ minWidth: '130px', textAlign: 'center', fontSize: '16px', fontWeight: 680, fontVariantNumeric: 'tabular-nums' }}>{monthTitle(displayedMonth)}</strong>
            <button type="button" data-liangci-nav="next" aria-label="下个月" disabled={displayedMonth >= currentMonth} onClick={() => moveMonth(1)} style={{ ...bareButton, width: '30px', height: '30px', borderRadius: '8px', fontSize: '20px' }}>›</button>
          </div>
          <div data-liangci-summary-wrap="" style={{ justifySelf: 'end', marginRight: '12px' }}>
            <MonthSummary
              monthId={displayedMonth}
              period={monthPeriod}
              selected={selection.kind === 'month' && selection.id === displayedMonth}
              reducedMotion={reducedMotion}
              onSelect={() => setSelection({ kind: 'month', id: displayedMonth })}
            />
          </div>
        </header>
        <button
          type="button"
          data-liangci-close=""
          aria-label="关闭梁祠"
          onClick={onClose}
          style={{ ...bareButton, position: 'absolute', top: '7px', right: '8px', width: '28px', height: '28px', borderRadius: '8px', fontSize: '19px', lineHeight: 1, zIndex: 2 }}
        >
          ×
        </button>

        {history.status === 'stale' && (
          <div role="status" data-liangci-stale="" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '7px 10px', borderRadius: '8px', border: `1px solid color-mix(in srgb, ${color.warn} 35%, ${color.border})`, background: `color-mix(in srgb, ${color.warn} 7%, ${color.bgLayer})`, color: color.textSecondary, fontSize: '11px' }}>
            <span><strong style={{ color: color.warn }}>{LIANGCI_STALE_LABEL}</strong>　仍显示最近一次成功同步的档案。</span>
            <button type="button" data-liangci-retry="" onClick={onRetry} style={{ ...bareButton, padding: '4px 8px', borderRadius: '6px', color: color.brand }}>重试</button>
          </div>
        )}

        {archive === null && history.status === 'loading'
          ? (
            <div role="status" style={{ minHeight: '420px', display: 'grid', placeItems: 'center', color: color.textTertiary, fontSize: '12px' }}>
              正在启封梁祠档案…
            </div>
          )
          : archive === null
            ? (
              <div role="status" style={{ minHeight: '420px', display: 'grid', placeItems: 'center', color: color.textSecondary, fontSize: '12px' }}>
                <span style={{ textAlign: 'center' }}>{LIANGCI_STALE_LABEL}<br /><button type="button" data-liangci-retry="" onClick={onRetry} style={{ ...bareButton, marginTop: '10px', color: color.brand }}>重新启封</button></span>
              </div>
            )
            : (
              <>
                <div
                  data-liangci-scroll=""
                  data-liangci-week-rows={weekRows}
                  style={{ overflowX: 'auto', overflowY: 'hidden', minHeight: 0, flex: '1 1 0' }}
                >
                  <div
                    style={{
                      minWidth: '794px',
                      minHeight: 0,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(78px, 1fr)) 130px', gap: '8px', marginBottom: '7px', padding: '0 2px' }}>
                      {WEEKDAY_LABELS.map(label => <span key={label} style={{ textAlign: 'center', fontSize: '10px', fontWeight: 650, color: color.textTertiary, letterSpacing: '1px' }}>周{label}</span>)}
                      <span style={{ textAlign: 'center', fontSize: '10px', fontWeight: 700, color: color.ritualEmber, letterSpacing: '1px' }}>周梁</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(78px, 1fr)) 130px', gridTemplateRows: `repeat(${weekRows}, minmax(0, 1fr))`, gap: '8px', flex: '1 1 0', minHeight: 0 }}>
                      {Array.from({ length: weekRows }, (_unused, rowIndex) => {
                        const rowDates = dates.slice(rowIndex * 7, rowIndex * 7 + 7)
                        const startDate = rowDates[0] as string
                        const endDate = rowDates[6] as string
                        const week = isoWeekFor(startDate)
                        const containsToday = businessDate >= startDate && businessDate <= endDate
                        const permanent = weeks.find(item => item.weekId === week.weekId)
                        const period = permanent
                          ?? (containsToday ? deriveTemporaryWeek(businessDate, days, openWeekUniqueVoters) : null)
                        return [
                          ...rowDates.map(date => (
                            <DayCell
                              key={date}
                              date={date}
                              displayedMonth={displayedMonth}
                              businessDate={businessDate}
                              archive={dayByDate.get(date)}
                              selected={selection.kind === 'day' && selection.id === date}
                              reducedMotion={reducedMotion}
                              compact={compactCells}
                              onSelect={() => setSelection({ kind: 'day', id: date })}
                            />
                          )),
                          <WeekCell
                            key={`${week.weekId}-week`}
                            startDate={startDate}
                            endDate={endDate}
                            businessDate={businessDate}
                            period={period}
                            selected={selection.kind === 'week' && selection.id === week.weekId}
                            reducedMotion={reducedMotion}
                            compact={compactCells}
                            onSelect={() => setSelection({ kind: 'week', id: week.weekId, startDate, endDate })}
                          />,
                        ]
                      })}
                    </div>
                  </div>
                </div>
                <DetailPanel
                  selection={selection}
                  businessDate={businessDate}
                  days={days}
                  weeks={weeks}
                  months={months}
                  openWeekUniqueVoters={openWeekUniqueVoters}
                  openMonthUniqueVoters={openMonthUniqueVoters}
                />
              </>
            )}
      </div>
    </div>
  )
}
