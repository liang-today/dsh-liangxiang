import { DEFAULT_CASE_TITLE } from '../shared/index.ts'

/**
 * Built-in 梁案 bank. Same titles as `scripts/case-bank.txt`.
 * When the dated queue is empty, `ensureActiveCase` walks this list and wraps.
 */
export const CASE_BANK: readonly string[] = [
  'DeepSeek Harness是夯还是拉',
  '攒了一周香火一把梭是夯还是拉',
  'DeepSeek-V4-Pro是夯还是拉',
  '用 Flash 慢慢攒香火是夯还是拉',
  '香火环爆满无处安放是夯还是拉',
  '梁子今天只想当梁工躺平是夯还是拉',
  '梁子卡在梁总升不上去是夯还是拉',
  '五行香客里混进机器人是夯还是拉',
  '梁子升到梁圣就开始摆烂是夯还是拉',
  '梁子下凡当程序员是夯还是拉',
  '让梁子替我上班是夯还是拉',
  '梁子接管我的香火是夯还是拉',
  '为了多一炷香熬夜攒当量是夯还是拉',
  '今天还要加班是夯还是拉',
  '梁子修完 bug 顺手把仓库格式化了是夯还是拉',
  '今天只开一个会话死磕到底是夯还是拉',
  '上下文只剩尾巴还不新开是夯还是拉',
  '梁子把我的需求理解成重构是夯还是拉',
  '先上香再问模型是夯还是拉',
  '今天的香火全拿去夯梁子是夯还是拉',
  '梁子升梁圣之后开始改我的变量名是夯还是拉',
  '没当量了还在围观梁位是夯还是拉',
  'Token 烧超了才说一声是夯还是拉',
  '今天不写测试只写功能是夯还是拉',
  '用 Flash 试错再用 Pro 收工是夯还是拉',
  '一炷香决定今晚还要不要改需求是夯还是拉',
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
