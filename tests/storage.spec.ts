import { describe, expect, it } from 'vitest'
import type {
  DshDomainSpec,
  DshKvTable,
  DshOpenDomain,
  DshStorageDomainFacility,
} from '../src/compat/dsh/host-services.ts'
import {
  LIANGXIANG_DOMAIN_NAME,
  LIANGXIANG_LOCAL_DOMAIN_NAME,
  openLiangxiangLocalPersistence,
  openLiangxiangPersistence,
} from '../src/compat/dsh/storage.ts'
import { DEFAULT_DAY_END } from '../src/shared/day-end.ts'
import { DEFAULT_INCENSE_WEIGHT_POLICY, parseIncenseWeightPolicy, LEGACY_LIANGZI_POLICY_VERSION, LIANGZI_POLICY_VERSION } from '../src/domain/index.ts'

class MemoryTable implements DshKvTable {
  constructor(readonly values = new Map<string, unknown>()) {}
  get(key: string): unknown { return this.values.get(key) }
  entries(): IterableIterator<[string, unknown]> { return new Map(this.values).entries() }
  put(key: string, value: unknown): Promise<void> {
    this.values.set(key, value)
    return Promise.resolve()
  }
  delete(key: string): Promise<boolean> { return Promise.resolve(this.values.delete(key)) }
}

class MemoryDomain implements DshOpenDomain {
  readonly tables = new Map<string, MemoryTable>()
  constructor(readonly name: string, tableNames: string[]) {
    for (const tableName of tableNames) this.tables.set(tableName, new MemoryTable())
  }
  table(name: string): MemoryTable {
    const table = this.tables.get(name)
    if (table === undefined) throw new Error(`missing table ${name}`)
    return table
  }
  close(): Promise<void> { return Promise.resolve() }
}

class MemoryFacility implements DshStorageDomainFacility {
  readonly domains = new Map<string, MemoryDomain>()
  readonly specs = new Map<string, DshDomainSpec>()
  open(spec: DshDomainSpec): Promise<DshOpenDomain> {
    this.specs.set(spec.name, spec)
    let domain = this.domains.get(spec.name)
    if (domain === undefined) {
      domain = new MemoryDomain(spec.name, Object.keys(spec.tables))
      this.domains.set(spec.name, domain)
    }
    return Promise.resolve(domain)
  }
}

