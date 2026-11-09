import { ModeUnavailableError } from './mode-error.ts'
/**
 * Host half: real DSH token observation plus the voting loop, in one of two
 * honestly-labelled authority modes.
 *
 *   LIANGXIANG_BACKEND_URL=local -> LOCAL_FAKE_DEV
 *     `FakeAuthoritativeLiangService`: everything in this process.
 *
 *   LIANGXIANG_BACKEND_URL unset  -> baked staging URL (DEV_STAGING_ONLY).
 *     First install stays online. The welcome gate or 梁相案牍 may explicitly
 *     select offline; a dead backend is never a mode switch.
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
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DshHostContext } from '../compat/dsh/host-context.ts'
import { resolveDshHostServices, type DshSessionEventSource } from '../compat/dsh/host-services.ts'
import {
  openLiangxiangLocalPersistence,
  openLiangxiangPersistence,
  type LiangxiangLocalPersistenceHandle,
  type LiangxiangPersistenceHandle,
} from '../compat/dsh/storage.ts'
import { attachUsageObservation, type UsageObservationOrigin } from '../compat/dsh/usage-observer.ts'
import { attachStreamingActivity } from '../compat/dsh/streaming-activity.ts'
import { systemClock } from '../shared/business-date.ts'
import { HOST_PLUGIN_NAME, PLUGIN_PACKAGE_NAME } from '../shared/index.ts'
import type { HostAuthorityPreference } from '../shared/wire.ts'
import { createBackendClient } from './backend-client.ts'
import { BackendLiangService } from './backend-service.ts'
import { type CommunityKeypair } from './community-keys.ts'
import { resolveHostRuntimeConfig } from './config.ts'
import { FakeAuthoritativeLiangService } from './fake-service.ts'
import { DayEndService } from './day-end-service.ts'
import { startSnapshotCadence } from './snapshot-cadence.ts'
import { createLiangxiangApi } from './routes.ts'
import { createBarsRecorder } from './bars.ts'
import { createHostFileLog } from './file-log.ts'
import { ensureProfileTracksLatest } from './profile-npm-float.ts'

export const name = HOST_PLUGIN_NAME

const READINESS_FALLBACK_MS = 5_000

/**
 * Plugin body.
 * @param ctx - host root context.
 */
