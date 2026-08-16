/**
 * compat/dsh — liangbiao storage-domain adapter (docs/044 持久化).
 *
 * Domain `liangbiao` v1 over `ctx.storageDomain.open(spec)`. The spec's
 * `valueSchema` objects only need `.parse(raw)` at open time (verified:
 * packages/storage/storage-domain/src/spec.ts:29 + src/index.ts:121
 * @ 47f94385), so we pass hand-written validators instead of adding a zod
 * dependency. A record failing validation rejects the whole open
 * (`invalid-record`), and the host falls back to memory-only mode loudly.
 *
 * All writes are write-behind: queued onto the domain's write chain,
 * failures logged (never silent), reads never diverge from memory because
 * the service's own maps are the runtime source of truth.
 */
import type {
  GlobalVoteAggregate,
} from '../../domain/index.ts'
import type {
  LiangPersistedState,
  LiangPersistencePort,
  PersistedVoteRecord,
} from '../../host/fake-service.ts'
import type { DailyUsageRecord, SessionUsageWatermark } from '../../host/usage-ledger.ts'
import type { DshKvTable, DshOpenDomain, DshStorageDomainFacility, DshValueSchema } from './host-services.ts'

export const LIANGBIAO_DOMAIN_NAME = 'liangbiao'
export const LIANGBIAO_DOMAIN_VERSION = 1

class RecordShapeError extends Error {}

/** Mirrors the backend's accepted installation-id shape. */
const INSTALLATION_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/

function requireCountField(record: Record<string, unknown>, field: string): number {
  const value = record[field]
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new RecordShapeError(`field ${field} must be a non-negative safe integer`)
  }
  return value
}

function asStoredRecord(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null) throw new RecordShapeError('expected an object record')
  return raw as Record<string, unknown>
}

const watermarkSchema: DshValueSchema = {
  parse(raw: unknown): SessionUsageWatermark {
    const record = asStoredRecord(raw)
    return {
      inputHwm: requireCountField(record, 'inputHwm'),
      outputHwm: requireCountField(record, 'outputHwm'),
    }
  },
}

const dailyUsageSchema: DshValueSchema = {
  parse(raw: unknown): DailyUsageRecord {
    const record = asStoredRecord(raw)
    return {
      inputTokens: requireCountField(record, 'inputTokens'),
      outputTokens: requireCountField(record, 'outputTokens'),
      observedAt: requireCountField(record, 'observedAt'),
    }
  },
}

const ledgerSchema: DshValueSchema = {
  parse(raw: unknown): { usedIncense: number } {
    const record = asStoredRecord(raw)
    return { usedIncense: requireCountField(record, 'usedIncense') }
  },
}

const aggregateSchema: DshValueSchema = {
  parse(raw: unknown): GlobalVoteAggregate {
    const record = asStoredRecord(raw)
    return {
      upVotes: requireCountField(record, 'upVotes'),
      downVotes: requireCountField(record, 'downVotes'),
      uniqueVoters: requireCountField(record, 'uniqueVoters'),
    }
  },
}

const voteSchema: DshValueSchema = {
  parse(raw: unknown): PersistedVoteRecord {
    const record = asStoredRecord(raw)
    const caseId = record.caseId
    const voteType = record.voteType
    if (typeof caseId !== 'string' || caseId.length === 0) throw new RecordShapeError('caseId must be a string')
    if (voteType !== 'up' && voteType !== 'down') throw new RecordShapeError('voteType must be up/down')
    return {
      caseId,
      voteType,
      usedIncenseToday: requireCountField(record, 'usedIncenseToday'),
      remainingIncense: requireCountField(record, 'remainingIncense'),
      acceptedAt: requireCountField(record, 'acceptedAt'),
    }
  },
}

const identitySchema: DshValueSchema = {
  parse(raw: unknown): { installationId: string } {
    const record = asStoredRecord(raw)
    const installationId = record.installationId
    if (typeof installationId !== 'string' || !INSTALLATION_ID_PATTERN.test(installationId)) {
      throw new RecordShapeError('installationId must match [A-Za-z0-9._-]{8,64}')
    }
    return { installationId }
  },
}

