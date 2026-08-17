import { DEFAULT_CASE_TITLE } from '../shared/index.ts'

/**
 * Prepared 今日梁案 for LOCAL_FAKE_DEV. The Host cycles these in order so a
 * local session can keep switching without talking to the community backend.
 * First title is the product default so an empty local boot matches online.
 */
export const LOCAL_CASE_TITLES: readonly string[] = [
  DEFAULT_CASE_TITLE,
  'V4-Pro 是夯还是拉',
  'V4-Flash 是夯还是拉',
  '梁相这个玩法是夯还是拉',
  '今天还要加班是夯还是拉',
]

export function nextLocalCaseIndex(current: number): number {
  if (LOCAL_CASE_TITLES.length === 0) return 0
  return (current + 1) % LOCAL_CASE_TITLES.length
}

export function localCaseId(businessDate: string, index: number): string {
  return `local-${businessDate}-${index}`
}
