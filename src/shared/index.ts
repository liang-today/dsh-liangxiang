/**
 * Shared layer: serializable contracts and constants used by both the host
 * and client halves. Pure TypeScript only — no React, no DSH, no Node APIs.
 * May import from `domain/` (also pure); nothing else.
 */
import {
  DEFAULT_LIANGZI_THRESHOLDS,
  liangziUpRatioBand,
  type LiangziState,
  type LiangziThresholdPolicy,
} from '../domain/index.ts'
import type { AuthorityMode } from './wire.ts'

/** npm package name: the loader row `name`, the client bundle id, and the `/plugins/<id>/client.js` route segment. */
export const PLUGIN_PACKAGE_NAME = 'dsh-liangbiao'

/** Cordis plugin display name of the host half. */
export const HOST_PLUGIN_NAME = 'liangbiao'

/** Frozen product copy (AGENTS.md): the product name. */
export const PRODUCT_NAME = '梁标'

/** Frozen product copy (AGENTS.md §1): the hover/focus tooltip. Must remain exactly this string. */
export const HOVER_TEXT = '今日梁位'

/** Frozen product copy (AGENTS.md §1): the expanded panel title. */
export const PANEL_TITLE = '今日梁案'

/** V0.1 default daily case title (the mock/local case). */
export const DEFAULT_CASE_TITLE = 'DeepSeek Harness 是夯还是拉'

/** Vote button labels (Region 3) — exactly two, never a third. */
export const VOTE_UP_LABEL = '夯！'
export const VOTE_DOWN_LABEL = '拉！'

/** Short direction names used next to the global ratios (Region 2). */
export const VOTE_UP_NAME = '夯'
export const VOTE_DOWN_NAME = '拉'

/** Region 4 stat labels. */
export const INCENSE_STAT_LABEL = '香火'
export const VOTER_STAT_LABEL = '香客'

/** Region 4 stat glyphs (swap here only — never inline in components). */
export const INCENSE_STAT_ICON = '🪔'
export const VOTER_STAT_ICON = '🙏'

/** Honest soft-trust note for the LOCAL_FAKE_DEV authority mode (AGENTS.md §16). */
export const LOCAL_MODE_NOTE = '本地演示模式：香火与投票均在本机，不代表可信全网结果'

/**
 * Honest soft-trust note for DEV_STAGING_ONLY: the backend really is the
 * authority for spending, but under Decision Gate A3 it can neither
 * authenticate the voter nor verify the Token usage behind the incense.
 */
export const STAGING_MODE_NOTE = '本地预发模式：投票由 Liangbiao 服务端记账，但身份仅为匿名安装标识、Token 用量无法被服务端验证'

/** The note that must accompany each authority mode. */
export const AUTHORITY_MODE_NOTES: Readonly<Record<AuthorityMode, string>> = {
  LOCAL_FAKE_DEV: LOCAL_MODE_NOTE,
  DEV_STAGING_ONLY: STAGING_MODE_NOTE,
}

/** Disabled-vote reason surfaced when the personal incense pool is empty. */
export const NO_INCENSE_REASON = '香火不足：再积累 Token 获得下一炷香后即可投票'

/** Status line while the host channel is unreachable (UI keeps rendering). */
export const OFFLINE_REASON = '未连接本地服务：显示最近状态，重新打开面板可重试'

/** Status line when the DSH accounting seams are absent in this assembly. */
export const ACCOUNTING_UNAVAILABLE_HINT = '记账不可用：当前 DSH 组合缺少 token 投影能力'

/** Display names of the central Liangzi states (WAITING is the zero-vote placeholder, not a tier). */
export const LIANGZI_STATE_LABELS: Readonly<Record<LiangziState, string>> = {
  waiting: '待开梁',
  liang_gong: '梁工',
  liang_zong: '梁总',
  liang_shen: '梁神',
  liang_sheng: '梁圣',
  liang_zu: '梁祖',
}

function percentText(ratio: number): string {
  // Boundaries are whole/one-decimal percents; trim the trailing `.0`.
  const percent = Number((ratio * 100).toFixed(1))
  return `${percent}%`
}

/**
 * The exact global 夯-ratio interval that keeps 梁子 in `state`, e.g.
 * `80% ≤ 夯率 < 90%` for 梁圣. Derived from the threshold policy so the copy
 * can never drift from `liangziStateForUpRatio`.
 */
export function liangziRatioRangeText(
  state: LiangziState,
  policy: LiangziThresholdPolicy = DEFAULT_LIANGZI_THRESHOLDS,
): string {
  const { minInclusive, maxExclusive } = liangziUpRatioBand(state, policy)
  if (minInclusive === null && maxExclusive === null) return '尚无投票'
  if (minInclusive === null) return `夯率 < ${percentText(maxExclusive as number)}`
  if (maxExclusive === null) return `夯率 ≥ ${percentText(minInclusive)}`
  return `${percentText(minInclusive)} ≤ 夯率 < ${percentText(maxExclusive)}`
}

/** List-entry id of the badge inside the `shell.overlay` slot. */
export const OVERLAY_ENTRY_ID = 'liangbiao'

/** List ordering of the badge entry among `shell.overlay` occupants. */
export const OVERLAY_ENTRY_ORDER = 100
