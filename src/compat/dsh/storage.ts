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
  LiangDayArchive,
  LiangMonthArchive,
  LiangWeekArchive,
} from '../../domain/index.ts'
import {
  deriveArchiveResult,
  isBusinessDate,
  isoWeekFor,
  LIANG_ARCHIVE_AGGREGATION_POLICY_VERSION,
  monthFor,
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
import { LIANGZI_POLICY_VERSION } from '../../shared/backend-v1.ts'
import type { HostAuthorityPreference } from '../../shared/wire.ts'
import type { DshKvTable, DshOpenDomain, DshStorageDomainFacility, DshValueSchema } from './host-services.ts'

export const LIANGXIANG_DOMAIN_NAME = 'liangxiang'
export const LIANGXIANG_LOCAL_DOMAIN_NAME = 'liangxiang_local'
export const LIANGXIANG_DOMAIN_VERSION = 1


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

function requireStringField(record: Record<string, unknown>, field: string): string {
  const value = record[field]
  if (typeof value !== 'string' || value.length === 0) {
    throw new RecordShapeError(`field ${field} must be a non-empty string`)
  }
  return value
}

function requireDateField(record: Record<string, unknown>, field: string): string {
  const value = requireStringField(record, field)
  if (!isBusinessDate(value)) throw new RecordShapeError(`field ${field} must be a real YYYY-MM-DD date`)
  return value
}

function requireTimestampField(record: Record<string, unknown>, field: string): number {
  const value = record[field]
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RecordShapeError(`field ${field} must be a non-negative timestamp`)
  }
  return value
}

function requireArchivePolicy(record: Record<string, unknown>): {
  aggregationPolicyVersion: string
  liangziPolicyVersion: string
} {
  const aggregationPolicyVersion = requireStringField(record, 'aggregationPolicyVersion')
  const liangziPolicyVersion = requireStringField(record, 'liangziPolicyVersion')
  if (aggregationPolicyVersion !== LIANG_ARCHIVE_AGGREGATION_POLICY_VERSION) {
    throw new RecordShapeError(`unsupported aggregationPolicyVersion ${aggregationPolicyVersion}`)
  }
  if (liangziPolicyVersion !== LIANGZI_POLICY_VERSION) {
    throw new RecordShapeError(`unsupported liangziPolicyVersion ${liangziPolicyVersion}`)
  }
  return { aggregationPolicyVersion, liangziPolicyVersion }
}

const caseIndexSchema: DshValueSchema = {
  parse(raw: unknown): { caseIndex: number } {
    const record = asStoredRecord(raw)
    return { caseIndex: requireCountField(record, 'caseIndex') }
  },
}

const dayArchiveSchema: DshValueSchema = {
  parse(raw: unknown): LiangDayArchive {
    const record = asStoredRecord(raw)
    const caseCount = requireCountField(record, 'caseCount')
    const titles = record.caseTitles
    if (!Array.isArray(titles) || titles.some(title => typeof title !== 'string' || title.length === 0)) {
      throw new RecordShapeError('field caseTitles must be an array of non-empty strings')
    }
    if (caseCount === 0 || titles.length !== caseCount) {
      throw new RecordShapeError('caseCount must be positive and match caseTitles length')
    }
    return {
      businessDate: requireDateField(record, 'businessDate'),
      caseCount,
      caseTitles: [...titles] as string[],
      finalizedAt: requireTimestampField(record, 'finalizedAt'),
      archiveVersion: requireCountField(record, 'archiveVersion'),
      ...requireArchivePolicy(record),
      ...deriveArchiveResult(
        requireCountField(record, 'upVotes'),
        requireCountField(record, 'downVotes'),
      ),
    }
  },
}

