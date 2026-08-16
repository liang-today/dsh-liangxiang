/**
 * Device-identity recovery (re-key + operator unbind).
 *
 * A device fingerprint is bound to ONE installation. Losing/re-generating a key
 * on the same hardware used to lock the device out forever (`device_conflict`).
 * The recovery paths are:
 *   - self-serve re-key: take over the fingerprint after `rekeyCooldownMs` of
 *     inactivity, forfeiting the old identity (its incense/votes stay on the
 *     dead id, never transferred);
 *   - operator unbind: delete the binding immediately (community-key gated at
 *     the HTTP layer).
 */
import { afterEach, describe, expect, it } from 'vitest'
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
    LIANGBIAO_REKEY_COOLDOWN_MS: '3600000', // 1 hour for the cooldown cases
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
    const f = boot({ LIANGBIAO_REKEY_COOLDOWN_MS: '0' })
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

describe('forfeit is real (old balance never follows the new key)', () => {
  it('leaves the old incense on the orphaned id after a re-key', () => {
    const f = boot()
    bind(f, OLD, PK_OLD, FINGERPRINT)
    f.grantIncense(OLD, 5) // 5 炷 on the old identity (today)
    f.clock.advance(3_600_000) // past the cooldown, still the same business day

    f.service.rekeyIdentity(NEW, PK_NEW, FINGERPRINT, f.clock.now())

    // The new identity starts at zero; the old id's ledger is untouched but
    // unreachable (its identity row is gone).
    const fresh = f.service.dailyState(NEW)
    expect(fresh.authoritative_personal_state.earned_incense).toBe(0)
    expect(f.service.dailyState(OLD).authoritative_personal_state.earned_incense).toBe(5)
  })
})
