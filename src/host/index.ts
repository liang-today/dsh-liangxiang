/**
 * Host half: real DSH token observation plus the voting loop, in one of two
 * honestly-labelled authority modes.
 *
 *   LIANGBIAO_BACKEND_URL unset -> LOCAL_FAKE_DEV
 *     `FakeAuthoritativeLiangService`: everything in this process.
 *
 *   LIANGBIAO_BACKEND_URL set    -> DEV_STAGING_ONLY
 *     `BackendLiangService`: the online Liangbiao backend owns the spend
 *     ledger, idempotency, the aggregate and the business date; this half
 *     observes tokens (a claim, not a proof), holds the self-minted
 *     pseudonymous installation id, and serves the browser channel.
 *
 * Wiring (all DSH touchpoints via compat/dsh; docs/044):
 *  - `webServer` inject      -> /liangbiao/api routes (state / SSE / vote)
 *  - `storageDomain` inject  -> hydrate + write-behind persistence + identity
 *  - `sessionProjections`+`sessions` inject -> tokenUsage observation
 *
 * Any missing service degrades that capability only (accounting unavailable /
 * memory-only) — the client keeps rendering. Every registration is an effect:
 * plugin unload clears routes, SSE connections, subscriptions and timers.
 */
import type { DshHostContext } from '../compat/dsh/host-context.ts'
import { resolveDshHostServices } from '../compat/dsh/host-services.ts'
import { openLiangbiaoPersistence, type LiangbiaoPersistenceHandle } from '../compat/dsh/storage.ts'
import { attachUsageObservation } from '../compat/dsh/usage-observer.ts'
import { systemClock } from '../shared/business-date.ts'
import { HOST_PLUGIN_NAME, PLUGIN_PACKAGE_NAME } from '../shared/index.ts'
import { createBackendClient } from './backend-client.ts'
import { BackendLiangService } from './backend-service.ts'
import { type CommunityKeypair } from './community-keys.ts'
import { resolveHostRuntimeConfig } from './config.ts'
import { FakeAuthoritativeLiangService } from './fake-service.ts'
import { createLiangbiaoApi } from './routes.ts'
import type { LiangHostService } from './service.ts'

export const name = HOST_PLUGIN_NAME

const READINESS_FALLBACK_MS = 5_000

const warn = (message: string): void => {
  console.warn(message)
}

/**
 * Plugin body.
 * @param ctx - host root context.
 */
export function apply(ctx: DshHostContext): void {
  ctx.effect(() => {
    console.log(`[${PLUGIN_PACKAGE_NAME}] host half active`)
    return () => {
      console.log(`[${PLUGIN_PACKAGE_NAME}] host half disposed`)
    }
  }, 'liangbiao: lifecycle marker')

  const { service: serviceConfig, backendUrl, communityKey } = resolveHostRuntimeConfig(process.env, warn)
  const identityRef: { current: CommunityKeypair | null } = { current: null }
  const online = backendUrl !== null
    ? new BackendLiangService({
      client: createBackendClient({
        baseUrl: backendUrl,
        signer: () => identityRef.current,
        communityKey,
      }),
      timezone: serviceConfig.timezone,
      clock: systemClock,
      warn,
      identityRef,
    })
    : null
  const local = online === null
    ? new FakeAuthoritativeLiangService(serviceConfig, systemClock, warn)
    : null
  const service: LiangHostService = online ?? (local as FakeAuthoritativeLiangService)

  console.log(
    `[${PLUGIN_PACKAGE_NAME}] authority mode: ${online === null ? 'LOCAL_FAKE_DEV (in-process)' : `DEV_STAGING_ONLY (${backendUrl as string})`}`
    + ' — community soft trust: Ed25519 installation key, unverifiable Token claims',
  )

  ctx.effect(() => () => service.dispose?.(), 'liangbiao: service lifecycle')

  // Bounded readiness fallback: if no storage domain hydrates us in time, run
  // memory-only (local mode) / with an ephemeral installation id (online mode)
  // rather than serving 503 forever.
  ctx.effect(() => {
    const timer = setTimeout(() => {
      service.markReadyMemoryOnly('storage domain did not attach within the startup window')
    }, READINESS_FALLBACK_MS)
    return () => clearTimeout(timer)
  }, 'liangbiao: readiness fallback')

  // Cadence: local mode publishes its own snapshot here; online mode pulls the
  // backend's published snapshot. Either way the public ratio and the Liangzi
  // state move together, at this cadence, never per vote.
  ctx.effect(() => {
    const interval = setInterval(() => {
      service.tick()
    }, serviceConfig.snapshotRefreshSeconds * 1000)
    return () => clearInterval(interval)
  }, 'liangbiao: snapshot cadence')

  ctx.inject(['webServer'], (scoped: DshHostContext) => {
    const { webServer } = resolveDshHostServices(scoped)
    if (webServer === undefined) return
    scoped.effect(() => {
      const api = createLiangbiaoApi(service, warn)
      const disposeRoute = webServer.register({
        kind: 'prefix',
        path: '/liangbiao/api',
        handler: api.handler,
      })
      return () => {
        disposeRoute()
        api.closeAllConnections()
      }
    }, 'liangbiao: api routes')
  })

  ctx.inject(['storageDomain'], (scoped: DshHostContext) => {
    const { storageDomain } = resolveDshHostServices(scoped)
    if (storageDomain === undefined) return
    scoped.effect(() => {
      let disposed = false
      let handle: LiangbiaoPersistenceHandle | null = null
      openLiangbiaoPersistence(storageDomain, warn)
        .then(async (opened) => {
          if (disposed) {
            await opened.close()
            return
          }
          handle = opened
          if (online !== null) {
            // Online mode: persistence carries the local token projection and
            // the pseudonymous installation id; the spend ledger is the
            // backend's, never this file's.
            const persisted = await opened.port.load()
            online.hydrateUsage(persisted.watermarks, persisted.dailyUsage, opened.port)
            online.attachCommunityIdentity(await opened.identity.resolve())
          } else {
            await local?.attachPersistence(opened.port)
          }
        })
        .catch((error: unknown) => {
          warn(`[${PLUGIN_PACKAGE_NAME}] persistence unavailable: ${error instanceof Error ? error.message : String(error)}`)
          service.markReadyMemoryOnly('storage domain open failed')
        })
      return () => {
        disposed = true
        const open = handle
        handle = null
        if (open !== null) {
          open.close().catch((error: unknown) => {
            warn(`[${PLUGIN_PACKAGE_NAME}] domain close failed: ${error instanceof Error ? error.message : String(error)}`)
          })
        }
      }
    }, 'liangbiao: persistence')
  })

  ctx.inject(['sessionProjections', 'sessions'], (scoped: DshHostContext) => {
    const { sessionProjections, sessions } = resolveDshHostServices(scoped)
    if (sessionProjections === undefined || sessions === undefined) return
    scoped.effect(() => {
      service.setAccountingAvailable(true)
      const disposeFeed = attachUsageObservation(sessionProjections, sessions, (sessionId, value, origin) => {
        service.observeUsage(sessionId, value, origin)
      })
      return () => {
        disposeFeed()
        service.setAccountingAvailable(false)
      }
    }, 'liangbiao: usage observation')
  })
}
