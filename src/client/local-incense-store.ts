/**
 * Browser-only incense ledger. The community never sees these counts.
 * Today is keyed by the same business date as 梁小号; lifetime survives
 * the day change.
 */
import {
  EMPTY_LOCAL_INCENSE,
  deriveLocalIncenseStats,
  isBusinessDate,
  recordLocalIncenseVote,
  rollLocalIncenseDay,
  type LocalIncenseLedger,
  type LocalIncenseStats,
  type VoteType,
} from '../domain/index.ts'
import { LOCAL_EPITHET_STORAGE_KEY } from './local-epithet-store.ts'

export const LOCAL_INCENSE_STORAGE_KEY = 'liangxiang:local-incense:v1'

interface StoredLocalIncense extends LocalIncenseLedger {
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

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

function readStored(store: Storage): StoredLocalIncense | null {
  try {
    const raw = store.getItem(LOCAL_INCENSE_STORAGE_KEY)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as Partial<StoredLocalIncense>
    if (typeof parsed.businessDate !== 'string' || !isBusinessDate(parsed.businessDate)) return null
    return {
      lifetimeUp: asCount(parsed.lifetimeUp),
      lifetimeDown: asCount(parsed.lifetimeDown),
      todayUp: asCount(parsed.todayUp),
      todayDown: asCount(parsed.todayDown),
      businessDate: parsed.businessDate,
    }
  } catch {
    return null
  }
}

function readLegacyToday(store: Storage): { up: number, down: number, businessDate: string } | null {
  try {
    const raw = store.getItem(LOCAL_EPITHET_STORAGE_KEY)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as { up?: unknown, down?: unknown, businessDate?: unknown }
    if (typeof parsed.businessDate !== 'string' || !isBusinessDate(parsed.businessDate)) return null
    return { up: asCount(parsed.up), down: asCount(parsed.down), businessDate: parsed.businessDate }
  } catch {
    return null
  }
}

function migrateFromEpithet(store: Storage, businessDate: string): LocalIncenseLedger {
  const legacy = readLegacyToday(store)
  if (legacy === null) return { ...EMPTY_LOCAL_INCENSE }
  if (legacy.businessDate === businessDate) {
    return {
      lifetimeUp: legacy.up,
      lifetimeDown: legacy.down,
      todayUp: legacy.up,
      todayDown: legacy.down,
    }
  }
  return {
    lifetimeUp: legacy.up,
    lifetimeDown: legacy.down,
    todayUp: 0,
    todayDown: 0,
  }
}

function persist(store: Storage, ledger: LocalIncenseLedger, businessDate: string): void {
  try {
    store.setItem(LOCAL_INCENSE_STORAGE_KEY, JSON.stringify({
      lifetimeUp: ledger.lifetimeUp,
      lifetimeDown: ledger.lifetimeDown,
      todayUp: ledger.todayUp,
      todayDown: ledger.todayDown,
      businessDate,
    } satisfies StoredLocalIncense))
  } catch {
    /* privacy mode / quota */
  }
}

export function loadLocalIncenseLedger(businessDate: string, storage?: Storage | null): LocalIncenseLedger {
  const store = storageOf(storage)
  if (store === null || !isBusinessDate(businessDate)) return { ...EMPTY_LOCAL_INCENSE }
  const stored = readStored(store)
  if (stored === null) {
    const migrated = migrateFromEpithet(store, businessDate)
    persist(store, migrated, businessDate)
    return migrated
  }
  if (stored.businessDate === businessDate) {
    return {
      lifetimeUp: stored.lifetimeUp,
      lifetimeDown: stored.lifetimeDown,
      todayUp: stored.todayUp,
      todayDown: stored.todayDown,
    }
  }
  const rolled = rollLocalIncenseDay(stored)
  persist(store, rolled, businessDate)
  return rolled
}

export function rememberLocalIncenseVote(
  voteType: VoteType,
  spent: number,
  businessDate: string,
  storage?: Storage | null,
): LocalIncenseStats {
  const next = recordLocalIncenseVote(loadLocalIncenseLedger(businessDate, storage), voteType, spent)
  const store = storageOf(storage)
  if (store !== null && isBusinessDate(businessDate)) persist(store, next, businessDate)
  return deriveLocalIncenseStats(next)
}

export function readLocalIncenseStats(businessDate: string, storage?: Storage | null): LocalIncenseStats {
  return deriveLocalIncenseStats(loadLocalIncenseLedger(businessDate, storage))
}
