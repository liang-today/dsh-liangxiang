/**
 * Verify community Ed25519 request signatures and bind a device fingerprint.
 *
 * Not DSH authentication. Not Token verification. Just: this Host still holds
 * the private key registered for this installation, and a MAC-hash cannot
 * mint a second key without wiping the first.
 */
import { communityAuthMessage } from '../shared/backend-v1.ts'
import type { V1ErrorCode } from '../shared/backend-v1.ts'
import {
  installationIdFromPublicKey,
  sha256Base64Url,
  verifyCommunitySignature,
} from '../host/community-keys.ts'
import { isUniqueConstraintError, type BackendStore } from './store.ts'

export const DEFAULT_SIGNATURE_SKEW_MS = 90_000

export class CommunityAuthError extends Error {
  readonly httpStatus: number
  readonly code: V1ErrorCode

  constructor(httpStatus: number, code: V1ErrorCode, message: string) {
    super(message)
    this.name = 'CommunityAuthError'
    this.httpStatus = httpStatus
    this.code = code
  }
}

export interface CommunityAuthInput {
  store: BackendStore
  method: string
  path: string
  body: string
  installationId: string
  publicKey: string
  signature: string
  timestamp: string
  deviceFingerprint: string | null
  now: number
  skewMs?: number
}

export function authenticateCommunityRequest(input: CommunityAuthInput): string {
  const derived = installationIdFromPublicKey(input.publicKey)
  if (derived !== input.installationId) {
    throw new CommunityAuthError(401, 'invalid_signature', 'installation id does not match public key')
  }
  const ts = Number(input.timestamp)
  if (!Number.isSafeInteger(ts)) {
    throw new CommunityAuthError(401, 'invalid_signature', 'timestamp is not an integer')
  }
  const skew = input.skewMs ?? DEFAULT_SIGNATURE_SKEW_MS
  if (Math.abs(input.now - ts) > skew) {
    throw new CommunityAuthError(401, 'invalid_signature', 'timestamp outside allowed skew')
  }
  const message = communityAuthMessage({
    method: input.method,
    path: input.path,
    timestamp: input.timestamp,
    bodySha256: sha256Base64Url(input.body),
    installationId: input.installationId,
  })
  if (!verifyCommunitySignature(input.publicKey, message, input.signature)) {
    throw new CommunityAuthError(401, 'invalid_signature', 'signature did not verify')
  }

  const existing = input.store.identityByInstallation(input.installationId)
  if (existing !== undefined && existing.public_key !== input.publicKey) {
    throw new CommunityAuthError(401, 'invalid_signature', 'public key does not match registered identity')
  }
  if (input.deviceFingerprint !== null) {
    const owner = input.store.identityByFingerprint(input.deviceFingerprint)
    if (owner !== undefined && owner.installation_id !== input.installationId) {
      throw new CommunityAuthError(
        409,
        'device_conflict',
        'this device fingerprint is already bound to another installation',
      )
    }
  }
  try {
    input.store.upsertIdentity({
      installation_id: input.installationId,
      public_key: input.publicKey,
      device_fingerprint: existing?.device_fingerprint ?? input.deviceFingerprint,
      created_at: existing?.created_at ?? input.now,
      last_seen_at: input.now,
    })
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new CommunityAuthError(
        409,
        'device_conflict',
        'this device fingerprint is already bound to another installation',
      )
    }
    throw error
  }
  return input.installationId
}