describe('liangxiang storage', () => {
  it('preserves settled cursors and readable legacy rule metadata on reopen', async () => {
    const facility = new MemoryFacility()
    const handle = await openLiangxiangPersistence(facility, () => undefined)
    await handle.settings.setAuthorityPreference('local')
    const policy = parseIncenseWeightPolicy(DEFAULT_INCENSE_WEIGHT_POLICY)
    handle.port.putWeightPolicies?.([policy])
    handle.port.putWatermark('settled-session', { inputHwm: 50_000, outputHwm: 0, settledOffset: 12, baselineOffset: 3, sessionFormat: 4 })
    handle.port.putDailyUsage('2026-10-12', { inputTokens: 50_000, outputTokens: 0, weightCarry: 0, observedAt: 1, weightPolicy: policy })
    await handle.close()
    const reopened = await openLiangxiangPersistence(facility, () => undefined)
    const rows = await reopened.port.load()
    expect(rows.watermarks.get('settled-session')).toMatchObject({ settledOffset: 12, baselineOffset: 3, sessionFormat: 4 })
    expect(rows.dailyUsage.get('2026-10-12')?.weightPolicy).toEqual(policy)
    expect(rows.weightPolicies).toEqual([policy])
    expect(reopened.settings.getAuthorityPreference()).toBe('local')
    const cached = facility.domains.get(LIANGXIANG_DOMAIN_NAME)?.table('settings').get('model_weights') as { authorityPreference: string }
    expect(cached.authorityPreference).toBe('local') // old 1.1.6 settings validator remains satisfied
    const normalized = facility.specs.get(LIANGXIANG_DOMAIN_NAME)?.tables.settings?.valueSchema.parse(cached) as { authorityPreference: string }
    expect(normalized.authorityPreference).toBe('local') // keep it after a real schema-normalized reopen too
    const local = await openLiangxiangLocalPersistence(facility, reopened, () => undefined)
    expect((await local.port.load()).weightPolicies).toEqual([policy])
    await local.close()
    await reopened.close()
  })
  it('persists timed-incense preferences and the exact periodic intent independently from mode', async () => {
    const facility = new MemoryFacility()
    const handle = await openLiangxiangPersistence(facility, () => undefined)
    await handle.settings.setAuthorityPreference('local')
    const dayEnd = { ...DEFAULT_DAY_END, enabled: true, voteType: 'down' as const, jobs: {
      online: { businessDate: '2026-10-19', caseId: 'case-test', requestId: 'durable-test', voteType: 'down' as const, count: 500, done: false, kind: 'periodic' as const },
    }, incense: { online: { businessDate: '2026-10-19', lifetimeUp: 50, lifetimeDown: 8, todayUp: 20, todayDown: 8 } } }
    await handle.settings.setDayEndState(dayEnd)
    await handle.close()
    const reopened = await openLiangxiangPersistence(facility, () => undefined)
    expect(reopened.settings.getDayEndState()).toEqual(dayEnd)
    expect(reopened.settings.getAuthorityPreference()).toBe('local')
    const stored = facility.domains.get(LIANGXIANG_DOMAIN_NAME)?.table('settings').get('day_end')
    const parsed = facility.specs.get(LIANGXIANG_DOMAIN_NAME)?.tables.settings?.valueSchema.parse(stored)
    expect(parsed).toMatchObject({ authorityPreference: 'online', dayEnd })
    await reopened.close()
  })
  it('loads existing identity and accounting records from the canonical domain', async () => {
    const facility = new MemoryFacility()
    const current = await facility.open({
      name: LIANGXIANG_DOMAIN_NAME,
      version: 1,
      tables: Object.fromEntries(
        ['watermarks', 'daily_usage', 'ledgers', 'aggregates', 'votes', 'identity', 'settings']
          .map(name => [name, { valueSchema: { parse: (raw: unknown) => raw } }]),
      ),
    })
    await current.table('daily_usage').put('2026-08-18', {
      inputTokens: 50_000,
      outputTokens: 0,
      weightCarry: 0,
      observedAt: 1,
    })
    await current.table('identity').put('installation', {
      installationId: 'liangxiang-install-01',
      publicKey: 'current-public',
      privateKeyPem: 'current-private',
      deviceFingerprint: 'current-device',
    })
    await current.table('ledgers').put('2026-08-18', { usedIncense: 1 })
    await current.table('aggregates').put('local-2026-08-18-0', {
      upVotes: 1,
      downVotes: 0,
      uniqueVoters: 1,
    })
    // Legacy accepted records had no discriminator/requestedCount; the loader
    // normalizes them without inventing an ambiguous bulk count.
    await current.table('votes').put('legacy-accepted', {
      caseId: 'local-2026-08-18-0',
      voteType: 'up',
      usedIncenseToday: 1,
      remainingIncense: 0,
      acceptedAt: 1,
      spentIncense: 1,
    })
    await current.table('votes').put('durable-rejected', {
      status: 'rejected',
      caseId: 'local-2026-08-18-0',
      voteType: 'down',
      requestedCount: 3,
      reason: 'insufficient_incense',
      message: 'no remaining incense today',
      rejectedAt: 2,
    })
    await current.table('watermarks').put('session-shared', { inputHwm: 40_000, outputHwm: 5_000 })

    const handle = await openLiangxiangPersistence(facility, () => undefined)
    const local = await openLiangxiangLocalPersistence(facility, handle, () => undefined)
    const identity = await handle.identity.resolve()
    const persisted = await handle.port.load()
    const localPersisted = await local.port.load()

    expect(identity.installationId).toBe('liangxiang-install-01')
    expect(persisted.dailyUsage.get('2026-08-18')?.inputTokens).toBe(50_000)
    expect(localPersisted.dailyUsage.get('2026-08-18')?.inputTokens).toBe(50_000)
    expect(localPersisted.ledgers.get('2026-08-18')?.usedIncense).toBe(1)
    expect(localPersisted.aggregates.get('local-2026-08-18-0')?.upVotes).toBe(1)
    expect(localPersisted.votes.get('legacy-accepted')).toEqual({
      status: 'accepted',
      caseId: 'local-2026-08-18-0',
      voteType: 'up',
      usedIncenseToday: 1,
      remainingIncense: 0,
      acceptedAt: 1,
      spentIncense: 1,
    })
    expect(localPersisted.votes.get('durable-rejected')).toEqual({
      status: 'rejected',
      caseId: 'local-2026-08-18-0',
      voteType: 'down',
      requestedCount: 3,
      reason: 'insufficient_incense',
      message: 'no remaining incense today',
      rejectedAt: 2,
    })
    expect(localPersisted.watermarks.get('session-shared')).toEqual({ inputHwm: 40_000, outputHwm: 5_000 })
    local.port.putWatermark('session-shared', { inputHwm: 50_000, outputHwm: 7_000 })
    await Promise.resolve()
    expect((await handle.port.load()).watermarks.get('session-shared')).toEqual({ inputHwm: 50_000, outputHwm: 7_000 })
    // Migration copies local gameplay without deleting the legacy rollback rows.
    expect((await handle.port.load()).ledgers.get('2026-08-18')?.usedIncense).toBe(1)
    expect([...facility.domains.keys()]).toEqual([LIANGXIANG_DOMAIN_NAME, LIANGXIANG_LOCAL_DOMAIN_NAME])
    expect(handle.settings.getAuthorityPreference()).toBeNull()
    await handle.settings.setAuthorityPreference('local')
    expect(handle.settings.getAuthorityPreference()).toBe('local')
    await local.close()
    await handle.close()
  })

  it('rejects a persisted vote receipt whose count is outside the wire contract', async () => {
    const facility = new MemoryFacility()
    const current = await facility.open({
      name: LIANGXIANG_DOMAIN_NAME,
      version: 1,
      tables: Object.fromEntries(
        ['watermarks', 'daily_usage', 'ledgers', 'aggregates', 'votes', 'identity', 'settings']
          .map(name => [name, { valueSchema: { parse: (raw: unknown) => raw } }]),
      ),
    })
    await current.table('votes').put('bad-rejected-count', {
      status: 'rejected',
      caseId: 'local-2026-08-18-0',
      voteType: 'down',
      requestedCount: 501,
      reason: 'insufficient_incense',
      message: 'no remaining incense today',
      rejectedAt: 2,
    })

    const handle = await openLiangxiangPersistence(facility, () => undefined)
    expect(() => handle.port.load()).toThrow(/requestedCount.*\[1,500\]/)
    await handle.close()
  })
})