const LIANGBIAO_DOMAIN_SPEC = {
  name: LIANGBIAO_DOMAIN_NAME,
  version: LIANGBIAO_DOMAIN_VERSION,
  tables: {
    watermarks: { valueSchema: watermarkSchema },
    daily_usage: { valueSchema: dailyUsageSchema },
    ledgers: { valueSchema: ledgerSchema },
    aggregates: { valueSchema: aggregateSchema },
    votes: { valueSchema: voteSchema },
    identity: { valueSchema: identitySchema },
  },
} as const

/** Single row key of the identity table. */
const IDENTITY_KEY = 'installation'

/**
 * The pseudonymous installation identity port.
 *
 * The id is MINTED BY LIANGBIAO (a fresh uuid), never read from DSH's own
 * `.anonymous-user-id`: borrowing DSH's identifier would blur a DSH-internal
 * value into something we send to a server, and it still would not be
 * authentication (docs/002, docs/043).
 */
export interface LiangbiaoIdentityPort {
  /** The stored id, minting and persisting one on first use. */
  resolve(): Promise<string>
}

export interface LiangbiaoPersistenceHandle {
  port: LiangPersistencePort
  identity: LiangbiaoIdentityPort
  close(): Promise<void>
}

function loadTable<V>(table: DshKvTable, parse: (raw: unknown) => V): Map<string, V> {
  const out = new Map<string, V>()
  for (const [key, raw] of table.entries()) out.set(key, parse(raw))
  return out
}

/**
 * Open the liangbiao domain and wrap it as the service's persistence port.
 * @param facility - the DSH storage-domain facility.
 * @param warn - loud sink for write-behind failures.
 * @returns the port plus the close handle (caller owns closing).
 */
export async function openLiangbiaoPersistence(
  facility: DshStorageDomainFacility,
  warn: (message: string) => void,
): Promise<LiangbiaoPersistenceHandle> {
  const domain: DshOpenDomain = await facility.open(LIANGBIAO_DOMAIN_SPEC)
  const watermarks = domain.table('watermarks')
  const dailyUsage = domain.table('daily_usage')
  const ledgers = domain.table('ledgers')
  const aggregates = domain.table('aggregates')
  const votes = domain.table('votes')
  const identityTable = domain.table('identity')

  const writeBehind = (label: string, write: () => Promise<unknown>): void => {
    write().then(
      () => undefined,
      (error: unknown) => {
        warn(`[dsh-liangbiao] persistence write failed (${label}): ${error instanceof Error ? error.message : String(error)}`)
      },
    )
  }

  const port: LiangPersistencePort = {
    load(): Promise<LiangPersistedState> {
      // Reads are synchronous from validated in-memory state (open already
      // parsed every record through the schemas above).
      return Promise.resolve({
        watermarks: loadTable(watermarks, (raw) => watermarkSchema.parse(raw) as SessionUsageWatermark),
        dailyUsage: loadTable(dailyUsage, (raw) => dailyUsageSchema.parse(raw) as DailyUsageRecord),
        ledgers: loadTable(ledgers, (raw) => ledgerSchema.parse(raw) as { usedIncense: number }),
        aggregates: loadTable(aggregates, (raw) => aggregateSchema.parse(raw) as GlobalVoteAggregate),
        votes: loadTable(votes, (raw) => voteSchema.parse(raw) as PersistedVoteRecord),
      })
    },
    putWatermark: (sessionId, watermark) => writeBehind('watermark', () => watermarks.put(sessionId, watermark)),
    putDailyUsage: (businessDate, record) => writeBehind('daily_usage', () => dailyUsage.put(businessDate, record)),
    putLedger: (businessDate, record) => writeBehind('ledger', () => ledgers.put(businessDate, record)),
    putAggregate: (caseId, aggregate) => writeBehind('aggregate', () => aggregates.put(caseId, aggregate)),
    putVote: (requestId, record) => writeBehind('vote', () => votes.put(requestId, record)),
    deleteVote: (requestId) => writeBehind('vote-delete', () => votes.delete(requestId)),
  }

  const identity: LiangbiaoIdentityPort = {
    async resolve(): Promise<string> {
      const stored = identityTable.get(IDENTITY_KEY)
      if (stored !== undefined) {
        return (identitySchema.parse(stored) as { installationId: string }).installationId
      }
      const installationId = `inst-${crypto.randomUUID()}`
      // Await this write: an unpersisted id would silently reset the ledger.
      await identityTable.put(IDENTITY_KEY, { installationId })
      return installationId
    },
  }

  return { port, identity, close: () => domain.close() }
}
