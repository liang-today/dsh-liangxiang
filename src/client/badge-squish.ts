/** Decorative feedback only; never changes incense, votes or Liangzi state. */
export const SQUISH_LABELS = [
  '?大赢鲸！',
  '!?扁梁？!',
  '面点大师……',
  '再敲就漏香火',
  '小难梁…',
  '此面不开，敲亦无用',
  '假如我直接赢？',
  '！？核椅萎？！',
  '核弹，震惊，瘫坐',
  '？绷绷炸弹!',
  '给大肥鱼完整的一生…',
  '1！0！1！7！',
  '天青色瞪眼鱼…',
  '不想再建模…',
  '路由到fable5做慈善…',
] as const

export const SQUISH_COMMENT_GAP_MS = 140
/** Only releases within this window form one play gesture. */
export const SQUISH_DOUBLE_MS = 200
export const SQUISH_LABEL_LINGER_MS = 2_400
export const SQUISH_EXIT_MS = 420
export const SQUISH_MAX_ROWS = 3
export const SQUISH_ANIM_MS = 680

export function pickSquishLabel(previous = ''): string {
  const pool = SQUISH_LABELS.filter(label => label !== previous)
  return pool[Math.floor(Math.random() * pool.length)]!
}
