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

/** Installed package version, surfaced by the sound-icon long-press easter egg. Keep in sync with package.json. */
export const PLUGIN_VERSION = '0.3.0'

/** Cordis plugin display name of the host half. */
export const HOST_PLUGIN_NAME = 'liangbiao'

/** Frozen product copy (AGENTS.md): the product name. */
export const PRODUCT_NAME = '梁标'

/** Frozen product copy (AGENTS.md §1): the hover/focus tooltip. Must remain exactly this string. */
export const HOVER_TEXT = '今日梁位'

/** Frozen product copy (AGENTS.md §1): the expanded panel title. */
export const PANEL_TITLE = '今日梁案'

/** Region 1 title when the Host fell back to the in-process local loop. */
export const PANEL_TITLE_LOCAL = '今日梁案（本地）'

/** Local-only control: cycle the prepared 今日梁案 list. Not a fifth region. */
export const CYCLE_LOCAL_CASE_LABEL = '换一案'

/** V0.1 default daily case title (the mock/local case). */
export const DEFAULT_CASE_TITLE = 'DeepSeek Harness 是夯还是拉'

/** Vote button labels (Region 3) — exactly two, never a third. Equal-width pair. */
export const VOTE_UP_LABEL = '夯：升梁！'
export const VOTE_DOWN_LABEL = '拉：降梁！'

/** Short direction names used in tooltips and the accessible summary. */
export const VOTE_UP_NAME = '夯'
export const VOTE_DOWN_NAME = '拉'

/**
 * The one public number under the central 梁子: 梁位 = global 夯 ratio, shown
 * with decimals. 拉 is its complement and is never given a second big number.
 */
export const LIANG_POSITION_LABEL = '梁位'

/** Caption of the personal remaining-incense flank. Deliberately NOT 三界香火:
 * Region 4 uses that for the GLOBAL accepted-vote count, and two different
 * numbers under one label is the fastest way to misread the panel.
 */
export const MY_INCENSE_LABEL = '今日香火'

/** Caption of the personal "tokens to the next incense stick" flank. */
export const NEXT_INCENSE_LABEL = '下一炷'

/** Third-row caption under 下一炷, mirroring 可打梁 N 炷 on the left. */
export const NEXT_INCENSE_PROGRESS_LABEL = '已攒'

/** Visible unit under 下一炷: Pro-equivalent tokens, not raw Flash tokens. */
export const NEXT_INCENSE_UNIT = '当量'

export const NEXT_INCENSE_WEIGHT_TITLE = '攒香按 Pro 当量'
export const NEXT_INCENSE_WEIGHT_ROWS: ReadonlyArray<{ model: string, weight: string, stick: string }> = [
  { model: 'V4-Pro', weight: '×1', stick: '5 万当量 = 1 炷' },
  { model: 'V4-Flash', weight: '×0.5', stick: '约 10 万原始用量 = 1 炷' },
  { model: '其它', weight: '×0.5', stick: '同 V4-Flash' },
]

/** Region 4 stat labels (西游口吻：三界香火 / 取经五众). */
export const INCENSE_STAT_LABEL = '三界香火'
export const VOTER_STAT_LABEL = '五行香客'
export const INCENSE_STAT_HINT = '今日梁案有效香火'
export const VOTER_STAT_HINT = '今日至少上过一炷香的香客'
export const STAT_TODAY_LABEL = '今日'
export const STAT_LIFETIME_LABEL = '累计'

/** Honest soft-trust note for the LOCAL_FAKE_DEV authority mode (AGENTS.md §16). */
export const LOCAL_MODE_NOTE = '本地演示模式：香火与打梁均在本机，不代表可信全网结果'

/**
 * Honest community soft-trust note for DEV_STAGING_ONLY: the backend really
 * is the authority for spending, but under Decision Gate A3 it can neither
 * authenticate a DSH user nor verify the Token usage behind the incense.
 * Ed25519 installation keys only prove "same Host still holds this private key".
 */
export const STAGING_MODE_NOTE = '社区软信任：打梁由梁标服务端记账；身份是本机安装密钥，Token 用量由本机声明、服务端无法核验。不是可信全网公投。'

/** The note that must accompany each authority mode. */
export const AUTHORITY_MODE_NOTES: Readonly<Record<AuthorityMode, string>> = {
  LOCAL_FAKE_DEV: LOCAL_MODE_NOTE,
  DEV_STAGING_ONLY: STAGING_MODE_NOTE,
}

/** Disabled-vote reason surfaced when the personal incense pool is empty. */
export const NO_INCENSE_REASON = '香火不足：再积累当量获得下一炷香后即可打梁'

/** Playful visible feedback for an intentional click on an empty incense pool. */
export const NO_INCENSE_GAG = '咣当——香炉空了，梁子催你先去攒香'

/** Status line while the host channel is unreachable (UI keeps rendering). */
export const OFFLINE_REASON = '未连接本地服务：显示最近状态，重新打开面板可重试'

/** Status line when the DSH accounting seams are absent in this assembly. */
export const ACCOUNTING_UNAVAILABLE_HINT = '记账不可用：当前 DSH 组合缺少 token 投影能力'

/** Backend guard notice: a single Token claim was clamped as absurd. */
export const ABSURD_CLAIM_NOTICE = 'Token 上报超出合理上限，已限幅（疑似异常）'

/** First-run welcome: three plain-language lines (not just screen-reader copy). */
export const WELCOME_TITLE = '欢迎来到梁标'
export const WELCOME_LINES = [
  '香火从 DSH 对话里攒：输入 + 输出每 5 万当量凝成一炷。',
  '花一炷香投「夯」或「拉」，共同决定今日梁子。',
  '这是社区软信任，不是加密验证的公投。',
]
export const WELCOME_DISMISS = '知道了'

/**
 * Quiet ritual control: drop locally inflated Token observation and re-read
 * the server incense ledger. Not a fifth region, not a third vote option.
 */
export const RECONCILE_LABEL = '上达天听'
export const RECONCILE_HINT = '和天庭重新对账香火数据'
export const RECONCILE_DONE = '已上达天听'
export const RECONCILE_CONFIRM_PROMPT = '向服务器重新对账香火？'
export const RECONCILE_CONFIRM_OK = '确认'
export const RECONCILE_CONFIRM_CANCEL = '取消'

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
 * `85% ≤ 夯率 < 95%` for 梁圣. Derived from the threshold policy so the copy
 * can never drift from `liangziStateForUpRatio`.
 */
export function liangziRatioRangeText(
  state: LiangziState,
  policy: LiangziThresholdPolicy = DEFAULT_LIANGZI_THRESHOLDS,
): string {
  const { minInclusive, maxExclusive } = liangziUpRatioBand(state, policy)
  if (minInclusive === null && maxExclusive === null) return '尚无打梁'
  if (minInclusive === null) return `夯率 < ${percentText(maxExclusive as number)}`
  if (maxExclusive === null) return `夯率 ≥ ${percentText(minInclusive)}`
  return `${percentText(minInclusive)} ≤ 夯率 < ${percentText(maxExclusive)}`
}

/** List-entry id of the badge inside the `shell.overlay` slot. */
export const OVERLAY_ENTRY_ID = 'liangbiao'

/** List ordering of the badge entry among `shell.overlay` occupants. */
export const OVERLAY_ENTRY_ORDER = 100
