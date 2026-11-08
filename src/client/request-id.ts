/**
 * Client-generated idempotency keys for vote intents.
 *
 * `crypto.randomUUID()` exists only in a secure context. A DSH Web UI opened
 * from another machine over plain HTTP (`http://192.168.3.129:3080`, issue #26)
 * is an ordinary page without it, so every 夯 / 拉 press threw
 * `TypeError: crypto.randomUUID is not a function` before any request left the
 * browser, and the vote lock stayed stuck for the rest of the session.
 *
 * A request id is not a secret: the authority only requires it to be unique for
 * one installation and to match `[A-Za-z0-9._-]{8,128}` (`src/domain/vote.ts`).
 * `crypto.getRandomValues` is NOT limited to secure contexts, so it is the
 * first fallback; `Math.random` keeps exotic engines usable instead of throwing
 * in the middle of a click. Every branch returns the UUID-v4 shape, so logs and
 * tests read the same no matter how the page was served.
 */
import { isRequestId } from '../domain/index.ts'

/** The slice of Web Crypto this module needs; injectable for tests. */
export interface RequestIdCrypto {
  randomUUID?: () => string
  getRandomValues?: (array: Uint8Array) => Uint8Array
}

const ID_BYTES = 16

export function randomRequestId(source: RequestIdCrypto | null | undefined = readGlobalCrypto()): string {
  const cryptoSource = source ?? null
  if (cryptoSource !== null && typeof cryptoSource.randomUUID === 'function') {
    try {
      const value = cryptoSource.randomUUID()
      if (isRequestId(value)) return value
    } catch {
      /* Exposed but disabled, or a stub: fall back to raw random bytes. */
    }
  }
  return formatUuid(randomBytes(cryptoSource))
}

function readGlobalCrypto(): RequestIdCrypto | null {
  const candidate = (globalThis as { crypto?: unknown }).crypto
  return typeof candidate === 'object' && candidate !== null ? candidate as RequestIdCrypto : null
}

function randomBytes(source: RequestIdCrypto | null): Uint8Array {
  const bytes = new Uint8Array(ID_BYTES)
  if (source !== null && typeof source.getRandomValues === 'function') {
    try {
      source.getRandomValues(bytes)
      // An all-zero result means a stub that never filled the view. Using it
      // would hand the authority the same id twice and silently dedupe votes.
      if (bytes.some((byte) => byte !== 0)) return bytes
    } catch {
      /* Some engines only fill typed arrays they recognise; keep going. */
    }
  }
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256)
  }
  return bytes
}

/** RFC 4122 version 4 layout: what `crypto.randomUUID()` itself returns. */
function formatUuid(bytes: Uint8Array): string {
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  let hex = ''
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}
