/**
 * Host half: real DSH token observation + the local full voting loop.
 *
 * Wiring (all DSH touchpoints via compat/dsh; docs/044):
 *  - `webServer` inject      -> /liangbiao/api routes (state / SSE / vote)
 *  - `storageDomain` inject  -> hydrate + write-behind persistence
 *  - `sessionProjections`+`sessions` inject -> tokenUsage observation
 *
 * Any missing service degrades that capability only (accounting unavailable
 * / memory-only) — the client keeps rendering (frozen requirement 9). A
 * bounded readiness fallback covers assemblies without a storage domain.
 * Every registration is an effect: plugin unload clears routes, SSE
 * connections, subscriptions, and timers.
 */
import type { DshHostContext } from '../compat/dsh/host-context.ts'
import { resolveDshHostServices } from '../compat/dsh/host-services.ts'
import { openLiangbiaoPersistence, type LiangbiaoPersistenceHandle } from '../compat/dsh/storage.ts'
import { attachUsageObservation } from '../compat/dsh/usage-observer.ts'
import { HOST_PLUGIN_NAME, PLUGIN_PACKAGE_NAME } from '../shared/index.ts'
import { systemClock } from './business-date.ts'
import { resolveHostConfig } from './config.ts'
import { FakeAuthoritativeLiangService } from './fake-service.ts'
import { createLiangbiaoApi } from './routes.ts'

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

  const config = resolveHostConfig(process.env, warn)
  const service = new FakeAuthoritativeLiangService(config, systemClock, warn)

  // Bounded readiness fallback: if no storage domain hydrates us in time,
  // run memory-only rather than serving 503 forever.
  ctx.effect(() => {
    const timer = setTimeout(() => {
      service.markReadyMemoryOnly('storage domain did not attach within the startup window')
    }, READINESS_FALLBACK_MS)
    return () => clearTimeout(timer)
  }, 'liangbiao: readiness fallback')

  // Snapshot cadence: raw aggregates update per accepted vote; the published
  // global snapshot (ratios + Liangzi state, one sequence) refreshes here.
  ctx.effect(() => {
    const interval = setInterval(() => {
      service.tick()
    }, config.snapshotRefreshSeconds * 1000)
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
          await service.attachPersistence(opened.port)
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
