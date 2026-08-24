/**
 * Browser-only 梁号 ledger. The community backend never sees these counts.
 * The row is keyed by the same business date as 今日凝香, so a new day
 * starts at 旁观 • 闲梁.
 */
import {
  EMPTY_LOCAL_EPITHET,
  deriveLocalEpithet,
  isBusinessDate,
  recordLocalEpithetVote,
  type LocalEpithet,
  type LocalEpithetRecord,
  type VoteType,
} from '../domain/index.ts'

export const LOCAL_EPITHET_STORAGE_KEY = 'liangxiang:local-epithet:v2'

interface StoredLocalEpithet {
  up: number
  down: number
  businessDate: string
}

function storageOf(storage?: Storage | null): Storage | null {
  if (storage !== undefined) return storage
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function readStored(store: Storage): StoredLocalEpithet | null {
  try {
    const raw = store.getItem(LOCAL_EPITHET_STORAGE_KEY)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as { up?: unknown, down?: unknown, businessDate?: unknown }
    if (typeof parsed.businessDate !== 'string' || !isBusinessDate(parsed.businessDate)) return null
    const up = typeof parsed.up === 'number' && Number.isFinite(parsed.up) ? Math.max(0, Math.floor(parsed.up)) : 0
    const down = typeof parsed.down === 'number' && Number.isFinite(parsed.down)
      ? Math.max(0, Math.floor(parsed.down))
      : 0
    return { up, down, businessDate: parsed.businessDate }
  } catch {
    return null
  }
}

export function loadLocalEpithetRecord(businessDate: string, storage?: Storage | null): LocalEpithetRecord {
  const store = storageOf(storage)
  if (store === null) return { ...EMPTY_LOCAL_EPITHET }
  const stored = readStored(store)
  if (stored === null) return { ...EMPTY_LOCAL_EPITHET }
  if (!isBusinessDate(businessDate) || stored.businessDate !== businessDate) return { ...EMPTY_LOCAL_EPITHET }
  return { up: stored.up, down: stored.down }
}

export function saveLocalEpithetRecord(
  record: LocalEpithetRecord,
  businessDate: string,
  storage?: Storage | null,
): void {
  const store = storageOf(storage)
  if (store === null || !isBusinessDate(businessDate)) return
  try {
    store.setItem(LOCAL_EPITHET_STORAGE_KEY, JSON.stringify({
      up: Math.max(0, Math.floor(record.up)),
      down: Math.max(0, Math.floor(record.down)),
      businessDate,
    } satisfies StoredLocalEpithet))
  } catch {
    /* privacy mode / quota */
  }
}

export function rememberLocalEpithetVote(
  voteType: VoteType,
  spent: number,
  businessDate: string,
  storage?: Storage | null,
): LocalEpithet {
  const next = recordLocalEpithetVote(loadLocalEpithetRecord(businessDate, storage), voteType, spent)
  saveLocalEpithetRecord(next, businessDate, storage)
  return deriveLocalEpithet(next)
}

export function readLocalEpithet(businessDate: string, storage?: Storage | null): LocalEpithet {
  return deriveLocalEpithet(loadLocalEpithetRecord(businessDate, storage))
}
