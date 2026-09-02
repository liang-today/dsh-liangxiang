/**
 * Shared layer: serializable contracts and constants used by both the host
 * and client halves. Pure TypeScript only — no React, no DSH, no Node APIs.
 * May import from `domain/` (also pure); nothing else.
 */
import {
  DEFAULT_LIANGZI_THRESHOLDS,
  formatLocalEpithetName,
  liangziUpRatioBand,
  type LiangziState,
  type LiangziThresholdPolicy,
} from '../domain/index.ts'
import type { AuthorityMode } from './wire.ts'

export { readLiangxiangEnv } from './env.ts'

export {
  emptyHistoryArchive,
  historyArchiveToV1,
  mergeHistoryArchive,
  parseV1HistoryResponse,
  type ParsedHistoryArchive,
  type V1HistoryDay,
  type V1HistoryMonth,
  type V1HistoryResponse,
  type V1HistoryWeek,
} from './history-v1.ts'

/** npm package name: the loader row `name`, the client bundle id, and the `/plugins/<id>/client.js` route segment. */
export const PLUGIN_PACKAGE_NAME = 'dsh-liangxiang'

/** Installed package version, surfaced by 梁相案牍. Keep in sync with package.json. */
export const PLUGIN_VERSION = '1.1.4'

/**
 * Server-only release label for the community backend. Do not bump the npm /
 * client `PLUGIN_VERSION` for a backend-only change; stamp `1.1.4-uN` instead.
 */
export const SERVER_BUILD = '1.1.4-u1'

/** Welcome gift: sticks credited once per device fingerprint per business date. */
export const STARTER_INCENSE_COUNT = 10

/** Cordis plugin display name of the host half. */
export const HOST_PLUGIN_NAME = 'liangxiang'

/** Same-origin Host action guard for explicit, persistent authority selection. */
export const AUTHORITY_MODE_ACTION_HEADER = 'x-liangxiang-mode-action'
export const AUTHORITY_MODE_ACTION_VALUE = 'configure'

/** Frozen product copy (AGENTS.md): the product name. */
export const PRODUCT_NAME = '梁相'

/** Frozen product copy (AGENTS.md §1): the hover/focus tooltip. Must remain exactly this string. */
export const HOVER_TEXT = '今日梁相'

/** Frozen product copy (AGENTS.md §1): the expanded panel title. */
export const PANEL_TITLE = '今日梁案'

/** Region 1 title when the user selected the in-process offline loop. */
export const PANEL_TITLE_LOCAL = '今日梁案（离线）'

/** Local-only control: cycle the prepared 今日梁案 list. Not a fifth region. */
export const CYCLE_LOCAL_CASE_LABEL = '换一案'

/** V0.1 default daily case title (the mock/local case). */
export const DEFAULT_CASE_TITLE = 'DeepSeek Harness 是夯还是拉'

/** Vote button labels (Region 3) — exactly two, never a third. Equal-width pair. */
export const VOTE_UP_LABEL = '夯 · 升梁'
export const VOTE_DOWN_LABEL = '拉 · 降梁'

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
export const MY_INCENSE_LABEL = '今日凝香'

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
/** Hover pair for 三界香火: this body's incense, local-only. */
export const MY_INCENSE_STAT_LABEL = '此身香火'
export const MY_INCENSE_STAT_HINT = '本机记录的上香，仅自己可见，不入天庭账本'
export const STAT_TODAY_LABEL = '今日'
export const STAT_LIFETIME_LABEL = '累计'
export const STAT_SHARE_LABEL = '占梁'

/** Honest soft-trust note for the LOCAL_FAKE_DEV authority mode (AGENTS.md §16). */
export const LOCAL_MODE_NOTE = '离线模式：香火、打梁与梁祠档案均只保存在本机，不代表全网结果'

/**
 * Honest community soft-trust note for DEV_STAGING_ONLY: the backend really
 * is the authority for spending, but under Decision Gate A3 it can neither
 * authenticate a DSH user nor verify the Token usage behind the incense.
 * Ed25519 installation keys only prove "same Host still holds this private key".
 */
export const STAGING_MODE_NOTE = '社区软信任：打梁由梁相服务端记账；身份是本机安装密钥，Token 用量由本机声明、服务端无法核验。不是可信全网公投。'

/** The note that must accompany each authority mode. */
export const AUTHORITY_MODE_NOTES: Readonly<Record<AuthorityMode, string>> = {
  LOCAL_FAKE_DEV: LOCAL_MODE_NOTE,
  DEV_STAGING_ONLY: STAGING_MODE_NOTE,
}

/** Hover / reject copy when the personal incense pool is empty. Keep to one 12px line. */
export const NO_INCENSE_REASON = '香炉空了，先去攒香'

/** Click feedback on an empty furnace. Same length budget as the reason. */
export const NO_INCENSE_GAG = '香炉空了，先去攒香'

export const VOTE_FEEDBACK_MS = 2000
export const EMPTY_INCENSE_FEEDBACK_MS = 3000

export function isEmptyIncenseFeedback(text: string): boolean {
  return text === NO_INCENSE_REASON || text === NO_INCENSE_GAG
}

