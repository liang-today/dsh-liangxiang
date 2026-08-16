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
import { LiangbiaoBackendService } from './service.ts'
import { openBackendStore } from './store.ts'

export function startBackend(env: Record<string, string | undefined> = process.env): { close: () => void } {
  const config = resolveBackendConfig(env)
  const store = openBackendStore(config.databasePath)
  const service = new LiangbiaoBackendService({ store, config })
  const api = createBackendHttpApi({
    service,
    voteRateLimitPerMinute: config.voteRateLimitPerMinute,
  })

  service.ensureActiveCase()
  const cadence = setInterval(() => {
    try {
      service.tick()
    } catch (error) {
      console.warn(`[liangbiao-backend] snapshot cadence failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, config.snapshotRefreshSeconds * 1000)
  cadence.unref?.()

  api.server.listen(config.port, config.host, () => {
    console.log(
      `[liangbiao-backend] listening on http://${config.host}:${config.port}${''}`
      + ` (authority_mode=${config.authorityMode}, tz=${config.timezone},`
      + ` token_per_incense=${config.tokenPerIncense}, snapshot=${config.snapshotRefreshSeconds}s)`,
    )
    console.log(
      '[liangbiao-backend] SOFT TRUST: installation ids are pseudonymous and Token figures are'
      + ' unverifiable host claims — this is not verified usage voting.',
    )
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
        console.log(`[liangbiao-backend] ${signal}: shutting down`)
        handle.close()
      })
    }
  } catch (error) {
    if (error instanceof BackendConfigError) {
      console.error(`[liangbiao-backend] configuration rejected: ${error.message}`)
      process.exit(2)
    }
    throw error
  }
}