describe('versioned local Liangzi storage', () => {
  it('normalizes pre-upgrade aggregates and reopens both sealed archive policies without changing their meaning', async () => {
    const facility = new MemoryFacility()
    const shared = await openLiangxiangPersistence(facility, () => undefined)
    const local = await openLiangxiangLocalPersistence(facility, shared, () => undefined)
    const spec = facility.specs.get(LIANGXIANG_LOCAL_DOMAIN_NAME)!
    const aggregate = spec.tables.aggregates!.valueSchema
    expect(aggregate.parse({ upVotes: 0, downVotes: 4, uniqueVoters: 1 })).toMatchObject({ liangziPolicyVersion: LEGACY_LIANGZI_POLICY_VERSION })
    for (const [index, version] of [LEGACY_LIANGZI_POLICY_VERSION, LIANGZI_POLICY_VERSION].entries()) {
      const businessDate = `2026-10-${18 + index}`
      await facility.domains.get(LIANGXIANG_LOCAL_DOMAIN_NAME)!.table('day_archives').put(businessDate, {
        businessDate, caseCount: 1, caseTitles: ['测试梁案'], finalizedAt: 1, archiveVersion: index + 1,
        aggregationPolicyVersion: 'liang-archive-v1-weighted-counts', liangziPolicyVersion: version,
        upVotes: 0, downVotes: 4, uniqueVoters: 1,
      })
    }
    const restored = await local.port.load()
    expect(restored.dayArchives?.get('2026-10-18')).toMatchObject({ liangziState: 'liang_gong', liangziPolicyVersion: LEGACY_LIANGZI_POLICY_VERSION })
    expect(restored.dayArchives?.get('2026-10-19')).toMatchObject({ liangziState: 'xiao_nan_liang', liangziPolicyVersion: LIANGZI_POLICY_VERSION })
    await local.close()
    await shared.close()
  })
})
