import type { PositionMood } from './chart-model.ts'
import { marketBatchName } from './market-presentation.ts'

export type FishAction = 'idle' | 'submit' | 'confirmed' | 'withdraw' | 'long' | 'short'
  | 'batch1' | 'batch2' | 'batch3' | 'history' | 'rules' | 'motion' | 'error'
  | 'zoom-in' | 'zoom-out' | 'mode-candles' | 'mode-tide' | 'pan' | 'inspect' | 'reset'
  | 'fullscreen' | 'restore' | 'amount' | 'report' | 'periodic'
  | 'pool' | 'position' | 'newer' | 'older' | 'dismiss' | 'retry' | 'receipt'

export interface FishReaction { id: number, action: FishAction, text?: string, deliberate?: boolean }

export interface FishFeedbackState {
  active: FishReaction | null
  until: number
  lastId: number | null
  gesture: { group: string, at: number } | null
}

/** One readable response per continuous gesture; reports never queue behind an operation. */
export function receiveFishFeedback(state: FishFeedbackState, next: FishReaction, now: number): FishFeedbackState {
  if (state.lastId !== null && next.id <= state.lastId) return state
  const active = now < state.until ? state.active : null
  const seen = { ...state, active, lastId: next.id }
  if ((next.action === 'periodic' || next.action === 'idle') && active && active.action !== 'idle' && active.action !== 'periodic') return seen
  const group = gestureGroup(next.action)
  const continuousZoom = !active?.deliberate && group === 'zoom' && state.gesture?.group === group && now - state.gesture.at < 900
  const stillReading = active !== null && !active.deliberate && gestureGroup(active.action) === group
  const tracked = { ...seen, gesture: { group, at: now } }
  if (!next.deliberate && next.action !== 'report' && (continuousZoom || stillReading)) return tracked
  return { ...tracked, active: next, until: now + fishFeedbackDuration(next) }
}

export function fishFeedbackDuration(reaction: FishReaction): number {
  return reaction.action === 'report' ? 5_200 : Math.max(4_000, Math.min(10_000, (reaction.text?.length ?? 0) * 140))
}

/** Three presentation rows at most; extra source lines join without losing copy. */
export function fishSpeechLines(text: string): string[] {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  return lines.length <= 3 ? lines : [...lines.slice(0, 2), lines.slice(2).join(' · ')]
}

export function createFishFeedback(reaction: FishReaction | null = null, now = Date.now()): FishFeedbackState {
  const empty: FishFeedbackState = { active: null, until: 0, lastId: null, gesture: null }
  return reaction ? receiveFishFeedback(empty, reaction, now) : empty
}

export function expireFishFeedback(state: FishFeedbackState, now: number): FishFeedbackState {
  return state.active && now >= state.until ? { ...state, active: null } : state
}

function gestureGroup(action: FishAction): string {
  return action === 'zoom-in' || action === 'zoom-out' ? 'zoom' : action
}

const IDLE = {
  surface: ['探个头，继续看浪～', '尾巴晒太阳，眼睛盯水面。', '浪还在变，我可没走神。', '这片水面，有点意思～'],
  dive: ['咕噜…潜水也要看盘。', '先在水下练个憋气。', '没游远，只是在吐泡泡。', '水下安静，尾巴挺忙。'],
  waiting: ['先看浪，不着急～', '你挑时机，我盯水面。', '还没落笔，尾巴先动。', '鱼已就位，慢慢看～'],
} as const

