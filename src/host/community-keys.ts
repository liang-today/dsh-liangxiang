/**
 * Community installation identity (Node only).
 *
 * SSH convention: the private key never leaves this Host. The backend stores
 * the public key. This proves "same installer" across requests; it does NOT
 * verify DSH Token usage (A3 still holds).
 *
 * Device fingerprint: SHA-256 of sorted non-internal MAC addresses. It raises
 * the cost of casual reinstalls on one machine. MACs are spoofable — this is
 * not anti-witchcraft, and we never send raw MACs off-box.
 */
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto'
import { networkInterfaces } from 'node:os'
import { communityAuthMessage } from '../shared/backend-v1.ts'

/** SPKI prefix for a 32-byte Ed25519 public key (RFC 8410). */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

export interface CommunityKeypair {
  installationId: string
  publicKey: string
  privateKeyPem: string
  deviceFingerprint: string | null
}

export function generateCommunityKeypair(deviceFingerprint = readDeviceFingerprint()): CommunityKeypair {
  const pair = generateKeyPairSync('ed25519')
  const publicKey = rawPublicKey(pair.publicKey).toString('base64url')
  return {
    installationId: installationIdFromPublicKey(publicKey),
    publicKey,
    privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    deviceFingerprint,
  }
}

export function installationIdFromPublicKey(publicKey: string): string {
  return `lk_${publicKey}`
}

export function rawPublicKey(key: KeyObject): Buffer {
  const der = key.export({ type: 'spki', format: 'der' })
  return der.subarray(der.length - 32)
}

export function publicKeyFromRaw(publicKey: string): KeyObject {
  const raw = Buffer.from(publicKey, 'base64url')
  if (raw.length !== 32) throw new Error('ed25519 public key must be 32 bytes')
  return createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, raw]), format: 'der', type: 'spki' })
}

export function signCommunityMessage(privateKeyPem: string, message: string): string {
  const key = createPrivateKey(privateKeyPem)
  return sign(null, Buffer.from(message, 'utf8'), key).toString('base64url')
}

export function verifyCommunitySignature(publicKey: string, message: string, signature: string): boolean {
  try {
    const key = publicKeyFromRaw(publicKey)
    return verify(null, Buffer.from(message, 'utf8'), key, Buffer.from(signature, 'base64url'))
  } catch {
    return false
  }
}

export function sha256Base64Url(payload: string): string {
  return createHash('sha256').update(payload, 'utf8').digest('base64url')
}

export function signRequest(input: {
  privateKeyPem: string
  method: string
  path: string
  timestamp: number
  body: string
  installationId: string
}): string {
  return signCommunityMessage(input.privateKeyPem, communityAuthMessage({
    method: input.method,
    path: input.path,
    timestamp: String(input.timestamp),
    bodySha256: sha256Base64Url(input.body),
    installationId: input.installationId,
  }))
}

/**
 * Stable fingerprint of this machine's non-internal MACs. Returns null when
 * the runtime has none (some VMs / containers) — those installs skip the
 * one-device binding rather than being locked out.
 */
export function readDeviceFingerprint(): string | null {
  const macs = new Set<string>()
  for (const list of Object.values(networkInterfaces())) {
    if (list === undefined) continue
    for (const item of list) {
      if (item.internal) continue
      const mac = item.mac.trim().toLowerCase()
      if (mac === '' || mac === '00:00:00:00:00:00') continue
      macs.add(mac)
    }
  }
  if (macs.size === 0) return null
  const joined = [...macs].sort().join('\n')
  return createHash('sha256').update('liangxiang-device-v1\n').update(joined).digest('base64url')
}
