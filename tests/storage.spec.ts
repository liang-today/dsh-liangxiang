import { describe, expect, it } from 'vitest'
import type {
  DshDomainSpec,
  DshKvTable,
  DshOpenDomain,
  DshStorageDomainFacility,
} from '../src/compat/dsh/host-services.ts'
import {
  LIANGXIANG_DOMAIN_NAME,
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
        ['watermarks', 'daily_usage', 'ledgers', 'aggregates', 'votes', 'identity']
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

    const handle = await openLiangxiangPersistence(facility, () => undefined)
    const identity = await handle.identity.resolve()
    const persisted = await handle.port.load()

    expect(identity.installationId).toBe('liangxiang-install-01')
    expect(persisted.dailyUsage.get('2026-08-18')?.inputTokens).toBe(50_000)
    expect([...facility.domains.keys()]).toEqual([LIANGXIANG_DOMAIN_NAME])
    await handle.close()
  })
})
