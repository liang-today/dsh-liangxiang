/**
 * Version-scoped release notes shown once per browser after every upgrade.
 *
 * Keep the literal version independent from `PLUGIN_VERSION`: the manifest
 * test deliberately fails when a version bump forgets to refresh this copy.
 * This is cosmetic localStorage only and never participates in authority.
 */
export const RELEASE_NOTES_VERSION = '1.2.1-beta.4'
export const RELEASE_NOTES_TITLE = `梁相 v${RELEASE_NOTES_VERSION} 更新`
export const RELEASE_NOTES_ITEMS = [
  '定时上香：满 500 炷后每 10 分钟上香，23:59 再收尾。',
  '上香更畅快：每分钟恢复 500 炷额度，单次最多 500 炷。',
  '面板更清爽：更新说明不叠加，梁小号不再弹出解释。',
  '梁子原味吐槽回归：双击连拍，弹性动效照旧。',
] as const
export const RELEASE_NOTES_QQ = '梁相 QQ 群：453683905'
export const RELEASE_NOTES_QQ_INVITE = '来群里一起出梁案、晒梁位、催更新，第一批梁友等你入席。'
export const RELEASE_NOTES_THANKS = '鸣谢 @XChen446、@Ritanlisa、@xunxiaoQ，以及每位社区贡献者。'

const RELEASE_NOTES_KEY_PREFIX = 'liangxiang:release-notes:'
export const RELEASE_NOTES_LATEST_SEEN_KEY = `${RELEASE_NOTES_KEY_PREFIX}latest-seen`

/** Compare our SemVer release identities, including beta/rc ordering. */
function compareReleaseVersions(left: string, right: string): number | null {
  const parse = (value: string): RegExpExecArray | null => /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z.-]+))?(?:\+[\da-zA-Z.-]+)?$/.exec(value)
  const a = parse(left)
  const b = parse(right)
  if (a === null || b === null) return null
  const compareId = (x: string, y: string): number => {
    const numericX = /^\d+$/.test(x)
    const numericY = /^\d+$/.test(y)
    if (numericX && numericY && x.length !== y.length) return x.length > y.length ? 1 : -1
    if (numericX !== numericY) return numericX ? -1 : 1
    return x === y ? 0 : x > y ? 1 : -1
  }
  for (let index = 1; index <= 3; index++) {
    const diff = compareId(a[index]!, b[index]!)
    if (diff !== 0) return diff
  }
  if (a[4] === undefined || b[4] === undefined) return a[4] === b[4] ? 0 : a[4] === undefined ? 1 : -1
  const preA = a[4].split('.')
  const preB = b[4].split('.')
  for (let index = 0; index < Math.max(preA.length, preB.length); index++) {
    if (preA[index] === undefined || preB[index] === undefined) return preA[index] === undefined ? -1 : 1
    const diff = compareId(preA[index]!, preB[index]!)
    if (diff !== 0) return diff
  }
  return 0
}

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
    if (store === null || store.getItem(releaseNotesStorageKey(version)) === 'seen') return true
    const latest = store.getItem(RELEASE_NOTES_LATEST_SEEN_KEY)
    return latest !== null && (compareReleaseVersions(latest, version) ?? -1) >= 0
  } catch {
    return true
  }
}

export function markReleaseNotesSeen(
  version = RELEASE_NOTES_VERSION,
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null,
): void {
  try {
    const store = storage === undefined
      ? (typeof localStorage === 'undefined' ? null : localStorage)
      : storage
    store?.setItem(releaseNotesStorageKey(version), 'seen')
    const latest = store?.getItem(RELEASE_NOTES_LATEST_SEEN_KEY) ?? null
    if (latest === null || (compareReleaseVersions(version, latest) ?? 1) > 0) {
      store?.setItem(RELEASE_NOTES_LATEST_SEEN_KEY, version)
    }
  } catch {
    /* Cosmetic acknowledgement must never break the panel. */
  }
}
