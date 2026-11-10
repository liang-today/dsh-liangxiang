import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import { formatMainIncense } from './main-panel-presentation.ts'
import { color, font } from './theme.ts'
import { mainColor } from './main-panel-theme.ts'

/** One unit style for both personal flanks, including transient receipt views. */
export const PERSONAL_INCENSE_UNIT_STYLE: CSSProperties = {
  fontFamily: font.family, fontSize: '9px', fontWeight: 500, lineHeight: '14px',
  color: mainColor.deep, letterSpacing: 'normal',
}

export interface PersonalIncenseCaptionState {
  view: 'daily' | 'gain' | 'balance'
  /** Actual confirmed incense represented by the current receipt, never a forecast. */
  gain: number
  /** Changes only when a new caption starts, not while a receipt is coalesced. */
  sequence: number
}

export interface PersonalIncenseCaptionInput {
  /** Installation/mode/business-date identity; a changed scope starts a new baseline. */
  scopeKey: string
  condensedIncense: number
  /** Optional monotonic identity of each confirmed settlement, including equal-size receipts. */
  settlementSequence?: number
  /** Increment for an explicit request to briefly inspect available incense. */
  peekSequence?: number
  /** Authoritative accepted spending; never a pending vote or a balance estimate. */
  usedIncenseToday?: number
}

const GAIN_MS = 1_500
const BALANCE_MS = 2_600
const DAILY_MS = 2_000
const IDLE: PersonalIncenseCaptionState = { view: 'daily', gain: 0, sequence: 0 }

/**
 * A presentation-only controller. Its inputs are already confirmed receipts;
 * it never reads streaming activity, infers credit from balances, or writes storage.
 * The standalone controller also makes timer cleanup and repeated frames testable.
 */
export function createPersonalIncenseCaptionController(
  onChange: (caption: PersonalIncenseCaptionState) => void,
): { observe: (input: PersonalIncenseCaptionInput) => void, dispose: () => void } {
  let previous: PersonalIncenseCaptionInput | null = null
  let caption = IDLE
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending = 0
  let dailyResting = false

  const publish = (view: PersonalIncenseCaptionState['view'], gain = 0): void => {
    caption = { view, gain, sequence: caption.sequence + 1 }
    onChange(caption)
  }
  const cancelTimer = (): void => { clearTimeout(timer); timer = undefined }
  const daily = (): void => {
    publish('daily')
    dailyResting = true
    timer = setTimeout(() => {
      timer = undefined
      dailyResting = false
      if (pending > 0) { const gained = pending; pending = 0; gain(gained) }
    }, DAILY_MS)
  }
  const balance = (): void => {
    cancelTimer()
    if (caption.view !== 'balance') publish('balance')
    timer = setTimeout(daily, BALANCE_MS)
  }
  const gain = (count: number): void => {
    cancelTimer()
    publish('gain', count)
    timer = setTimeout(balance, GAIN_MS)
  }
  return {
    observe(input) {
      if (previous === null || previous.scopeKey !== input.scopeKey) {
        const hadCaption = caption.view !== 'daily'
        cancelTimer(); pending = 0; dailyResting = false
        previous = { ...input }
        if (hadCaption) publish('daily')
        return
      }
      const prior = previous
      previous = { ...input }
      const newReceipt = input.settlementSequence === undefined
        ? input.condensedIncense > 0 && input.condensedIncense !== prior.condensedIncense
        : input.settlementSequence > (prior.settlementSequence ?? input.settlementSequence)
      if (newReceipt && Number.isSafeInteger(input.condensedIncense) && input.condensedIncense > 0) {
        if (caption.view === 'gain') {
          // No timer restart: even a busy stream of settlements must reveal today's total.
          caption = { ...caption, gain: caption.gain + input.condensedIncense }
          onChange(caption)
        } else if (caption.view === 'balance' || dailyResting) {
          pending += input.condensedIncense
        } else gain(input.condensedIncense)
      }
      if (Number.isSafeInteger(input.usedIncenseToday) && Number.isSafeInteger(prior.usedIncenseToday)
        && prior.usedIncenseToday! >= 0 && input.usedIncenseToday! > prior.usedIncenseToday!) {
        if (caption.view === 'gain') pending += caption.gain
        balance()
      } else if ((input.peekSequence ?? 0) !== (prior.peekSequence ?? 0) && caption.view !== 'gain') balance()
    },
    dispose() {
      cancelTimer(); pending = 0; previous = null; dailyResting = false; caption = IDLE
    },
  }
}

