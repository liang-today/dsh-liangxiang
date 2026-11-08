/**
 * Device-identity recovery (re-key + operator unbind).
 *
 * A device fingerprint is bound to ONE installation. Losing/re-generating a key
 * on the same hardware used to lock the device out forever (`device_conflict`).
 * The recovery paths are:
 *   - self-serve re-key: take over an EMPTY wallet's fingerprint after
 *     `rekeyCooldownMs`; an identity with assets must recover its original key;
 *   - operator unbind: delete the binding immediately through the VPS-local
 *     CLI; no operator HTTP route is exposed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openBackendStore } from '../src/backend/store.ts'
import { LiangxiangBackendService } from '../src/backend/service.ts'
import { resolveBackendConfig } from '../src/backend/config.ts'
import { createMutableClock, FIXED_NOW } from './helpers/backend.ts'
import { CommunityAuthError } from '../src/backend/community-auth.ts'
import { createBackendFixture, type BackendFixture } from './helpers/backend.ts'

const OLD = 'install-old-000001'
const NEW = 'install-new-000002'
const FINGERPRINT = 'fp-0123456789abcdef'
const PK_OLD = 'old-public-key-00000000000000000000000000'
const PK_NEW = 'new-public-key-00000000000000000000000000'

let fixture: BackendFixture | null = null

function boot(env: Record<string, string | undefined> = {}): BackendFixture {
  fixture?.close()
  fixture = createBackendFixture({
    LIANGXIANG_REKEY_COOLDOWN_MS: '3600000', // 1 hour for the cooldown cases
    ...env,
  })
  return fixture
}

function bind(f: BackendFixture, installationId: string, publicKey: string, fingerprint: string): void {
  f.store.upsertIdentity({
    installation_id: installationId,
    public_key: publicKey,
    device_fingerprint: fingerprint,
    created_at: f.clock.now(),
    last_seen_at: f.clock.now(),
  })
}

afterEach(() => {
  fixture?.close()
  fixture = null
})

describe('re-key (self-serve recovery)', () => {
  it('rebinds the fingerprint after the cooldown and forfeits the old identity', () => {
    const f = boot()
    bind(f, OLD, PK_OLD, FINGERPRINT)
    f.clock.advance(3_600_000)

    const response = f.service.rekeyIdentity(NEW, PK_NEW, FINGERPRINT, f.clock.now())

    expect(response.rekeyed).toBe(true)
    expect(response.previous_installation_id).toBe(OLD)
    expect(f.store.identityByFingerprint(FINGERPRINT)?.installation_id).toBe(NEW)
    // The old identity is gone — its key can no longer authenticate, so its
    // balance is forfeited (never transferred).
    expect(f.store.identityByInstallation(OLD)).toBeUndefined()
    expect(f.store.identityByInstallation(NEW)?.public_key).toBe(PK_NEW)
  })

  it('rejects a re-key before the cooldown has elapsed', () => {
    const f = boot()
    bind(f, OLD, PK_OLD, FINGERPRINT)
    f.clock.advance(30_000) // 30s << 1h

    let caught: unknown
    try {
      f.service.rekeyIdentity(NEW, PK_NEW, FINGERPRINT, f.clock.now())
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(CommunityAuthError)
    expect((caught as CommunityAuthError).code).toBe('rekey_cooldown')
    // Nothing moved: the old identity still owns the fingerprint.
    expect(f.store.identityByFingerprint(FINGERPRINT)?.installation_id).toBe(OLD)
    expect(f.store.identityByInstallation(NEW)).toBeUndefined()
  })

  it('registers a brand-new binding when nothing owns the fingerprint yet', () => {
    const f = boot()
    const response = f.service.rekeyIdentity(NEW, PK_NEW, FINGERPRINT, f.clock.now())

    expect(response.rekeyed).toBe(false)
    expect(response.previous_installation_id).toBeNull()
    expect(f.store.identityByFingerprint(FINGERPRINT)?.installation_id).toBe(NEW)
  })

  it('is a no-op when the fingerprint is already bound to the same key', () => {
    const f = boot()
    bind(f, OLD, PK_OLD, FINGERPRINT)
    const response = f.service.rekeyIdentity(OLD, PK_OLD, FINGERPRINT, f.clock.now())

    expect(response.rekeyed).toBe(false)
    expect(f.store.identityByFingerprint(FINGERPRINT)?.installation_id).toBe(OLD)
  })

  it('re-keys immediately when the cooldown is disabled (tests/operator config)', () => {
    const f = boot({ LIANGXIANG_REKEY_COOLDOWN_MS: '0' })
    bind(f, OLD, PK_OLD, FINGERPRINT)

    const response = f.service.rekeyIdentity(NEW, PK_NEW, FINGERPRINT, f.clock.now())

    expect(response.rekeyed).toBe(true)
    expect(f.store.identityByFingerprint(FINGERPRINT)?.installation_id).toBe(NEW)
  })

  it('requires a non-empty device fingerprint', () => {
    const f = boot()
    let caught: unknown
    try {
      f.service.rekeyIdentity(NEW, PK_NEW, '', f.clock.now())
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(CommunityAuthError)
    expect((caught as CommunityAuthError).code).toBe('invalid_request')
  })
})

describe('operator unbind', () => {
  it('deletes the binding so the device can re-register', () => {
    const f = boot()
    bind(f, OLD, PK_OLD, FINGERPRINT)

    const response = f.service.unbindIdentity(OLD, f.clock.now())

    expect(response.unbound).toBe(true)
    expect(f.store.identityByInstallation(OLD)).toBeUndefined()
    expect(f.store.identityByFingerprint(FINGERPRINT)).toBeUndefined()
  })

  it('reports unbound=false when the installation was not bound', () => {
    const f = boot()
    const response = f.service.unbindIdentity(OLD, f.clock.now())
    expect(response.unbound).toBe(false)
  })
})

describe('asset-preserving recovery', () => {
  it('rejects a re-key or unbind that would orphan the old cumulative wallet', () => {
    const f = boot()
    bind(f, OLD, PK_OLD, FINGERPRINT)
    f.grantIncense(OLD, 5) // 5 炷 on the old identity (today)
    f.clock.advance(3_600_000) // past the cooldown, still the same business day

    expect(() => f.service.rekeyIdentity(NEW, PK_NEW, FINGERPRINT, f.clock.now()))
      .toThrow(expect.objectContaining({ code: 'wallet_has_assets' }))
    expect(() => f.service.unbindIdentity(OLD)).toThrow(expect.objectContaining({ code: 'wallet_has_assets' }))
    expect(f.store.identityByInstallation(OLD)?.public_key).toBe(PK_OLD)
    expect(f.store.identityByInstallation(NEW)).toBeUndefined()
    expect(f.store.identityByFingerprint(FINGERPRINT)?.installation_id).toBe(OLD)
    expect(f.service.dailyState(OLD).authoritative_personal_state.remaining_incense).toBe(15)
  })

  it.each(['unbind', 'revoke', 'rekey'] as const)('rechecks funds after acquiring the %s transaction lock', (operation) => {
    const f = boot({ LIANGXIANG_STARTER_INCENSE: '0', LIANGXIANG_REKEY_COOLDOWN_MS: '0' })
    bind(f, OLD, PK_OLD, FINGERPRINT)
    f.service.dailyState(OLD)
    const original = f.store.transaction
    let injected = false
    // Model a committed writer winning the lock immediately before this
    // operation begins. Old code checked 0 first, then deleted the funded key.
    f.store.transaction = <T>(body: () => T): T => {
      if (!injected) {
        injected = true
        f.store.database.prepare('UPDATE incense_wallet SET available=1,version=version+1 WHERE installation_id=?').run(OLD)
      }
      return original(body)
    }
    try {
      const invoke = () => operation === 'rekey' ? f.service.rekeyIdentity(NEW, PK_NEW, FINGERPRINT)
        : operation === 'revoke' ? f.service.revokeIdentity(OLD) : f.service.unbindIdentity(OLD)
      expect(invoke).toThrow(expect.objectContaining({ code: 'wallet_has_assets' }))
      expect(injected).toBe(true)
      expect(f.store.identityByInstallation(OLD)?.public_key).toBe(PK_OLD)
      expect(f.store.identityByInstallation(NEW)).toBeUndefined()
      expect(f.store.database.prepare('SELECT available FROM incense_wallet WHERE installation_id=?').get(OLD))
        .toMatchObject({ available: 1 })
    } finally { f.store.transaction = original }
  })

  it.each(['unbind', 'rekey'] as const)('holds the SQLite write lock between wallet inspection and %s deletion', (operation) => {
    const directory = mkdtempSync(join(tmpdir(), 'liangxiang-recovery-lock-'))
    const databasePath = join(directory, 'wallet.sqlite')
    const store = openBackendStore(databasePath)
    const contender = openBackendStore(databasePath)
    const clock = createMutableClock(FIXED_NOW)
    const config = resolveBackendConfig({ LIANGXIANG_BACKEND_DB: databasePath,
      LIANGXIANG_STARTER_INCENSE: '0', LIANGXIANG_REKEY_COOLDOWN_MS: '0', LIANGXIANG_ADMISSION_INVENTORY_TARGET: '0' })
    try {
      const service = new LiangxiangBackendService({ store, config, clock, warn: () => undefined })
      store.upsertIdentity({ installation_id: OLD, public_key: PK_OLD, device_fingerprint: FINGERPRINT,
        created_at: clock.now(), last_seen_at: clock.now() })
      service.dailyState(OLD)
      contender.database.exec('PRAGMA busy_timeout=0')
      const originalDelete = store.deleteIdentity
      let writerBlocked = false
      const deletion = vi.spyOn(store, 'deleteIdentity').mockImplementation((id) => {
        try {
          contender.database.prepare('UPDATE incense_wallet SET available=available+1 WHERE installation_id=?').run(OLD)
        } catch (error) {
          writerBlocked = /locked|busy/i.test(error instanceof Error ? error.message : String(error))
        }
        return originalDelete(id)
      })
      if (operation === 'rekey') expect(service.rekeyIdentity(NEW, PK_NEW, FINGERPRINT).rekeyed).toBe(true)
      else expect(service.unbindIdentity(OLD).unbound).toBe(true)
      expect(deletion).toHaveBeenCalledOnce()
      expect(writerBlocked).toBe(true)
      expect(store.database.prepare('SELECT available FROM incense_wallet WHERE installation_id=?').get(OLD))
        .toMatchObject({ available: 0 })
      deletion.mockRestore()
    } finally {
      contender.close(); store.close(); rmSync(directory, { recursive: true, force: true })
    }
  })

  it('loads the latest cooldown timestamp only after obtaining the recovery lock', () => {
    const f = boot({ LIANGXIANG_STARTER_INCENSE: '0' })
    bind(f, OLD, PK_OLD, FINGERPRINT)
    f.service.dailyState(OLD)
    f.clock.advance(3_600_000)
    const original = f.store.transaction
    let injected = false
    f.store.transaction = <T>(body: () => T): T => {
      if (!injected) {
        injected = true
        f.store.database.prepare('UPDATE community_identity SET last_seen_at=? WHERE installation_id=?')
          .run(f.clock.now(), OLD)
      }
      return original(body)
    }
    try {
      expect(() => f.service.rekeyIdentity(NEW, PK_NEW, FINGERPRINT))
        .toThrow(expect.objectContaining({ code: 'rekey_cooldown' }))
      expect(f.store.identityByFingerprint(FINGERPRINT)?.installation_id).toBe(OLD)
    } finally { f.store.transaction = original }
  })
})