export function apply(ctx: DshHostContext): void {
  const hostLog = createHostFileLog()
  const warn = (message: string): void => {
    hostLog.warn(message)
  }
  try {
    const floated = ensureProfileTracksLatest(dirname(fileURLToPath(import.meta.url)), {
      refresh: false,
    })
    if (floated?.changed) {
      hostLog.log(
        `[${PLUGIN_PACKAGE_NAME}] profile tracks npm tag ${floated.specifier ?? 'latest'}`
        + (floated.refreshed ? ' and refreshed' : ''),
      )
    }
  } catch (error) {
    warn(`[${PLUGIN_PACKAGE_NAME}] could not float the profile npm specifier: ${
      error instanceof Error ? error.message : String(error)
    }`)
  }

  ctx.effect(() => {
    hostLog.log(`[${PLUGIN_PACKAGE_NAME}] host half active`)
    return () => {
      hostLog.log(`[${PLUGIN_PACKAGE_NAME}] host half disposed`)
    }
  }, 'liangxiang: lifecycle marker')

  const {
    service: serviceConfig,
    backendUrl,
    defaultAuthorityPreference,
  } = resolveHostRuntimeConfig(process.env, warn)
  const identityRef: { current: CommunityKeypair | null } = { current: null }
  const local = new FakeAuthoritativeLiangService(serviceConfig, systemClock, warn)
  const createOnlineService = (): BackendLiangService => new BackendLiangService({
      client: createBackendClient({
        baseUrl: backendUrl,
        signer: () => identityRef.current,
      }),
      timezone: serviceConfig.timezone,
      clock: systemClock,
      warn,
      identityRef,
    })
  const slot = new DayEndService(local, systemClock, () => modeTransitioning, warn)
  const service = slot
  let online: BackendLiangService | null = defaultAuthorityPreference === 'online'
    ? createOnlineService()
    : null
  if (online !== null) slot.use(online, false)
  let coreHandle: LiangxiangPersistenceHandle | null = null
  let localHandle: LiangxiangLocalPersistenceHandle | null = null
  let ensureLocalPersistence: (() => Promise<LiangxiangLocalPersistenceHandle>) | null = null
  let disposed = false
  const initializingServices = new Set<BackendLiangService>()
  const assertActive = (): void => { if (disposed) throw new ModeUnavailableError('梁相已关闭') }
  let modeInitialized = false
  let storageReadyForModeConfig = false
  let resolveModeStorageReady: (() => void) | null = null
  const modeStorageReady = new Promise<void>((resolve) => {
    resolveModeStorageReady = resolve
  })
  let modeTransitioning = false
  let modeChangeTail: Promise<void> = Promise.resolve()
  let accountingAvailable = false
  let selectedPreference: HostAuthorityPreference = defaultAuthorityPreference
  const pendingObservations: Array<{
    sessionId: string
    value: unknown
    origin: UsageObservationOrigin
    modelId: string | null
  }> = []

  const queueObservation = (
    sessionId: string,
    value: unknown,
    origin: UsageObservationOrigin,
    modelId: string | null,
  ): void => {
    // Keep arrival order. Collapsing to "latest per session" can drop a
    // catch-up baseline; the following live event then credits from zero.
    pendingObservations.push({ sessionId, value, origin, modelId })
  }

  const flushPendingObservations = (): void => {
    const pending = pendingObservations.splice(0)
    for (const observation of pending) {
      try {
        service.observeUsage(observation.sessionId, observation.value, observation.origin, observation.modelId)
      } catch {
        warn('[dsh-liangxiang] invalid queued usage observation skipped')
      }
    }
  }

  const hydrateOnline = async (candidate: BackendLiangService, core: LiangxiangPersistenceHandle): Promise<void> => {
    const persisted = await core.port.load()
    candidate.hydrateUsage(persisted.watermarks, persisted.dailyUsage, core.port)
    candidate.setAccountingAvailable(accountingAvailable)
    candidate.attachCommunityIdentity(await core.identity.resolve())
  }

  const waitForModeStorage = async (): Promise<LiangxiangPersistenceHandle> => {
    if (!storageReadyForModeConfig || coreHandle === null) {
      let timeout: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          modeStorageReady,
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(() => reject(new ModeUnavailableError('模式配置尚未加载完成，请稍后重试')), READINESS_FALLBACK_MS)
          }),
        ])
      } finally {
        if (timeout !== undefined) clearTimeout(timeout)
      }
    }
    if (!storageReadyForModeConfig || coreHandle === null) {
      throw new ModeUnavailableError('模式配置尚未加载完成，请稍后重试')
    }
    return coreHandle
  }

  const applyAuthorityModeSelection = async (preference: HostAuthorityPreference): Promise<void> => {
    // A mode choice may arrive as soon as the WebUI route is mounted, a few
    // milliseconds before the DSH storage domain has finished opening. Hold
    // the request for the same bounded startup window instead of making the
    // user's first explicit click fail with a transient 503.
    const core = await waitForModeStorage()
    assertActive()
    if (preference === selectedPreference && (
      (preference === 'local' && slot.current === local)
      || (preference === 'online' && online !== null && slot.current === online)
    )) {
      await core.settings.setAuthorityPreference(preference)
      return
    }

    modeTransitioning = true
    try {
      // This same-domain settings write is also a durability barrier for all
      // earlier shared HWM writes. Usage arriving after the barrier begins is
      // held in pendingObservations and delivered only to the final mode.
      await core.settings.setAuthorityPreference(selectedPreference)
      await localHandle?.port.flush()

      if (preference === 'local') {
        const openLocal = ensureLocalPersistence
        if (openLocal === null) throw new ModeUnavailableError('离线存储尚未加载完成，请稍后重试')
        const localPersistence = await openLocal()
        assertActive()
        await local.attachPersistence(localPersistence.port)
        assertActive()
        await core.settings.setAuthorityPreference('local')
        const previousOnline = online
        online = null
        selectedPreference = 'local'
        slot.use(local, false)
        previousOnline?.dispose()
        warn(`[${PLUGIN_PACKAGE_NAME}] user selected offline mode — isolated local ledger active`)
        return
      }

      const candidate = createOnlineService()
      initializingServices.add(candidate)
      try {
        await hydrateOnline(candidate, core)
        assertActive()
        await candidate.refreshBootstrap()
        if (!candidate.hasCommunityAuthority) {
          candidate.dispose()
          throw new ModeUnavailableError('无法连接天庭，在线模式尚未启用；当前仍保持离线模式')
        }
        assertActive()
        await core.settings.setAuthorityPreference('online')
        assertActive()
        const previousOnline = online
        online = candidate
        selectedPreference = 'online'
        slot.use(candidate, false)
        if (previousOnline !== null && previousOnline !== candidate) previousOnline.dispose()
        warn(`[${PLUGIN_PACKAGE_NAME}] user selected online mode — community authority active`)
      } finally {
        initializingServices.delete(candidate)
        if (online !== candidate) candidate.dispose()
      }
    } finally {
      modeTransitioning = false
      if (!disposed) flushPendingObservations()
    }
  }

  const selectAuthorityMode = (preference: HostAuthorityPreference): Promise<void> => {
    const run = modeChangeTail.then(() => applyAuthorityModeSelection(preference))
    modeChangeTail = run.then(() => undefined, () => undefined)
    return run
  }

  ctx.effect(() => () => {
    disposed = true
    for (const candidate of initializingServices) candidate.dispose()
    initializingServices.clear()
    const active = slot.current
    service.dispose?.()
    if (online !== null && online !== active) online.dispose()
  }, 'liangxiang: service lifecycle')

  // Bounded readiness fallback: if no storage domain hydrates us in time, run
  // memory-only (local mode) / with an ephemeral installation id (online mode)
  // rather than serving 503 forever.
  ctx.effect(() => {
    const timer = setTimeout(() => {
      if (modeInitialized) return
      selectedPreference = defaultAuthorityPreference
      if (defaultAuthorityPreference === 'local') {
        local.markReadyMemoryOnly('storage domain did not attach within the startup window')
        slot.use(local, false)
      } else {
        const candidate = createOnlineService()
        online = candidate
        slot.use(candidate, false)
        candidate.markReadyMemoryOnly('storage domain did not attach within the startup window')
      }
      modeInitialized = true
      flushPendingObservations()
    }, READINESS_FALLBACK_MS)
    return () => clearTimeout(timer)
  }, 'liangxiang: readiness fallback')

  // Cadence: local mode publishes its own snapshot here; online mode pulls the
  // backend's published snapshot. Either way the public ratio and the Liangzi
  // state move together, at this cadence (default 1s), never as a per-vote
  // strobe for spectators. The voter's own response already carries the new
  // snapshot so their 梁位 still moves on the click.
  ctx.effect(() => {
    return startSnapshotCadence(service, serviceConfig.snapshotRefreshSeconds)
  }, 'liangxiang: snapshot cadence')

  ctx.effect(() => slot.startDayEnd(), 'liangxiang: day-end incense')
  ctx.effect(() => attachStreamingActivity(ctx, active => service.setStreamingActive(active)), 'liangxiang: streaming activity')

  ctx.inject(['webServer'], (scoped: DshHostContext) => {
    const { webServer } = resolveDshHostServices(scoped)
    if (webServer === undefined) return
    scoped.effect(() => {
      // 走势 samples this Host's own state; it never asks the backend for a
      // series: this is the local-observation channel. The separate market uses
      // official backend candles. One local writer, one sampling timer.
      const bars = createBarsRecorder({
        getWireState: () => service.getWireState(),
        timezone: serviceConfig.timezone,
        warn,
      })
      const api = createLiangxiangApi(service, warn, {
        selectAuthorityMode,
        setDayEndPreferences: preferences => slot.setDayEndPreferences(preferences),
        noteManualGesture: () => slot.noteManualGesture(),
        isAuthorityModeChanging: () => modeTransitioning,
        ...(bars === null ? {} : { bars }),
      })
      const disposeRoute = webServer.register({
        kind: 'prefix',
        path: '/liangxiang/api',
        handler: api.handler,
      })
      bars?.start()
      return () => {
        bars?.dispose()
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
      let openedCore: LiangxiangPersistenceHandle | null = null
      let openedLocal: LiangxiangLocalPersistenceHandle | null = null
      let openingLocal: Promise<LiangxiangLocalPersistenceHandle> | null = null
      openLiangxiangPersistence(storageDomain, warn)
        .then(async (core) => {
          if (disposed) {
            await core.close()
            return
          }
          openedCore = core
          coreHandle = core
          slot.attachDayEndPersistence(core.settings)
          const openLocal = (): Promise<LiangxiangLocalPersistenceHandle> => {
            if (openedLocal !== null) return Promise.resolve(openedLocal)
            if (openingLocal !== null) return openingLocal
            openingLocal = openLiangxiangLocalPersistence(storageDomain, core, warn).then(async (handle) => {
              openingLocal = null
              if (disposed) {
                await handle.close()
                throw new Error('离线存储已关闭')
              }
              openedLocal = handle
              localHandle = handle
              return handle
            }, (error: unknown) => {
              openingLocal = null
              throw error
            })
            return openingLocal
          }
          ensureLocalPersistence = openLocal
          selectedPreference = core.settings.getAuthorityPreference() ?? defaultAuthorityPreference

          if (selectedPreference === 'online') {
            const candidate = online ?? createOnlineService()
            const previousOnline = online
            online = candidate
            slot.use(candidate, false)
            if (previousOnline !== null && previousOnline !== candidate) previousOnline.dispose()
            await hydrateOnline(candidate, core)
            // Do not await 天庭. A 3s first attempt runs in the background;
            // failure keeps online selected and locked, and the cadence retries.
            void candidate.refreshBootstrap({ startup: true })
          } else {
            const localPersistence = await openLocal()
            assertActive()
        await local.attachPersistence(localPersistence.port)
        assertActive()
            const previousOnline = online
            online = null
            slot.use(local, false)
            previousOnline?.dispose()
          }
          storageReadyForModeConfig = true
          resolveModeStorageReady?.()
          resolveModeStorageReady = null
          modeInitialized = true
          flushPendingObservations()
          hostLog.log(
            `[${PLUGIN_PACKAGE_NAME}] authority mode: ${selectedPreference === 'local'
              ? 'LOCAL_FAKE_DEV (isolated local ledger)'
              : `DEV_STAGING_ONLY (${backendUrl})`}`
            + ' — changes require an explicit user/config choice; network failure never switches mode',
          )
        })
        .catch((error: unknown) => {
          warn(`[${PLUGIN_PACKAGE_NAME}] persistence unavailable: ${error instanceof Error ? error.message : String(error)}`)
          if (!modeInitialized) {
            selectedPreference = defaultAuthorityPreference
            if (selectedPreference === 'local') {
              local.markReadyMemoryOnly('storage domain open failed')
              slot.use(local, false)
            } else {
              const candidate = createOnlineService()
              online = candidate
              slot.use(candidate, false)
              candidate.markReadyMemoryOnly('storage domain open failed')
            }
            modeInitialized = true
            flushPendingObservations()
          }
        })
      return () => {
        disposed = true
        coreHandle = null
        localHandle = null
        ensureLocalPersistence = null
        storageReadyForModeConfig = false
        const handles = [openedLocal, openedCore].filter(handle => handle !== null)
        openedLocal = null
        openedCore = null
        for (const handle of handles) {
          handle.close().catch((error: unknown) => {
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
      accountingAvailable = true
      local.setAccountingAvailable(true)
      online?.setAccountingAvailable(true)
      const disposeFeed = attachUsageObservation(sessionProjections, sessions, (sessionId, value, origin, modelId) => {
        if (!modeInitialized || modeTransitioning) {
          queueObservation(sessionId, value, origin, modelId)
          return
        }
        service.observeUsage(sessionId, value, origin, modelId)
      }, scoped as unknown as DshSessionEventSource, warn)
      return () => {
        disposeFeed()
        accountingAvailable = false
        local.setAccountingAvailable(false)
        online?.setAccountingAvailable(false)
      }
    }, 'liangxiang: usage observation')
  })
}
