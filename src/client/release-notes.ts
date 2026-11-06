/**
 * Version-scoped release notes shown once per browser after every upgrade.
 *
 * Keep the literal version independent from `PLUGIN_VERSION`: the manifest
 * test deliberately fails when a version bump forgets to refresh this copy.
 * This is cosmetic localStorage only and never participates in authority.
 */
export const RELEASE_NOTES_VERSION = '1.2.2-beta.1'
export const RELEASE_NOTES_TITLE = `梁相 v${RELEASE_NOTES_VERSION} 更新`
export const RELEASE_NOTES_ITEMS = [
  '定时上香：余额满 500 炷后每 10 分钟按限额上香，23:59 再收尾一次，尽量少留余香。',
  '新增梁位走势：案牍下方一条入口，可浮窗、全屏或收成右下角小卡，关掉也会记得。',
  '走势只画本机看到的梁位：DSH 没运行时画虚线并写「未统计」，期间的票仍算，不补线。',
  '走势只读：不花香火、不改梁位，采样出问题也不影响今日梁案和投票。',
] as const
export const RELEASE_NOTES_QQ = '梁相 QQ 群：453683905'
export const RELEASE_NOTES_QQ_INVITE = '来群里一起出梁案、晒梁位、催更新，第一批梁友等你入席。'
export const RELEASE_NOTES_THANKS = '鸣谢 @XChen446、@Ritanlisa、@xunxiaoQ，以及每位社区贡献者。'

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
