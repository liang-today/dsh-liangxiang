/**
 * Version-scoped release notes shown once per browser after every upgrade.
 *
 * Keep the literal version independent from `PLUGIN_VERSION`: the manifest
 * test deliberately fails when a version bump forgets to refresh this copy.
 * This is cosmetic localStorage only and never participates in authority.
 */
export const RELEASE_NOTES_VERSION = '1.1.1'
export const RELEASE_NOTES_TITLE = `梁相 v${RELEASE_NOTES_VERSION} 更新`
export const RELEASE_NOTES_EYEBROW = '8 月 26 日后更新合辑'
export const RELEASE_NOTES_ITEMS = [
  '新香客备 10 炷；同一设备当天重装不重复领取。',
  '倾炉缩短为长按 1.5 秒；面板、梁祠、五行香客和跨相反馈继续打磨。',
  '修复批量上香幂等与 SQLite 迁移，并补真实后端重启回归。',
  '适配 DSH 0.1.2-alpha.4，恢复每次开发后的本地升级与启动流程。',
  '补齐浏览器无障碍、亮暗主题、视觉与真实安装 Profile 冒烟基线。',
  '梁子原画像素保持不变；无损瘦身客户端，并恢复进度为 0 时的待机浮动。',
  '新增低打扰梁相广播：重要消息暂代梁小号，结束后自动归还。',
] as const
export const RELEASE_NOTES_QQ = '梁相 QQ 群：453683905'
export const RELEASE_NOTES_QQ_INVITE = '来群里一起出梁案、晒梁位、催更新，第一批梁友等你入席。'
export const RELEASE_NOTES_THANKS = '感谢一直支持梁相的同学们，尤其鸣谢 GitHub @xunxiaoQ 同学。'

const RELEASE_NOTES_KEY_PREFIX = 'liangxiang:release-notes:'

export function releaseNotesStorageKey(version = RELEASE_NOTES_VERSION): string {
  return `${RELEASE_NOTES_KEY_PREFIX}${version}`
}

export function hasSeenReleaseNotes(
  version = RELEASE_NOTES_VERSION,
  storage?: Pick<Storage, 'getItem'> | null,
): boolean {
  try {
    const store = storage === undefined
      ? (typeof localStorage === 'undefined' ? null : localStorage)
      : storage
    return store === null || store.getItem(releaseNotesStorageKey(version)) === 'seen'
  } catch {
    return true
  }
}

export function markReleaseNotesSeen(
  version = RELEASE_NOTES_VERSION,
  storage?: Pick<Storage, 'setItem'> | null,
): void {
  try {
    const store = storage === undefined
      ? (typeof localStorage === 'undefined' ? null : localStorage)
      : storage
    store?.setItem(releaseNotesStorageKey(version), 'seen')
  } catch {
    /* Cosmetic acknowledgement must never break the panel. */
  }
}
