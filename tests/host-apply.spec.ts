import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { BackendLiangService } from '../src/host/backend-service.ts'
import type { DshStorageDomainFacility, DshKvTable, DshDomainSpec, DshWebRoute } from '../src/compat/dsh/host-services.ts'
import { AUTHORITY_MODE_ACTION_HEADER, AUTHORITY_MODE_ACTION_VALUE } from '../src/shared/index.ts'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { DshHostContext } from '../src/compat/dsh/host-context.ts'
import { apply, name } from '../src/host/index.ts'

/**
 * Minimal ctx fake: `effect` runs eagerly and collects disposers; `inject`
 * records the requested service keys and invokes the callback with a scoped
 * fake that carries NO services, so every capability degrades exactly as the
 * missing-service path prescribes (UI channel absent, accounting
 * unavailable, memory-only persistence).
 */
function fakeHostContext(): {
  ctx: DshHostContext
  disposers: Array<() => void>
  injectedDeps: string[][]
} {
  const disposers: Array<() => void> = []
  const injectedDeps: string[][] = []
  const fake = {
    effect(callback: () => () => void): void {
      disposers.push(callback())
    },
    inject(deps: string[], callback: (scoped: unknown) => void): void {
      injectedDeps.push([...deps])
      callback(fake)
    },
  }
  // Unsafe cast, documented: the fake covers exactly the two Context members
  // (`effect`, `inject`) the host half touches; anything else throwing is the
  // desired failure mode.
  return { ctx: fake as unknown as DshHostContext, disposers, injectedDeps }
}

describe('host half wiring', () => {
  it('exports the plugin display name', () => {
    expect(name).toBe('liangxiang')
  })

  it('installs lifecycle + timers as effects and requests the DSH seams via inject', () => {
    const dir = mkdtempSync(join(tmpdir(), 'liangxiang-host-apply-'))
    const logPath = join(dir, 'liangxiang.log')
    vi.stubEnv('LIANGXIANG_BACKEND_URL', 'local')
    vi.stubEnv('LIANGXIANG_HOST_LOG', logPath)
    vi.useFakeTimers()
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const { ctx, disposers, injectedDeps } = fakeHostContext()
    apply(ctx)

    expect(readFileSync(logPath, 'utf8')).toContain('[dsh-liangxiang] host half active')
    expect(log).not.toHaveBeenCalled()
    // lifecycle + service + readiness + cadence + timed incense + stream activity.
    expect(disposers.length).toBe(6)
    expect(injectedDeps).toEqual([
      ['webServer'],
      ['storageDomain'],
      ['sessionProjections', 'sessions'],
    ])

    for (const dispose of disposers) dispose()
    expect(readFileSync(logPath, 'utf8')).toContain('[dsh-liangxiang] host half disposed')
    expect(vi.getTimerCount()).toBe(0)
    log.mockRestore()
    vi.unstubAllEnvs()
    vi.useRealTimers()
    rmSync(dir, { recursive: true, force: true })
  })
})


it('owns and disposes an online candidate while durable identity creation is pending', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'liangxiang-pending-mode-'))
  let release!: () => void, identityStarted = false
  const gate = new Promise<void>(resolve => { release = resolve })
  const domains = new Map<string, Map<string, DshKvTable>>()
  const storageDomain: DshStorageDomainFacility = { async open(spec: DshDomainSpec) {
    let tables = domains.get(spec.name)
    if (!tables) {
      tables = new Map()
      for (const name of Object.keys(spec.tables)) {
        const rows = new Map<string, unknown>()
        tables.set(name, { get: key => rows.get(key), entries: () => rows.entries(),
          put: async (key, value) => { if (name === 'identity') { identityStarted = true; await gate } rows.set(key, value) },
          delete: async key => rows.delete(key) })
      }
      domains.set(spec.name, tables)
    }
    return { name: spec.name, table: name => tables!.get(name)!, close: async () => undefined }
  } }
  const disposers: Array<() => void> = []
  let route: DshWebRoute | undefined
  const ctx = { storageDomain,
    effect: (callback: () => () => void) => { disposers.push(callback()) },
    inject: (_deps: string[], callback: (scoped: unknown) => void) => callback(ctx),
    webServer: { register: (value: DshWebRoute) => { route = value; return () => { route = undefined } } } }
  vi.stubEnv('LIANGXIANG_BACKEND_URL', 'local')
  vi.stubEnv('LIANGXIANG_HOST_LOG', join(dir, 'host.log'))
  vi.stubEnv('LIANGXIANG_BARS_DIR', join(dir, 'bars'))
  const dispose = vi.spyOn(BackendLiangService.prototype, 'dispose')
  const server = createServer((req: IncomingMessage, res: ServerResponse) => { if (route) void route.handler(req, res); else res.end() })
  try {
    apply(ctx as unknown as DshHostContext)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('missing test address')
    const pending = fetch(`http://127.0.0.1:${address.port}/liangxiang/api/mode`, { method: 'POST',
      headers: { 'content-type': 'application/json', [AUTHORITY_MODE_ACTION_HEADER]: AUTHORITY_MODE_ACTION_VALUE }, body: '{"mode":"online"}' })
    await vi.waitFor(() => expect(identityStarted).toBe(true))
    for (const close of disposers.splice(0).reverse()) close()
    expect(dispose).toHaveBeenCalled()
    release()
    expect((await pending).status).toBe(503)
    expect(route).toBeUndefined()
  } finally {
    release?.()
    for (const close of disposers.reverse()) close()
    await new Promise<void>(resolve => server.close(() => resolve()))
    dispose.mockRestore(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true })
  }
})
