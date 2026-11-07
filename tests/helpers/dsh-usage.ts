import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import type { DshSessionRef } from '../../src/compat/dsh/host-services.ts'
import type { DshUsageEvent } from '../../src/compat/dsh/settled-usage.ts'
import type { DshTokenUsageBuckets } from '../../src/compat/dsh/token-usage.ts'
import { DSH_TOKEN_USAGE_KEY } from '../../src/compat/dsh/token-usage.ts'

// Resolve the exact in-box packages belonging to the DSH installation under
// test. No additional dependency or handwritten copy of its usage fold is
// involved. `LIANGXIANG_DSH_TEST_ROOT` points the helper at another installed
// DSH (for example the `alpha` dist-tag preview run by ci-compat.yml), so the
// same guard can be reproduced outside CI.
const dshPackageJson = resolveDshPackageJson(process.env.LIANGXIANG_DSH_TEST_ROOT)
const dshRequire = createRequire(dshPackageJson)
const dshVersion = (JSON.parse(readFileSync(dshPackageJson, 'utf8')) as { version?: string }).version ?? 'unknown'

function resolveDshPackageJson(override: string | undefined): string {
  if (override === undefined || override.length === 0) return createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json')
  return statSync(override).isDirectory() ? join(override, 'package.json') : override
}

export interface NativeUsageSession extends DshSessionRef {
  append(type: string, data: unknown, opts?: { surfaceOp: 'append' }): DshUsageEvent
  snapshotEvents(): readonly DshUsageEvent[]
}

interface UsageUnit {
  key: string
  init(): unknown
  apply(state: unknown, event: DshUsageEvent): unknown
  wire: { view(state: unknown): DshTokenUsageBuckets }
}

interface DshFiber {
  await?(): Promise<unknown>
}

const sessionModule = await import(dshRequire.resolve('@deepseek-ai/dsh-session')) as {
  Session: { create(id: string, seed?: readonly DshUsageEvent[]): NativeUsageSession },
}
const meterModule = await import(dshRequire.resolve('@deepseek-ai/dsh-token-meter')) as {
  TokenMeter: new (ctx: unknown) => unknown,
}
const cordisModule = await import(dshRequire.resolve('@deepseek-ai/cordis')) as {
  Context: new () => {
    provide(name: string, value: unknown): unknown
    plugin(plugin: unknown): DshFiber
  },
}

/**
 * Capture the production DSH `tokenUsage` definition through its real service
 * lifecycle. Constructing `new TokenMeter(ctx)` is not enough: current DSH
 * registers projection units from `Service.init`, which only runs when the
 * class is loaded as a plugin. A fake `sessionProjections` satisfies the
 * service's inject contract, and `fiber.await()` covers both the synchronous
 * constructor registration of the pinned host and the awaited registration of
 * newer preview channels.
 */
const usageUnit = await (async (): Promise<UsageUnit> => {
  const ctx = new cordisModule.Context()
  const units: UsageUnit[] = []
  ctx.provide('sessionProjections', { register: (unit: UsageUnit) => { units.push(unit); return {} } })
  const fiber = ctx.plugin(meterModule.TokenMeter)
  if (typeof fiber.await === 'function') await fiber.await()
  const unit = units.find(item => item.key === DSH_TOKEN_USAGE_KEY)
  if (unit === undefined) throw new Error(`DSH ${dshVersion} did not register ${DSH_TOKEN_USAGE_KEY}`)
  return unit
})()

export function nativeUsageSession(id = 'liangxiang-usage-test', seed?: readonly DshUsageEvent[]): NativeUsageSession {
  return sessionModule.Session.create(id, seed)
}

/** Fold events exactly like the production DSH `tokenUsage` projection. */
export function nativeUsageFold(events: readonly DshUsageEvent[]): DshTokenUsageBuckets {
  let state = usageUnit.init()
  for (const event of events) state = usageUnit.apply(state, event)
  return usageUnit.wire.view(state)
}

export function sample(inputTokens: number, outputTokens = 0, cacheReadTokens = 0, cacheWriteTokens = 0) {
  return { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens }
}

export function usageStream(...samples: ReturnType<typeof sample>[]) {
  return samples.map(usage => ({ type: 'chunk' as const, time: Date.now(), chunk: { type: 'usage' as const, usage } }))
}

export function finalMessage(usage: ReturnType<typeof sample> | undefined, model = 'deepseek-flash', provider = 'deepseek-official', step = 1) {
  return {
    turn: 1, step,
    stream: [],
    message: { id: `liangxiang-message-${step}`, role: 'assistant', content: [{ type: 'text', text: 'mock' }], source: { kind: 'model', provider, model } },
    ...(usage === undefined ? {} : { usage }),
  }
}
