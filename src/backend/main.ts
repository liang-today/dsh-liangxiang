/**
 * Backend entry point (localhost development / staging only).
 *
 * Boots config -> SQLite -> service -> HTTP, runs the snapshot cadence timer,
 * and shuts everything down cleanly on SIGINT/SIGTERM. The startup banner states
 * the authority mode out loud so nobody can mistake this process for a verified
 * production vote authority (AGENTS.md §16, docs/043).
 */
import { resolveBackendConfig, BackendConfigError } from './config.ts'
import { createBackendHttpApi } from './http.ts'
import { warnIfClockSkewed } from './ntp.ts'
import { LiangxiangBackendService } from './service.ts'
import { openBackendStore } from './store.ts'

export function startBackend(env: Record<string, string | undefined> = process.env): { close: () => void } {
  const config = resolveBackendConfig(env)
  const store = openBackendStore(config.databasePath)
  const service = new LiangxiangBackendService({ store, config })
  const api = createBackendHttpApi({
    service,
    store,
    voteRateLimitPerMinute: config.voteRateLimitPerMinute,
    voteRateLimitMaxKeys: config.voteRateLimitMaxKeys,
    allowUnsigned: config.allowUnsigned,
    communityKey: config.communityKey,
    admissionClaimRateLimitPerMinute: config.admissionClaimRateLimitPerMinute,
  })

  service.ensureActiveCase()
  const cadence = setInterval(() => {
    try {
      service.tick()
    } catch (error) {
      console.warn(`[liangxiang-backend] snapshot cadence failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, config.snapshotRefreshSeconds * 1000)
  cadence.unref?.()

  api.server.listen(config.port, config.host, () => {
    console.log(
      `[liangxiang-backend] listening on http://${config.host}:${config.port}`
      + ` (authority_mode=${config.authorityMode}, tz=${config.timezone},`
      + ` token_per_incense=${config.tokenPerIncense}, snapshot=${config.snapshotRefreshSeconds}s,`
      + ` unsigned=${config.allowUnsigned ? 'allowed' : 'rejected'},`
      + ` community_key=${config.communityKey === null ? 'off' : 'on'})`,
    )
    console.log(
      '[liangxiang-backend] COMMUNITY SOFT TRUST: Ed25519 installation keys prove the same'
      + ' Host still holds the private key. Token figures are unverifiable host claims.'
      + ' This is not verified usage voting.',
    )
    void warnIfClockSkewed()
  })

  let closed = false
  const close = (): void => {
    if (closed) return
    closed = true
    clearInterval(cadence)
    api.reset()
    api.server.close()
    store.close()
  }
  return { close }
}

const invokedDirectly = process.argv[1] !== undefined
  && (process.argv[1].endsWith('backend.js') || process.argv[1].endsWith('main.ts'))

if (invokedDirectly) {
  try {
    const handle = startBackend()
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.once(signal, () => {
        console.log(`[liangxiang-backend] ${signal}: shutting down`)
        handle.close()
      })
    }
  } catch (error) {
    if (error instanceof BackendConfigError) {
      console.error(`[liangxiang-backend] configuration rejected: ${error.message}`)
      process.exit(2)
    }
    throw error
  }
}
