import { describe, expect, it } from 'vitest'
import { authenticateCommunityRequest, CommunityAuthError } from '../src/backend/community-auth.ts'
import { openBackendStore } from '../src/backend/store.ts'
import {
  generateCommunityKeypair,
  installationIdFromPublicKey,
  sha256Base64Url,
  signCommunityMessage,
  signRequest,
  verifyCommunitySignature,
} from '../src/host/community-keys.ts'
import { communityAuthMessage } from '../src/shared/backend-v1.ts'

describe('community Ed25519 keys', () => {
  it('round-trips a signature and derives installation id from the public key', () => {
    const keys = generateCommunityKeypair(null)
    expect(keys.installationId).toBe(installationIdFromPublicKey(keys.publicKey))
    const message = 'liangbiao-test'
    const signature = signCommunityMessage(keys.privateKeyPem, message)
    expect(verifyCommunitySignature(keys.publicKey, message, signature)).toBe(true)
    expect(verifyCommunitySignature(keys.publicKey, 'tampered', signature)).toBe(false)
  })

  it('does not derive the private key from a MAC hash (MAC is not secret)', () => {
    const a = generateCommunityKeypair('same-fingerprint')
    const b = generateCommunityKeypair('same-fingerprint')
    expect(a.publicKey).not.toBe(b.publicKey)
    expect(a.deviceFingerprint).toBe('same-fingerprint')
  })
})

describe('authenticateCommunityRequest', () => {
  it('registers the first key and rejects a second key on the same fingerprint', () => {
    const store = openBackendStore(':memory:')
    const first = generateCommunityKeypair('mac-hash-1')
    const now = 1_776_297_600_000
    const body = ''
    const message = communityAuthMessage({
      method: 'GET',
      path: '/v1/bootstrap',
      timestamp: String(now),
      bodySha256: sha256Base64Url(body),
      installationId: first.installationId,
    })
    authenticateCommunityRequest({
      store,
      method: 'GET',
      path: '/v1/bootstrap',
      body,
      installationId: first.installationId,
      publicKey: first.publicKey,
      signature: signCommunityMessage(first.privateKeyPem, message),
      timestamp: String(now),
      deviceFingerprint: first.deviceFingerprint,
      now,
    })
    expect(store.identityByFingerprint('mac-hash-1')?.installation_id).toBe(first.installationId)

    const second = generateCommunityKeypair('mac-hash-1')
    const secondMessage = communityAuthMessage({
      method: 'GET',
      path: '/v1/bootstrap',
      timestamp: String(now),
      bodySha256: sha256Base64Url(body),
      installationId: second.installationId,
    })
    expect(() => authenticateCommunityRequest({
      store,
      method: 'GET',
      path: '/v1/bootstrap',
      body,
      installationId: second.installationId,
      publicKey: second.publicKey,
      signature: signCommunityMessage(second.privateKeyPem, secondMessage),
      timestamp: String(now),
      deviceFingerprint: second.deviceFingerprint,
      now,
    })).toThrow(CommunityAuthError)
    store.close()
  })

  it('skipFingerprintEnforcement authenticates a re-key without the conflict and without upserting', () => {
    const store = openBackendStore(':memory:')
    const first = generateCommunityKeypair('mac-hash-rekey')
    const now = 1_776_297_600_000
    const body = ''
    const firstMessage = communityAuthMessage({
      method: 'POST',
      path: '/v1/identity/rekey',
      timestamp: String(now),
      bodySha256: sha256Base64Url(body),
      installationId: first.installationId,
    })
    authenticateCommunityRequest({
      store,
      method: 'POST',
      path: '/v1/identity/rekey',
      body,
      installationId: first.installationId,
      publicKey: first.publicKey,
      signature: signCommunityMessage(first.privateKeyPem, firstMessage),
      timestamp: String(now),
      deviceFingerprint: first.deviceFingerprint,
      now,
    })

    const second = generateCommunityKeypair('mac-hash-rekey')
    const secondMessage = communityAuthMessage({
      method: 'POST',
      path: '/v1/identity/rekey',
      timestamp: String(now),
      bodySha256: sha256Base64Url(body),
      installationId: second.installationId,
    })
    const result = authenticateCommunityRequest({
      store,
      method: 'POST',
      path: '/v1/identity/rekey',
      body,
      installationId: second.installationId,
      publicKey: second.publicKey,
      signature: signCommunityMessage(second.privateKeyPem, secondMessage),
      timestamp: String(now),
      deviceFingerprint: second.deviceFingerprint,
      now,
      skipFingerprintEnforcement: true,
    })
    expect(result).toBe(second.installationId)
    // No auto-upsert: the fingerprint still belongs to the first key; the
    // re-key handler owns the rebind.
    expect(store.identityByFingerprint('mac-hash-rekey')?.installation_id).toBe(first.installationId)
    store.close()
  })

  it('rejects a timestamp outside skew', () => {
    const store = openBackendStore(':memory:')
    const keys = generateCommunityKeypair(null)
    const now = 1_776_297_600_000
    expect(() => authenticateCommunityRequest({
      store,
      method: 'GET',
      path: '/v1/bootstrap',
      body: '',
      installationId: keys.installationId,
      publicKey: keys.publicKey,
      signature: signRequest({
        privateKeyPem: keys.privateKeyPem,
        method: 'GET',
        path: '/v1/bootstrap',
        timestamp: now,
        body: '',
        installationId: keys.installationId,
      }),
      timestamp: String(now),
      deviceFingerprint: null,
      now: now + 120_000,
    })).toThrow(/timestamp outside allowed skew/)
    store.close()
  })
})
