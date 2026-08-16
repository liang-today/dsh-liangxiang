/**
 * compat/dsh — narrow STRUCTURAL types for the host-side DSH services this
 * plugin touches, plus the single documented cast that resolves them off the
 * cordis context. We deliberately do not depend on the DSH host type
 * packages: their npm line (0.0.1-rc.x) is versioned independently of the
 * pinned source baseline, so structural seams with exact source citations
 * are the more honest contract (docs/044). Every member below is verified
 * against `../deepseek-harness` @ 47f94385:
 *
 * - sessionProjections: packages/session/session-projection/src/index.ts
 *   (`onChanged` L230-238, `snapshot` L248-255, listener shape L81-86)
 * - sessions: packages/core/session/src/index.ts (`list()` L1050-1065,
 *   `requestHeader()` L670-680, `requestContext()` L691-698)
 * - webServer: packages/host/webserver/src/index.ts (`register` L94-101,
 *   `WebRoute` L28-34)
 * - storageDomain: packages/storage/storage-domain/src/index.ts (`open`),
 *   spec shape src/spec.ts, table handle src/domain.ts (L40-90)
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { DshHostContext } from './host-context.ts'

/**
 * Minimal live-session face. `firstLiveSeq` is the seed length (0 for a
 * genuinely fresh session; >0 for resume/fork whose prefix is borrowed
 * history) — packages/core/session/src/index.ts:450-472,539 @ 47f94385. The
 * ledger uses it to decide between crediting-from-zero (fresh) and
 * baselining (borrowed history must never earn retroactive incense).
 */
/** Structural cut of EpochHeader.config — route ids, not display names. */
export interface DshSessionRouteConfig {
  readonly provider: string
  readonly model: string
}

export interface DshEpochHeader {
  readonly config: DshSessionRouteConfig
}

export interface DshRequestContext {
  readonly provider: string
  readonly model: string
}

export interface DshSessionRef {
  readonly id: string
  readonly firstLiveSeq: number
  /** Present on the live DSH session; optional on test stubs. */
  requestHeader?(): DshEpochHeader | undefined
  requestContext?(): DshRequestContext | undefined
}

export type DshProjectionChangeListener = (
  session: DshSessionRef,
  key: string,
  value: unknown,
  seq: number,
) => void

export interface DshSessionProjections {
  /** Effect on the calling fiber; disposer unsubscribes. */
  onChanged(listener: DshProjectionChangeListener): () => void
  /** Synchronous consistent cut of all registered units for one session. */
  snapshot(session: DshSessionRef): { asOfSeq: number, values: Record<string, unknown> }
}

export interface DshSessions {
  /** Live sessions in creation order (fresh array). */
  list(): DshSessionRef[]
}

export interface DshWebRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

export interface DshWebServer {
  register(route: DshWebRoute): () => void
}

/** Zod-compatible minimum the storage runtime calls on stored records (spec.ts:29, index.ts:121). */
export interface DshValueSchema {
  parse(raw: unknown): unknown
}

export interface DshDomainSpec {
  readonly name: string
  readonly version: number
  readonly tables: Record<string, { readonly valueSchema: DshValueSchema }>
}

export interface DshKvTable {
  get(key: string): unknown
  entries(): IterableIterator<[string, unknown]>
  put(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<boolean>
}

export interface DshOpenDomain {
  readonly name: string
  table(name: string): DshKvTable
  close(): Promise<void>
}

export interface DshStorageDomainFacility {
  open(spec: DshDomainSpec): Promise<DshOpenDomain>
}

/** DSH services reachable from an inject-scoped context, narrowly typed. */
export interface DshHostServices {
  sessionProjections?: DshSessionProjections
  sessions?: DshSessions
  webServer?: DshWebServer
  storageDomain?: DshStorageDomainFacility
}

/**
 * Resolve the narrow service faces off a (possibly inject-scoped) context.
 * Unsafe cast, documented: the DSH service augmentations live in packages we
 * intentionally do not depend on; each face above cites its verified source.
 * Absent services stay `undefined` (callers guard).
 * @param ctx - host context (typically the inject callback's scoped context).
 * @returns the same context viewed through the narrow service faces.
 */
export function resolveDshHostServices(ctx: DshHostContext): DshHostServices {
  return ctx as unknown as DshHostServices
}
