/**
 * Version-scoped release notes shown once per browser after every upgrade.
 *
 * Keep the literal version independent from `PLUGIN_VERSION`: the manifest
 * test deliberately fails when a version bump forgets to refresh this copy.
 * This is cosmetic localStorage only and never participates in authority.
 */
export const RELEASE_NOTES_VERSION = '2.0.1-alpha.2'
export const RELEASE_NOTES_DISPLAY_VERSION = RELEASE_NOTES_VERSION.split('-')[0]!
export const RELEASE_NOTES_TITLE = `梁相${RELEASE_NOTES_DISPLAY_VERSION}更新介绍`
export const RELEASE_NOTES_SLOGAN = '社区起浪，行情跟上。'
export const RELEASE_NOTES_HIGHLIGHTS = [
  { icon: 'market', title: '行情更连贯', copy: '连接恢复后，自动追上社区走势。' },
  { icon: 'waves', title: '重连更省心', copy: '打开失败，稍后自动再试。' },
  { icon: 'waves', title: '水景更完整', copy: '源码安装，梁子和水草加载更稳。' },
] as const
export const RELEASE_NOTES_ITEMS = RELEASE_NOTES_HIGHLIGHTS.map(item => `${item.title}　${item.copy}`)
export const RELEASE_NOTES_GROUP_NAME = '梁相上香QQ群'
export const RELEASE_NOTES_GROUP_NUMBER = '453683905'
export const RELEASE_NOTES_QQ = `${RELEASE_NOTES_GROUP_NAME}：${RELEASE_NOTES_GROUP_NUMBER}`
export const RELEASE_NOTES_QQ_INVITE = '来群里一起出梁案、晒梁位、催更新，第一批梁友等你入席。'
export const RELEASE_NOTES_CONTRIBUTORS = ['@stuffed-cat', '@XChen446', '@xunxiaoQ', '@Ritanlisa'] as const
export const RELEASE_NOTES_THANKS = RELEASE_NOTES_CONTRIBUTORS.join('、')
export const RELEASE_NOTES_THANKS_SUFFIX = '以及每一位社区贡献者与香客。'

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
