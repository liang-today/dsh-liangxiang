/**
 * Start one vote intent on a promise chain.
 *
 * `LiveStore.vote` may fail synchronously. Issue #26 was exactly that: the
 * browser transport threw `TypeError: crypto.randomUUID is not a function`
 * before the first `await`, the rejection handlers never ran, and because the
 * handler's `.finally` was attached to the nonexistent promise the in-flight
 * lock stayed held — 夯 and 拉 were dead until the page reloaded.
 *
 * Deferring the call by one microtask turns any synchronous throw into an
 * ordinary rejection, so the existing success/failure/finally path always runs.
 */
export function startVoteIntent<T>(intent: () => Promise<T>): Promise<T> {
  return Promise.resolve().then(intent)
}
