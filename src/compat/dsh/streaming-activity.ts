import type { DshHostContext } from './host-context.ts'

/** Public dsh-agent Events, 0.2.1-rc.2 / 687f282e86, runtime-types.d.ts.
 * Deliberately omit chunk content, usage, session ids and route metadata.
 */
interface ActivityEvents {
  on(name: 'agent/assistant-stream', listener: (event: {
    agent: object
    frame: { type: 'start' | 'chunk' | 'end', attemptId: string, revision: number }
  }) => void): () => void
  on(name: 'agent/status', listener: (event: { agent: object, status: string }) => void): () => void
  on(name: 'agent/disposed', listener: (event: { agent: object }) => void): () => void
}

/** Transient activity only. Never feeds usage accounting or durable storage.
 * A late attachment can join at the next chunk; nothing replays old history.
 */
export function attachStreamingActivity(ctx: DshHostContext, onActive: (active: boolean) => void): () => void {
  // Structural cast isolates the verified optional DSH event declarations.
  const events = ctx as unknown as ActivityEvents
  if (typeof events.on !== 'function') return () => undefined
  const active = new Map<object, string>()
  const revisions = new WeakMap<object, number>()
  const lastActivity = new Map<object, number>()
  let published = false
  const publish = (): void => {
    const next = active.size > 0
    if (next === published) return
    published = next
    onActive(next)
  }
  const clear = (agent: object): void => { active.delete(agent); lastActivity.delete(agent); publish() }
  // A lost end event can affect motion only; this timeout never settles usage.
  const expiry = setInterval(() => {
    for (const [agent, at] of lastActivity) if (Date.now() - at >= 90_000) clear(agent)
  }, 30_000)
  expiry.unref?.()
  const disposers = [
    events.on('agent/assistant-stream', ({ agent, frame }) => {
      if (!Number.isSafeInteger(frame.revision) || frame.revision <= (revisions.get(agent) ?? 0)
        || typeof frame.attemptId !== 'string' || frame.attemptId === '') return
      revisions.set(agent, frame.revision)
      lastActivity.set(agent, Date.now())
      if (frame.type === 'start' || frame.type === 'chunk') active.set(agent, frame.attemptId)
      else if (frame.type === 'end' && active.get(agent) === frame.attemptId) active.delete(agent)
      publish()
    }),
    events.on('agent/status', ({ agent, status }) => { if (status === 'idle') clear(agent) }),
    events.on('agent/disposed', ({ agent }) => clear(agent)),
  ]
  return () => {
    clearInterval(expiry)
    lastActivity.clear()
    for (const dispose of disposers) dispose()
    active.clear()
    publish()
  }
}
