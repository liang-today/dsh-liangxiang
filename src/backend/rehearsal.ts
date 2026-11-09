/** Private rehearsal executable. Never imported by the ordinary backend or plugin. */
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveBackendConfig, DEFAULT_BACKEND_LISTEN_BACKLOG } from './config.ts'
import { createBackendHttpApi } from './http.ts'
import { LiangxiangBackendService } from './service.ts'
import { openBackendStore } from './store.ts'
import { createRehearsalClock, validateRehearsalEnvironment } from './rehearsal-safety.ts'
export { createRehearsalClock, parseRehearsalClock, validateRehearsalEnvironment, rehearsalTickMs, type RehearsalClockControl } from './rehearsal-safety.ts'

export function startRehearsal(env: Record<string, string | undefined> = process.env): { close(): Promise<void> } {
  const paths = validateRehearsalEnvironment(env)
  const clock = createRehearsalClock(paths.clockFile)
  clock.now() // Validate before opening or migrating any database.
  const config = resolveBackendConfig({ ...env, LIANGXIANG_ALLOW_UNSIGNED: '0', LIANGXIANG_AUTHORITY_MODE: 'DEV_STAGING_ONLY' })
  const store = openBackendStore(paths.databasePath)
  let service: LiangxiangBackendService
  try { service = new LiangxiangBackendService({ store, config, clock }); service.ensureActiveCase() }
  catch (error) { store.close(); throw error }
  const api = createBackendHttpApi({ service, store, allowUnsigned: false,
    voteRateLimitPerMinute: config.voteRateLimitPerMinute, voteRateLimitMaxKeys: config.voteRateLimitMaxKeys, voteClock: clock,
    admissionClaimRateLimitPerMinute: config.admissionClaimRateLimitPerMinute })
  // Business deadlines and vote refill share the persisted vote clock. HTTP
  // signatures, market admission and socket lifetimes retain real wall time.
  // No clock-control HTTP route exists.
  const timer = setInterval(() => {
    try { service.tick(); service.replenishAdmissionInventory() }
    catch { console.error('[liangxiang-backend] rehearsal clock/tick failed; stopping isolated service'); process.exitCode = 1; void close() }
  // At 720x, 40ms observes the actual aggregate about twice per business
  // minute. Never synthesize missed buckets if the event loop falls behind.
  }, paths.tickMs)
  let closing: Promise<void> | null = null
  const close = (): Promise<void> => {
    closing ??= new Promise(resolveClose => {
      clearInterval(timer); api.reset()
      api.server.close(() => { store.close(); resolveClose() })
      api.server.closeAllConnections()
    })
    return closing
  }
  api.server.once('error', () => { console.error('[liangxiang-backend] rehearsal listener failed'); process.exitCode = 1; void close() })
  api.server.listen(4195, '127.0.0.1', DEFAULT_BACKEND_LISTEN_BACKLOG, () => console.log('[liangxiang-backend] ISOLATED REHEARSAL: synthetic business clock; soft-trust usage; signed requests required'))
  return { close }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const runtime = startRehearsal()
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void runtime.close() })
}
