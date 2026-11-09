/**
 * Backend entry point (localhost development / staging only).
 *
 * Boots config -> SQLite -> service -> HTTP, runs the snapshot cadence timer,
 * and shuts everything down cleanly on SIGINT/SIGTERM. The startup banner states
 * the authority mode out loud so nobody can mistake this process for a verified
 * production vote authority (AGENTS.md §16, docs/043).
 */
import { resolveBackendConfig, BackendConfigError, DEFAULT_BACKEND_LISTEN_BACKLOG } from './config.ts'
import { createBackendHttpApi } from './http.ts'
import { warnIfClockSkewed } from './ntp.ts'
import { LiangxiangBackendService } from './service.ts'
import { openBackendStore } from './store.ts'

export function startBackend(env: Record<string, string | undefined> = process.env): { close: () => Promise<void> } {
  const config = resolveBackendConfig(env)
  const store = openBackendStore(config.databasePath)
  let service: LiangxiangBackendService
  try {
    service = new LiangxiangBackendService({ store, config })
    service.ensureActiveCase()
  } catch (error) {
    store.close()
    throw error
  }
  let api: ReturnType<typeof createBackendHttpApi>
  try { api = createBackendHttpApi({
    service,
    store,
    voteRateLimitPerMinute: config.voteRateLimitPerMinute,
    voteRateLimitMaxKeys: config.voteRateLimitMaxKeys,
    allowUnsigned: config.allowUnsigned,
    admissionClaimRateLimitPerMinute: config.admissionClaimRateLimitPerMinute,
  }) } catch (error) { store.close(); throw error }
  // Sampling must cross every real minute even when public snapshots are
  // configured much slower. tick() still applies the configured publication
  // threshold and inserts at most one shared row for each quiet minute.
  const cadence = setInterval(() => {
    try {
      service.tick()
    } catch (error) {
      console.warn(`[liangxiang-backend] snapshot cadence failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, Math.min(config.snapshotRefreshSeconds * 1000, 1_000))
  cadence.unref?.()

  api.server.listen(config.port, config.host, DEFAULT_BACKEND_LISTEN_BACKLOG, () => {
    console.log(
      `[liangxiang-backend] listening on http://${config.host}:${config.port}`
      + ` (authority_mode=${config.authorityMode}, tz=${config.timezone},`
      + ` token_per_incense=${config.tokenPerIncense}, snapshot=${config.snapshotRefreshSeconds}s,`
      + ` unsigned=${config.allowUnsigned ? 'allowed' : 'rejected'})`,
    )
    console.log(
      '[liangxiang-backend] COMMUNITY SOFT TRUST: Ed25519 installation keys prove the same'
      + ' Host still holds the private key. Token figures are unverifiable host claims.'
      + ' This is not verified usage voting.',
    )
    void warnIfClockSkewed()
  })

  let closing: Promise<void> | null = null
  const close = (): Promise<void> => {
    closing ??= new Promise(resolve => {
      clearInterval(cadence)
      api.reset()
      const deadline = setTimeout(() => api.server.closeAllConnections(), 5_000)
      deadline.unref()
      api.server.close(() => { clearTimeout(deadline); store.close(); resolve() })
    })
    return closing
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
        void handle.close()
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