/** Use inside the Badge container; the Panel and caption view remain hook-free. */
export function usePersonalIncenseCaption(input: PersonalIncenseCaptionInput): PersonalIncenseCaptionState {
  const [caption, setCaption] = useState<PersonalIncenseCaptionState>(IDLE)
  const controller = useRef<ReturnType<typeof createPersonalIncenseCaptionController> | null>(null)
  if (controller.current === null) controller.current = createPersonalIncenseCaptionController(setCaption)
  useEffect(() => {
    controller.current!.observe(input)
  }, [input.scopeKey, input.condensedIncense, input.settlementSequence, input.peekSequence, input.usedIncenseToday])
  useEffect(() => () => controller.current?.dispose(), [])
  return caption
}

export const PERSONAL_INCENSE_CAPTION_CSS = `
[data-@Ccaption] { width:52px; color:${color.textSecondary}; text-align:center; font-variant-numeric:tabular-nums; }
[data-@Ccaption] [data-caption-copy] { display:flex; flex-direction:column; align-items:center; gap:2px; width:52px; }
[data-@Ccaption] [data-caption-label] { font-size:10px; line-height:14px; white-space:nowrap; }
[data-@Ccaption] [data-caption-value] { display:flex; align-items:baseline; justify-content:center; gap:1px; width:52px; height:20px; line-height:20px; color:var(--liangxiang-main-deep, ${color.textPrimary}); }
[data-@Ccaption] [data-caption-unit] { flex:none; }
[data-@Ccaption] [data-caption-amount] { font-weight:700; white-space:nowrap; }
[data-@Ccaption][data-view=gain] [data-caption-copy] { animation:@Cgain 1.5s ease both; }
[data-@Ccaption][data-view=balance] [data-caption-copy] { animation:@Cbalance 2.6s ease both; }
[data-@Ccaption][data-view=daily] [data-caption-copy] { animation:@Creturn .16s ease both; }
[data-@Ccaption][data-reduced-motion=true] [data-caption-copy] { animation:none; }
@keyframes @Cgain { 0%,100%{opacity:0}12%,86%{opacity:1} }
@keyframes @Cbalance { 0%{opacity:0}8%,100%{opacity:1} }
@keyframes @Creturn { from{opacity:0}to{opacity:1} }
@media(prefers-reduced-motion:reduce) { [data-@Ccaption] [data-caption-copy] { animation:none!important; } }
`.replaceAll("@C","liangxiang-personal-")

export interface PersonalIncenseCaptionProps {
  earnedIncenseToday: number
  remainingIncense: number
  reducedMotion: boolean
  caption?: PersonalIncenseCaptionState
}

/** One stable flank slot, without a permanent balance badge or activity caption. */
export function PersonalIncenseCaption({
  earnedIncenseToday, remainingIncense, reducedMotion, caption = IDLE,
}: PersonalIncenseCaptionProps): ReactElement {
  const label = caption.view === 'gain' ? '凝香到账' : caption.view === 'balance' ? '个人余香' : '今日凝香'
  const value = caption.view === 'gain' ? caption.gain : caption.view === 'balance' ? remainingIncense : earnedIncenseToday
  const copy = (caption.view === 'gain' ? '+' : '') + formatMainIncense(value)
  const numberStyle: CSSProperties = {
    fontSize: copy.length >= 6 ? '11px' : copy.length >= 5 ? '13px' : '17px',
    letterSpacing: copy.length >= 6 ? '-0.2px' : 0,
  }
  return (
    <div data-liangxiang-personal-caption="" data-view={caption.view} data-reduced-motion={reducedMotion}
      aria-label={`${label}${value.toLocaleString('zh-CN')}炷`} aria-live="polite" aria-atomic="true">
      <style>{PERSONAL_INCENSE_CAPTION_CSS}</style>
      <div data-caption-copy="" key={caption.sequence}>
        <span data-caption-label="">{label}</span>
        <strong data-caption-value="">
          <span data-caption-amount="" data-liangxiang-compact="incense" style={numberStyle}>{copy}</span>
          <small data-caption-unit="" data-liangxiang-personal-unit="" style={PERSONAL_INCENSE_UNIT_STYLE}>炷</small>
        </strong>
      </div>
    </div>
  )
}
