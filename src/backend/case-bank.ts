import { DEFAULT_CASE_TITLE } from '../shared/index.ts'

/**
 * Built-in 梁案 bank. Same titles as `scripts/case-bank.txt`.
 * When the dated queue is empty, `ensureActiveCase` walks this list and wraps.
 */
export const CASE_BANK: readonly string[] = [
  '让梁子替我上班是夯还是拉',
  '今天还要加班是夯还是拉',
  '模型榜单越来越没意义',
  'AI编程已经进入下半场',
  '开源模型终将反超闭源',
  'Prompt工程迟早会消失',
  '程序员不会被AI取代',
  '模型越大边际收益越低',
  'DeepSeek已经改变AI定价',
  'AI Coding已成开发标配',
  '推理时间比参数量更重要',
  '长上下文被严重高估',
  '今天的Agent还只是半成品',
  'DeepSeek今天夯不夯',
  'DSH让你变强了吗？',
  '模型废话是不是太多',
  '程序员还要手写代码吗',
  'AI现在够聪明了吗',
  'AI会淘汰初级程序员吗',
]

function compactTitle(title: string): string {
  return title.replace(/\s+/g, '')
}

export function indexInCaseBank(title: string, bank: readonly string[] = CASE_BANK): number {
  const needle = compactTitle(title)
  return bank.findIndex(item => compactTitle(item) === needle)
}

/** Next title after `previousTitle`, wrapping. Unknown titles start at the first bank entry. */
export function nextCycledCaseTitle(
  previousTitle: string | undefined,
  bank: readonly string[] = CASE_BANK,
  fallback = DEFAULT_CASE_TITLE,
): string {
  if (bank.length === 0) return previousTitle ?? fallback
  if (previousTitle === undefined) return fallback
  const index = indexInCaseBank(previousTitle, bank)
  if (index === -1) return bank[0] ?? fallback
  return bank[(index + 1) % bank.length] ?? fallback
}
