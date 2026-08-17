/**
 * One bounded GET /v1/health. Used at Host boot to decide whether the baked
 * (or configured) backend is actually reachable before committing to online
 * mode. A miss falls back to LOCAL_FAKE_DEV instead of sitting on a dead
 * DEV_STAGING_ONLY channel.
 */
export async function probeBackendHealth(
  baseUrl: string,
  timeoutMs = 2_500,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<boolean> {
  if (signal?.aborted) return false
  const controller = new AbortController()
  const onAbort = (): void => controller.abort()
  signal?.addEventListener('abort', onAbort)
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  timer.unref?.()
  try {
    const response = await fetchImpl(`${baseUrl}/v1/health`, { signal: controller.signal })
    if (!response.ok) return false
    const body = (await response.json()) as { status?: unknown }
    return body.status === 'ok'
  } catch {
    return false
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}
