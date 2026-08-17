/**
 * compat/dsh — liangxiang storage-domain adapter (docs/044 持久化).
 *
 * Domain `liangxiang` v1 over `ctx.storageDomain.open(spec)`. The spec's
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
import {
  generateCommunityKeypair,
  type CommunityKeypair,
} from '../../host/community-keys.ts'
import type { DailyUsageRecord, SessionUsageWatermark } from '../../host/usage-ledger.ts'
import type { DshKvTable, DshOpenDomain, DshStorageDomainFacility, DshValueSchema } from './host-services.ts'

export const LIANGXIANG_DOMAIN_NAME = 'liangxiang'
export const LIANGXIANG_DOMAIN_VERSION = 1
/** Read-only migration source used only when the new domain has no identity. */
export const LEGACY_LIANGBIAO_DOMAIN_NAME = 'liangbiao'

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
      weightCarry: record.weightCarry === undefined ? 0 : requireCountField(record, 'weightCarry'),
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
  parse(raw: unknown): CommunityKeypair | { installationId: string } {
    const record = asStoredRecord(raw)
    const installationId = record.installationId
    if (typeof installationId !== 'string' || !INSTALLATION_ID_PATTERN.test(installationId)) {
      throw new RecordShapeError('installationId must match [A-Za-z0-9._-]{8,64}')
    }
    const publicKey = record.publicKey
    const privateKeyPem = record.privateKeyPem
    if (typeof publicKey === 'string' && typeof privateKeyPem === 'string') {
      const fingerprint = record.deviceFingerprint
      return {
        installationId,
        publicKey,
        privateKeyPem,
        deviceFingerprint: typeof fingerprint === 'string' ? fingerprint : null,
      }
    }
    return { installationId }
  },
}

function domainSpec(name: string) {
  return {
  name,
  version: LIANGXIANG_DOMAIN_VERSION,
  tables: {
    watermarks: { valueSchema: watermarkSchema },
    daily_usage: { valueSchema: dailyUsageSchema },
    ledgers: { valueSchema: ledgerSchema },
    aggregates: { valueSchema: aggregateSchema },
    votes: { valueSchema: voteSchema },
    identity: { valueSchema: identitySchema },
  },
  } as const
}

const LIANGXIANG_DOMAIN_SPEC = domainSpec(LIANGXIANG_DOMAIN_NAME)
const LEGACY_LIANGBIAO_DOMAIN_SPEC = domainSpec(LEGACY_LIANGBIAO_DOMAIN_NAME)

/** Single row key of the identity table. */
const IDENTITY_KEY = 'installation'

/**
 * The community installation identity port.
 *
 * SSH convention: a fresh Ed25519 keypair is minted on first install. The
 * private key never leaves this Host. The public key is what the backend
 * stores. This is NOT DSH authentication and does not verify Token usage
 * (docs/002, docs/043).
 */
export interface LiangxiangIdentityPort {
  /** The stored keypair, minting and persisting one on first use. */
  resolve(): Promise<CommunityKeypair>
}

export interface LiangxiangPersistenceHandle {
  port: LiangPersistencePort
  identity: LiangxiangIdentityPort
  close(): Promise<void>
}

function loadTable<V>(table: DshKvTable, parse: (raw: unknown) => V): Map<string, V> {
  const out = new Map<string, V>()
  for (const [key, raw] of table.entries()) out.set(key, parse(raw))
  return out
}

const MIGRATED_TABLES = ['watermarks', 'daily_usage', 'ledgers', 'aggregates', 'votes'] as const

/**
 * Copy the former storage domain before the new identity is resolved. Writes
 * are idempotent and the identity row lands last, so an interrupted migration
 * is retried on the next start instead of minting a second community identity.
 */
async function migrateLegacyDomain(
  facility: DshStorageDomainFacility,
  target: DshOpenDomain,
  warn: (message: string) => void,
): Promise<void> {
  const targetIdentity = target.table('identity')
  if (targetIdentity.get(IDENTITY_KEY) !== undefined) return

  let legacy: DshOpenDomain | null = null
  try {
    legacy = await facility.open(LEGACY_LIANGBIAO_DOMAIN_SPEC)
    let migrated = 0
    for (const tableName of MIGRATED_TABLES) {
      const from = legacy.table(tableName)
      const to = target.table(tableName)
      for (const [key, value] of from.entries()) {
        await to.put(key, value)
        migrated += 1
      }
    }
    const legacyIdentity = legacy.table('identity').get(IDENTITY_KEY)
    if (legacyIdentity !== undefined) {
      await targetIdentity.put(IDENTITY_KEY, legacyIdentity)
      migrated += 1
    }
    if (migrated > 0) {
      warn(`[dsh-liangxiang] migrated ${migrated} persisted records from the legacy storage domain`)
    }
  } catch (error) {
    warn(
      `[dsh-liangxiang] legacy storage migration unavailable: ${error instanceof Error ? error.message : String(error)}`,
    )
  } finally {
    await legacy?.close()
  }
}

/**
 * Open the liangxiang domain and wrap it as the service's persistence port.
 * @param facility - the DSH storage-domain facility.
 * @param warn - loud sink for write-behind failures.
 * @returns the port plus the close handle (caller owns closing).
 */
export async function openLiangxiangPersistence(
  facility: DshStorageDomainFacility,
  warn: (message: string) => void,
): Promise<LiangxiangPersistenceHandle> {
  const domain: DshOpenDomain = await facility.open(LIANGXIANG_DOMAIN_SPEC)
  await migrateLegacyDomain(facility, domain, warn)
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
        warn(`[dsh-liangxiang] persistence write failed (${label}): ${error instanceof Error ? error.message : String(error)}`)
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
    deleteDailyUsage: (businessDate) => writeBehind('daily_usage-delete', () => dailyUsage.delete(businessDate)),
  }

  const identity: LiangxiangIdentityPort = {
    async resolve(): Promise<CommunityKeypair> {
      const stored = identityTable.get(IDENTITY_KEY)
      if (stored !== undefined) {
        const parsed = identitySchema.parse(stored) as CommunityKeypair | { installationId: string }
        if ('privateKeyPem' in parsed && parsed.privateKeyPem.length > 0) {
          return parsed
        }
      }
      const minted = generateCommunityKeypair()
      await identityTable.put(IDENTITY_KEY, minted)
      return minted
    },
  }

  return { port, identity, close: () => domain.close() }
}
