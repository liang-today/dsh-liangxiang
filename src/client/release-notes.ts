/**
 * Version-scoped release notes shown once per browser after every upgrade.
 *
 * Keep the literal version independent from `PLUGIN_VERSION`: the manifest
 * test deliberately fails when a version bump forgets to refresh this copy.
 * This is cosmetic localStorage only and never participates in authority.
 */
export const RELEASE_NOTES_VERSION = '1.2.1-beta.2'
export const RELEASE_NOTES_TITLE = `梁相 v${RELEASE_NOTES_VERSION} 更新`
export const RELEASE_NOTES_ITEMS = [
  '定时上香：余额满 500 炷后每 10 分钟按限额上香，23:59 再收尾一次，尽量少留余香。',
  '设置依旧简单：一个开关，右键夯或拉设方向；旧版日终开关需重新开启一次。',
  '手动操作优先：定时上香会等你操作完再继续，DSH 运行时生效。',
  '凝香说明更清楚：直接显示各模型每炷所需 Token。',
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