/** Status line while the host channel is unreachable (UI keeps rendering). */
export const OFFLINE_REASON = '无法连接天庭：尚未取得社区状态，正在自动重连'

/** Online backend is down; local observation continues but no vote is safe. */
export const COMMUNITY_UNAVAILABLE_REASON = '无法连接天庭：社区服务暂不可用；香火继续凝聚，夯 / 拉暂不可用'

/** Status line when the DSH accounting seams are absent in this assembly. */
export const ACCOUNTING_UNAVAILABLE_HINT = '记账不可用：当前 DSH 组合缺少 token 投影能力'

/** Backend guard notice: a single Token claim was clamped as absurd. */
export const ABSURD_CLAIM_NOTICE = 'Token 上报超出合理上限，已限幅（疑似异常）'

/** First-run welcome: short copy; the gift line is the visual emphasis. */
export const WELCOME_TITLE = '欢迎来到梁相'
export const WELCOME_TAGLINE = '梁相还得梁人出！'
export const WELCOME_GIFT_LINE = `新香客备 ${STARTER_INCENSE_COUNT} 炷，对话还能继续攒。`
export const WELCOME_PLAY_LINE = '点一下一炷，长按 1.5 秒倾炉。'
export const WELCOME_LINES = [WELCOME_GIFT_LINE, WELCOME_PLAY_LINE]
export const WELCOME_ONLINE_LABEL = '进入在线'
export const WELCOME_LOCAL_LABEL = '离线模式'
export const VOTE_RATE_LIMITED = '打梁过快，每分钟最多 50 炷'
/** Idle-row 梁号: local-only, never sent to the backend. */
export const LOCAL_EPITHET_TITLE = '梁小号'
export const LOCAL_EPITHET_HINT = '仅本机可见，天庭不记账；随今日香火日清'

export function formatLocalEpithetLine(dedication: string, stance: string): string {
  return `${LOCAL_EPITHET_TITLE}：${formatLocalEpithetName(dedication, stance)}`
}

export function formatAcceptedVoteFeedback(
  voteName: string,
  spent: number,
  remaining: number,
): string {
  return spent > 1
    ? `已上香 · ${voteName} ×${spent}（剩余 ${remaining} 炷）`
    : `已上香 · ${voteName}（剩余 ${remaining} 炷）`
}
export const WELCOME_PRIVACY_NOTE = '不收集对话或账号。在线只用本机随机安装 ID。'
export const WELCOME_DISMISS = '知道了'

/** Region 4 utility drawer. Routine data flow is automatic; this is not sync. */
export const UTILITY_LABEL = '梁相案牍'
export const UTILITY_HINT = '主页、核香、模式与版本'
export const HOMEPAGE_URL = 'https://liang.today/'
export const UTILITY_HOME_LABEL = '梁相主页'
export const UTILITY_HOME_HINT = '打开 liang.today'
export const UTILITY_RECONCILE_LABEL = '核对香火'
export const UTILITY_RECONCILE_HINT = '仅在香火显示异常时使用'
export const UTILITY_MODE_ONLINE_LABEL = '在线模式'
export const UTILITY_MODE_ONLINE_HINT = '切回社区梁案与全网梁位'
export const UTILITY_MODE_LOCAL_LABEL = '离线模式'
export const UTILITY_MODE_LOCAL_HINT = '切换为本机独立玩法'
export const UTILITY_VERSION_LABEL = '当前版本'

export const MODE_CONFIRM_ONLINE = '切回在线模式？离线香火、打梁和梁祠仍保留在本机，不会带入社区。'
export const MODE_CONFIRM_LOCAL = '切换到离线模式？此后香火、打梁和梁祠只记在本机；断网不会自动触发此操作。'
export const MODE_CONFIRM_OK = '确认切换'
export const MODE_CONFIRM_CANCEL = '取消'

/**
 * Repair-only action: discard unconfirmed local observation and re-read the
 * server ledger. Normal claims, snapshots, reconnects and archive sync are
 * automatic; never present this as a routine manual-sync button.
 */
export const RECONCILE_DONE = '香火已按服务器账本核对'
export const RECONCILE_CONFIRM_PROMPT = '仅在显示异常时核香：放弃本机尚未核对的今日观察，并重新读取服务器账本？'
export const RECONCILE_CONFIRM_OK = '确认'
export const RECONCILE_CONFIRM_CANCEL = '取消'

/** Region 4's second quiet ritual control: opens the read-only archive. */
export const LIANGCI_ENTRY_LABEL = '进入梁祠'
export const LIANGCI_ENTRY_HINT = '查看日梁、周梁与月梁档案'
export const LIANGCI_TITLE = '梁祠'
export const LIANGCI_TODAY_LABEL = '今日进行中'
export const LIANGCI_MISSING_LABEL = '无存档'
export const LIANGCI_STALE_LABEL = '档案未更新'

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
export const OVERLAY_ENTRY_ID = 'liangxiang'

/** List ordering of the badge entry among `shell.overlay` occupants. */
export const OVERLAY_ENTRY_ORDER = 100
