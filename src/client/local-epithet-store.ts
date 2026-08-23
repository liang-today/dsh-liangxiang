/**
 * Browser-only 梁号 ledger. The community backend never sees these counts.
 */
import {
  EMPTY_LOCAL_EPITHET,
  deriveLocalEpithet,
  recordLocalEpithetVote,
  type LocalEpithet,
  type LocalEpithetRecord,
  type VoteType,
} from '../domain/index.ts'

export const LOCAL_EPITHET_STORAGE_KEY = 'liangxiang:local-epithet:v1'

function storageOf(storage?: Storage | null): Storage | null {
  if (storage !== undefined) return storage
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function loadLocalEpithetRecord(storage?: Storage | null): LocalEpithetRecord {
  const store = storageOf(storage)
  if (store === null) return { ...EMPTY_LOCAL_EPITHET }
  try {
    const raw = store.getItem(LOCAL_EPITHET_STORAGE_KEY)
    if (raw === null) return { ...EMPTY_LOCAL_EPITHET }
    const parsed = JSON.parse(raw) as { up?: unknown, down?: unknown }
    const up = typeof parsed.up === 'number' && Number.isFinite(parsed.up) ? Math.max(0, Math.floor(parsed.up)) : 0
    const down = typeof parsed.down === 'number' && Number.isFinite(parsed.down)
      ? Math.max(0, Math.floor(parsed.down))
      : 0
    return { up, down }
  } catch {
    return { ...EMPTY_LOCAL_EPITHET }
  }
}

export function saveLocalEpithetRecord(record: LocalEpithetRecord, storage?: Storage | null): void {
  const store = storageOf(storage)
  if (store === null) return
  try {
    store.setItem(LOCAL_EPITHET_STORAGE_KEY, JSON.stringify({
      up: Math.max(0, Math.floor(record.up)),
      down: Math.max(0, Math.floor(record.down)),
    }))
  } catch {
    /* privacy mode / quota */
  }
}

export function rememberLocalEpithetVote(
  voteType: VoteType,
  spent: number,
  storage?: Storage | null,
): LocalEpithet {
  const next = recordLocalEpithetVote(loadLocalEpithetRecord(storage), voteType, spent)
  saveLocalEpithetRecord(next, storage)
  return deriveLocalEpithet(next)
}

export function readLocalEpithet(storage?: Storage | null): LocalEpithet {
  return deriveLocalEpithet(loadLocalEpithetRecord(storage))
}
