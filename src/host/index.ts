/**
 * Host half: real DSH token observation plus the voting loop, in one of two
 * honestly-labelled authority modes.
 *
 *   LIANGXIANG_BACKEND_URL=local -> LOCAL_FAKE_DEV
 *     `FakeAuthoritativeLiangService`: everything in this process.
 *
 *   LIANGXIANG_BACKEND_URL unset  -> baked staging URL (DEV_STAGING_ONLY).
 *     First install stays online. The welcome gate may ask the Host to switch
 *     to local; a dead backend is not a silent fallback.
 *     `BackendLiangService`: the online Liangxiang backend owns the spend
 *     ledger, idempotency, the aggregate and the business date; this half
 *     observes tokens (a claim, not a proof), holds the self-minted
 *     pseudonymous installation id, and serves the browser channel.
 *
 * Wiring (all DSH touchpoints via compat/dsh; docs/044):
 *  - `webServer` inject      -> /liangxiang/api routes (state / SSE / vote / history)
 *  - `storageDomain` inject  -> hydrate + write-behind persistence + identity
 *  - `sessionProjections`+`sessions` inject -> tokenUsage observation
 *
 * Any missing service degrades that capability only (accounting unavailable /
 * memory-only) — the client keeps rendering. Every registration is an effect:
 * plugin unload clears routes, SSE connections, subscriptions and timers.
 */
import type { DshHostContext } from '../compat/dsh/host-context.ts'
import { resolveDshHostServices } from '../compat/dsh/host-services.ts'
import { openLiangxiangPersistence, type LiangxiangPersistenceHandle } from '../compat/dsh/storage.ts'
import { attachUsageObservation } from '../compat/dsh/usage-observer.ts'
import { systemClock } from '../shared/business-date.ts'
import { HOST_PLUGIN_NAME, PLUGIN_PACKAGE_NAME } from '../shared/index.ts'
import { createBackendClient } from './backend-client.ts'
import { BackendLiangService } from './backend-service.ts'
import { type CommunityKeypair } from './community-keys.ts'
import { resolveHostRuntimeConfig } from './config.ts'
import { FakeAuthoritativeLiangService } from './fake-service.ts'
import { AuthoritySlot } from './authority-slot.ts'
import { createLiangxiangApi } from './routes.ts'
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
  }, 'liangxiang: lifecycle marker')

  const { service: serviceConfig, backendUrl } = resolveHostRuntimeConfig(process.env, warn)
  const identityRef: { current: CommunityKeypair | null } = { current: null }
  const local = new FakeAuthoritativeLiangService(serviceConfig, systemClock, warn)
  const online = backendUrl !== null
    ? new BackendLiangService({
      client: createBackendClient({
        baseUrl: backendUrl,
        signer: () => identityRef.current,
      }),
      timezone: serviceConfig.timezone,
      clock: systemClock,
      warn,
      identityRef,
    })
    : null
  const slot = new AuthoritySlot(online ?? local)
  const service: LiangHostService = slot
  let persistHandle: LiangxiangPersistenceHandle | null = null

  console.log(
    `[${PLUGIN_PACKAGE_NAME}] authority mode: ${online === null ? 'LOCAL_FAKE_DEV (in-process)' : `DEV_STAGING_ONLY (${backendUrl as string})`}`
    + ' — community soft trust: Ed25519 installation key, unverifiable Token claims',
  )

  const enterLocalMode = (): void => {
    if (online === null || slot.current === local) return
    warn(`[${PLUGIN_PACKAGE_NAME}] user chose local mode — panel title will show 今日梁案（本地）`)
    slot.use(local, false)
    if (persistHandle !== null) {
      void local.attachPersistence(persistHandle.port)
    }
  }

  ctx.effect(() => () => {
    service.dispose?.()
  }, 'liangxiang: service lifecycle')

  // Bounded readiness fallback: if no storage domain hydrates us in time, run
  // memory-only (local mode) / with an ephemeral installation id (online mode)
  // rather than serving 503 forever.
  ctx.effect(() => {
    const timer = setTimeout(() => {
      service.markReadyMemoryOnly('storage domain did not attach within the startup window')
    }, READINESS_FALLBACK_MS)
    return () => clearTimeout(timer)
  }, 'liangxiang: readiness fallback')

  // Cadence: local mode publishes its own snapshot here; online mode pulls the
  // backend's published snapshot. Either way the public ratio and the Liangzi
  // state move together, at this cadence (default 1s), never as a per-vote
  // strobe for spectators. The voter's own response already carries the new
  // snapshot so their 梁位 still moves on the click.
  ctx.effect(() => {
    const interval = setInterval(() => {
      service.tick()
    }, serviceConfig.snapshotRefreshSeconds * 1000)
    return () => clearInterval(interval)
  }, 'liangxiang: snapshot cadence')

  ctx.inject(['webServer'], (scoped: DshHostContext) => {
    const { webServer } = resolveDshHostServices(scoped)
    if (webServer === undefined) return
    scoped.effect(() => {
      const api = createLiangxiangApi(service, warn, { chooseLocalMode: enterLocalMode })
      const disposeRoute = webServer.register({
        kind: 'prefix',
        path: '/liangxiang/api',
        handler: api.handler,
      })
      return () => {
        disposeRoute()
        api.closeAllConnections()
      }
    }, 'liangxiang: api routes')
  })

  ctx.inject(['storageDomain'], (scoped: DshHostContext) => {
    const { storageDomain } = resolveDshHostServices(scoped)
    if (storageDomain === undefined) return
    scoped.effect(() => {
      let disposed = false
      let handle: LiangxiangPersistenceHandle | null = null
      openLiangxiangPersistence(storageDomain, warn)
        .then(async (opened) => {
          if (disposed) {
            await opened.close()
            return
          }
          handle = opened
          persistHandle = opened
          if (slot.current === online && online !== null) {
            // Online mode: persistence carries the local token projection and
            // the pseudonymous installation id; the spend ledger is the
            // backend's, never this file's.
            const persisted = await opened.port.load()
            online.hydrateUsage(persisted.watermarks, persisted.dailyUsage, opened.port)
            online.attachCommunityIdentity(await opened.identity.resolve())
          } else {
            await local.attachPersistence(opened.port)
          }
        })
        .catch((error: unknown) => {
          warn(`[${PLUGIN_PACKAGE_NAME}] persistence unavailable: ${error instanceof Error ? error.message : String(error)}`)
          service.markReadyMemoryOnly('storage domain open failed')
        })
      return () => {
        disposed = true
        persistHandle = null
        const open = handle
        handle = null
        if (open !== null) {
          open.close().catch((error: unknown) => {
            warn(`[${PLUGIN_PACKAGE_NAME}] domain close failed: ${error instanceof Error ? error.message : String(error)}`)
          })
        }
      }
    }, 'liangxiang: persistence')
  })

  ctx.inject(['sessionProjections', 'sessions'], (scoped: DshHostContext) => {
    const { sessionProjections, sessions } = resolveDshHostServices(scoped)
    if (sessionProjections === undefined || sessions === undefined) return
    scoped.effect(() => {
      service.setAccountingAvailable(true)
      const disposeFeed = attachUsageObservation(sessionProjections, sessions, (sessionId, value, origin, modelId) => {
        service.observeUsage(sessionId, value, origin, modelId)
      })
      return () => {
        disposeFeed()
        service.setAccountingAvailable(false)
      }
    }, 'liangxiang: usage observation')
  })
}
