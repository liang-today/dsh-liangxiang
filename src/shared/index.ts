/**
 * Shared layer: serializable contracts and constants used by both the host
 * and client halves. Pure TypeScript only — no React, no DSH, no Node APIs.
 * May import from `domain/` (also pure); nothing else.
 */
import type { LiangziState } from '../domain/index.ts'

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

/** Vote button labels (Region 3) — exactly two, never a third. */
export const VOTE_UP_LABEL = '夯！'
export const VOTE_DOWN_LABEL = '拉！'

/** Short direction names used next to the global ratios (Region 2). */
export const VOTE_UP_NAME = '夯'
export const VOTE_DOWN_NAME = '拉'

/** Region 4 stat labels. */
export const INCENSE_STAT_LABEL = '香火'
export const VOTER_STAT_LABEL = '香客'

/** Disabled-vote reason surfaced when the personal incense pool is empty. */
export const NO_INCENSE_REASON = '香火不足：再积累 Token 获得下一炷香后即可投票'

/** Display names of the central Liangzi states (WAITING is the zero-vote placeholder, not a tier). */
export const LIANGZI_STATE_LABELS: Readonly<Record<LiangziState, string>> = {
  waiting: '待开梁',
  liang_gong: '梁工',
  liang_zong: '梁总',
  liang_shen: '梁神',
  liang_sheng: '梁圣',
  liang_zu: '梁祖',
}

/** List-entry id of the badge inside the `shell.overlay` slot. */
export const OVERLAY_ENTRY_ID = 'liangbiao'

/** List ordering of the badge entry among `shell.overlay` occupants. */
export const OVERLAY_ENTRY_ORDER = 100