const weekArchiveSchema: DshValueSchema = {
  parse(raw: unknown): LiangWeekArchive {
    const record = asStoredRecord(raw)
    const startDate = requireDateField(record, 'startDate')
    const expected = isoWeekFor(startDate)
    const weekId = requireStringField(record, 'weekId')
    const endDate = requireDateField(record, 'endDate')
    if (weekId !== expected.weekId || endDate !== expected.endDate) {
      throw new RecordShapeError('week archive id/bounds are inconsistent')
    }
    return {
      weekId,
      startDate,
      endDate,
      coveredDays: requireCountField(record, 'coveredDays'),
      finalizedAt: requireTimestampField(record, 'finalizedAt'),
      archiveVersion: requireCountField(record, 'archiveVersion'),
      ...requireArchivePolicy(record),
      ...deriveArchiveResult(
        requireCountField(record, 'upVotes'),
        requireCountField(record, 'downVotes'),
      ),
    }
  },
}

const monthArchiveSchema: DshValueSchema = {
  parse(raw: unknown): LiangMonthArchive {
    const record = asStoredRecord(raw)
    const startDate = requireDateField(record, 'startDate')
    const expected = monthFor(startDate)
    const monthId = requireStringField(record, 'monthId')
    const endDate = requireDateField(record, 'endDate')
    if (monthId !== expected.monthId || endDate !== expected.endDate) {
      throw new RecordShapeError('month archive id/bounds are inconsistent')
    }
    return {
      monthId,
      startDate,
      endDate,
      coveredDays: requireCountField(record, 'coveredDays'),
      finalizedAt: requireTimestampField(record, 'finalizedAt'),
      archiveVersion: requireCountField(record, 'archiveVersion'),
      ...requireArchivePolicy(record),
      ...deriveArchiveResult(
        requireCountField(record, 'upVotes'),
        requireCountField(record, 'downVotes'),
      ),
    }
  },
}

const settingsSchema: DshValueSchema = {
  parse(raw: unknown): { authorityPreference: HostAuthorityPreference } {
    const record = asStoredRecord(raw)
    const preference = record.authorityPreference
    if (preference !== 'online' && preference !== 'local') {
      throw new RecordShapeError('authorityPreference must be online/local')
    }
    return { authorityPreference: preference }
  },
}