const ACTIONS: Record<Exclude<FishAction, 'idle'>, readonly string[]> = {
  submit: ['等账本点头～', '把这笔递过去，等回执。'],
  confirmed: ['账本点头了，继续看浪。', '这笔核对好了～'],
  withdraw: ['撤回也要等回执～', '先核对，再腾出香火。'],
  long: ['向上看浪，尾巴跟上～', '抬头啦，水面瞧一瞧。'],
  short: ['潜水眼镜，准备好了～', '换个方向，继续看浪。'],
  batch1: [`${marketBatchName(1)}，探个头～`, '第一池浪，我来盯着。'],
  batch2: [`${marketBatchName(2)}，换个姿势看浪。`, '中场看浪，尾巴不歇。'],
  batch3: [`${marketBatchName(3)}，打起精神～`, '最后一池，也慢慢看。'],
  history: ['翻翻旧回执，鱼也回个头。', '过去的浪，记在这里。'],
  rules: ['玩法先看懂，尾巴再开动。', '我陪你看，慢慢读～'],
  motion: ['尾巴开工，泡泡就位～', '动一动，才像大肥鱼。'],
  error: ['原单先核对，别急着重来。', '先缓一缓，我还在这儿。'],
  'zoom-in': ['凑近一点，小浪也看清。', '放大镜就位，探头～'],
  'zoom-out': ['退远一点，整池收进眼底。', '镜头拉开，鱼先后游～'],
  'mode-candles': ['烛线排好，开高低收看仔细。', '换上小烛灯，逐根看浪。'],
  'mode-tide': ['跟着水线，慢悠悠地游～', '潮汐铺开，尾巴顺着浪。'],
  pan: ['挪个镜头，我游在旁边。', '向旁边看看，还有浪。'],
  inspect: ['这根小烛，我探头瞧瞧。', '停在这里，数字慢慢看。'],
  reset: ['镜头归位，我也游回来～', '回到整池，重新看看。'],
  fullscreen: ['伸个懒腰，大水塘来啦～', '池子变大，尾巴舒展开。'],
  restore: ['收收尾巴，回到小水塘。', '镜头收好，鱼还陪着你。'],
  amount: ['整炷记在草稿里，还没投入。', '数一数香火，点头再落笔。'],
  report: ['本盘近况，给你念一念。', '水塘小广播，探头播报～'],
  periodic: ['我在旁边，静静看浪。', '看浪小提醒，慢慢来～'],
  pool: ['两边香火，捞来瞧瞧～'],
  position: ['梁位看清，再摆鱼尾～'],
  newer: ['往新的一页游～'],
  older: ['回头翻翻旧浪花～'],
  dismiss: ['收好小册，接着看浪～'],
  retry: ['再敲敲门，等个准信～'],
  receipt: ['这张回执，展开瞧瞧～'],
}

/** Decorative conversation only. A confirmed line requires a confirmed receipt. */
export function fishResponse(mood: PositionMood, action: FishAction, variant = 0): string {
  const underwater = mood === 'behind' || mood === 'lost'
  const lines = action === 'idle' ? IDLE[underwater ? 'dive' : mood === 'waiting' || mood === 'even' || mood === 'returned' ? 'waiting' : 'surface'] : ACTIONS[action]
  const index = Math.abs(Math.trunc(Number.isFinite(variant) ? variant : 0)) % lines.length
  const line = lines[index]!
  return underwater && action !== 'idle' ? `咕噜，${line}` : line
}

/** A click samples current facts once; decoration never derives a return or a balance. */
export function fishDanmaku(mood: PositionMood, facts: readonly string[], variant = 0): string[] {
  const lines = mood === 'behind' || mood === 'lost'
    ? ['咕噜！谁在水面戳我？', '潜水员收到，泡泡马上到～', '水下也营业，尾巴没摸鱼。']
    : mood === 'ahead' || mood === 'won'
      ? ['探头营业，尾巴加班～', '戳中一条认真看浪的鱼！', '水面风大，先把小尾巴扶稳。']
      : ['鱼已到岗，欢迎投喂好奇心～', '点我查岗？尾巴一直在动！', '先看清浪，再决定往哪游～']
  const index = Math.abs(Math.trunc(Number.isFinite(variant) ? variant : 0))
  const actual = [...new Set(facts.map(line => line.trim()).filter(Boolean))]
  return [lines[index % lines.length]!, ...Array.from({ length: Math.min(2, actual.length) }, (_, i) => actual[(index + i) % actual.length]!)].slice(0, 3)
}
