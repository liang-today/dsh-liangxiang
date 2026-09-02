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
  open(spec: DshDomainSpec): Promise<DshOpenDomain> {
    let domain = this.domains.get(spec.name)
    if (domain === undefined) {
      domain = new MemoryDomain(spec.name, Object.keys(spec.tables))
      this.domains.set(spec.name, domain)
    }
    return Promise.resolve(domain)
  }
}

describe('liangxiang storage', () => {
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