const migrationSchema: DshValueSchema = {
  parse(raw: unknown): { completedAt: number } {
    return { completedAt: requireTimestampField(asStoredRecord(raw), 'completedAt') }
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

const LIANGXIANG_DOMAIN_SPEC = {
  name: LIANGXIANG_DOMAIN_NAME,
  version: LIANGXIANG_DOMAIN_VERSION,
  tables: {
    watermarks: { valueSchema: watermarkSchema },
    daily_usage: { valueSchema: dailyUsageSchema },
    // v0.8.1 and older mixed local gameplay into this domain. These tables
    // remain declared only so v0.8.2 can copy them safely. Legacy rows stay as
    // a non-destructive rollback copy and are no longer used for local play.
    ledgers: { valueSchema: ledgerSchema },
    aggregates: { valueSchema: aggregateSchema },
    votes: { valueSchema: voteSchema },
    identity: { valueSchema: identitySchema },
    settings: { valueSchema: settingsSchema },
  },
} as const

const LIANGXIANG_LOCAL_DOMAIN_SPEC = {
  name: LIANGXIANG_LOCAL_DOMAIN_NAME,
  version: LIANGXIANG_DOMAIN_VERSION,
  tables: {
    daily_usage: { valueSchema: dailyUsageSchema },
    ledgers: { valueSchema: ledgerSchema },
    aggregates: { valueSchema: aggregateSchema },
    votes: { valueSchema: voteSchema },
    case_indexes: { valueSchema: caseIndexSchema },
    day_archives: { valueSchema: dayArchiveSchema },
    week_archives: { valueSchema: weekArchiveSchema },
    month_archives: { valueSchema: monthArchiveSchema },
    migrations: { valueSchema: migrationSchema },
  },
} as const

/** Single row key of the identity table. */
const IDENTITY_KEY = 'installation'
const SETTINGS_KEY = 'host'
const LEGACY_SPLIT_MIGRATION_KEY = 'legacy-split-v1'

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

export type LiangxiangCorePersistedState = Pick<
  LiangPersistedState,
  'watermarks' | 'dailyUsage' | 'ledgers' | 'aggregates' | 'votes'
>

/** Community/core storage: shared observation HWM plus online claim projection. */
export interface LiangxiangCorePersistencePort {
  load(): Promise<LiangxiangCorePersistedState>
  putWatermark(sessionId: string, watermark: SessionUsageWatermark): void
  putDailyUsage(businessDate: string, record: DailyUsageRecord): void
  deleteDailyUsage(businessDate: string): void
}

export interface LiangxiangSettingsPort {
  getAuthorityPreference(): HostAuthorityPreference | null
  setAuthorityPreference(preference: HostAuthorityPreference): Promise<void>
}

export interface LiangxiangPersistenceHandle {
  port: LiangxiangCorePersistencePort
  identity: LiangxiangIdentityPort
  settings: LiangxiangSettingsPort
  close(): Promise<void>
}

export interface LiangxiangLocalPersistenceHandle {
  port: LiangPersistencePort
  close(): Promise<void>
}

function loadTable<V>(table: DshKvTable, parse: (raw: unknown) => V): Map<string, V> {
  const out = new Map<string, V>()
  for (const [key, raw] of table.entries()) out.set(key, parse(raw))
  return out
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
  const watermarks = domain.table('watermarks')
  const dailyUsage = domain.table('daily_usage')
  const ledgers = domain.table('ledgers')
  const aggregates = domain.table('aggregates')
  const votes = domain.table('votes')
  const identityTable = domain.table('identity')
  const settingsTable = domain.table('settings')

  const writeBehind = (label: string, write: () => Promise<unknown>): void => {
    write().then(
      () => undefined,
      (error: unknown) => {
        warn(`[dsh-liangxiang] persistence write failed (${label}): ${error instanceof Error ? error.message : String(error)}`)
      },
    )
  }

  const port: LiangxiangCorePersistencePort = {
    load(): Promise<LiangxiangCorePersistedState> {
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

  const settings: LiangxiangSettingsPort = {
    getAuthorityPreference(): HostAuthorityPreference | null {
      const stored = settingsTable.get(SETTINGS_KEY)
      if (stored === undefined) return null
      return (settingsSchema.parse(stored) as { authorityPreference: HostAuthorityPreference }).authorityPreference
    },
    async setAuthorityPreference(preference: HostAuthorityPreference): Promise<void> {
      await settingsTable.put(SETTINGS_KEY, { authorityPreference: preference })
    },
  }

  return { port, identity, settings, close: () => domain.close() }
}

function legacyGameplayDates(state: LiangxiangCorePersistedState): Set<string> {
  const dates = new Set(state.ledgers.keys())
  const collect = (caseId: string): void => {
    const match = /^local-(\d{4}-\d{2}-\d{2})-\d+$/.exec(caseId)
    if (match?.[1] !== undefined) dates.add(match[1])
  }
  for (const caseId of state.aggregates.keys()) collect(caseId)
  for (const vote of state.votes.values()) collect(vote.caseId)
  return dates
}

/**
 * Open the physically separate local-game domain.
 *
 * Session HWMs remain in the core domain and are shared by both authorities;
 * only the active authority receives each newly observed delta. This prevents
 * a manual mode change from replaying one cumulative DSH session into a second
 * incense pool, while every balance/vote/case/archive row stays local-only.
 */
export async function openLiangxiangLocalPersistence(
  facility: DshStorageDomainFacility,
  core: LiangxiangPersistenceHandle,
  warn: (message: string) => void,
): Promise<LiangxiangLocalPersistenceHandle> {
  const domain: DshOpenDomain = await facility.open(LIANGXIANG_LOCAL_DOMAIN_SPEC)
  const dailyUsage = domain.table('daily_usage')
  const ledgers = domain.table('ledgers')
  const aggregates = domain.table('aggregates')
  const votes = domain.table('votes')
  const caseIndexes = domain.table('case_indexes')
  const dayArchives = domain.table('day_archives')
  const weekArchives = domain.table('week_archives')
  const monthArchives = domain.table('month_archives')
  const migrations = domain.table('migrations')
  const pendingWrites = new Set<Promise<unknown>>()

  const writeBehind = (label: string, write: () => Promise<unknown>): void => {
    const pending = write()
    pendingWrites.add(pending)
    pending.then(
      () => undefined,
      (error: unknown) => {
        warn(`[dsh-liangxiang] local persistence write failed (${label}): ${error instanceof Error ? error.message : String(error)}`)
      },
    ).finally(() => pendingWrites.delete(pending))
  }

  // One-time non-destructive split of pre-v0.8.2 local gameplay. Local rows
  // win if a retry resumes after partial progress; legacy rows remain as a
  // rollback copy and are never consulted after this migration completes.
  const legacy = await core.port.load()
  if (migrations.get(LEGACY_SPLIT_MIGRATION_KEY) === undefined) {
    for (const [date, record] of legacy.ledgers) {
      if (ledgers.get(date) === undefined) await ledgers.put(date, record)
    }
    for (const [caseId, aggregate] of legacy.aggregates) {
      if (aggregates.get(caseId) === undefined) await aggregates.put(caseId, aggregate)
    }
    for (const [requestId, vote] of legacy.votes) {
      if (votes.get(requestId) === undefined) await votes.put(requestId, vote)
    }
    for (const date of legacyGameplayDates(legacy)) {
      const record = legacy.dailyUsage.get(date)
      if (record !== undefined && dailyUsage.get(date) === undefined) await dailyUsage.put(date, record)
    }
    await migrations.put(LEGACY_SPLIT_MIGRATION_KEY, { completedAt: Date.now() })
  }

  const port: LiangPersistencePort = {
    async load(): Promise<LiangPersistedState> {
      const shared = await core.port.load()
      return {
        watermarks: shared.watermarks,
        dailyUsage: loadTable(dailyUsage, raw => dailyUsageSchema.parse(raw) as DailyUsageRecord),
        ledgers: loadTable(ledgers, raw => ledgerSchema.parse(raw) as { usedIncense: number }),
        aggregates: loadTable(aggregates, raw => aggregateSchema.parse(raw) as GlobalVoteAggregate),
        votes: loadTable(votes, raw => voteSchema.parse(raw) as PersistedVoteRecord),
        caseIndexes: loadTable(caseIndexes, raw => caseIndexSchema.parse(raw) as { caseIndex: number }),
        dayArchives: loadTable(dayArchives, raw => dayArchiveSchema.parse(raw) as LiangDayArchive),
        weekArchives: loadTable(weekArchives, raw => weekArchiveSchema.parse(raw) as LiangWeekArchive),
        monthArchives: loadTable(monthArchives, raw => monthArchiveSchema.parse(raw) as LiangMonthArchive),
      }
    },
    async flush(): Promise<void> {
      while (pendingWrites.size > 0) await Promise.allSettled(pendingWrites)
    },
    putWatermark: (sessionId, watermark) => core.port.putWatermark(sessionId, watermark),
    putDailyUsage: (businessDate, record) => writeBehind('daily_usage', () => dailyUsage.put(businessDate, record)),
    putLedger: (businessDate, record) => writeBehind('ledger', () => ledgers.put(businessDate, record)),
    putAggregate: (caseId, aggregate) => writeBehind('aggregate', () => aggregates.put(caseId, aggregate)),
    putVote: (requestId, record) => writeBehind('vote', () => votes.put(requestId, record)),
    putCaseIndex: (businessDate, record) => writeBehind('case_index', () => caseIndexes.put(businessDate, record)),
    putDayArchive: (businessDate, archive) => writeBehind('day_archive', () => dayArchives.put(businessDate, archive)),
    putWeekArchive: (weekId, archive) => writeBehind('week_archive', () => weekArchives.put(weekId, archive)),
    putMonthArchive: (monthId, archive) => writeBehind('month_archive', () => monthArchives.put(monthId, archive)),
    deleteVote: requestId => writeBehind('vote-delete', () => votes.delete(requestId)),
    deleteDailyUsage: businessDate => writeBehind('daily_usage-delete', () => dailyUsage.delete(businessDate)),
  }

  return { port, close: () => domain.close() }
}
