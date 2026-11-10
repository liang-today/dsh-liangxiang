import { BROWSER_REQUEST_TIMEOUT_MS } from '../shared/request-budget.ts'

export const HOST_API = '/liangxiang/api'
export interface BrowserRequestInit { method?: string, body?: string, headers?: Record<string, string> }
const CLOSED = '梁相连接已关闭'

export function browserEvents(path: string, onFrame: (data: string) => void, onError: (closed: boolean) => void) {
  const source = new EventSource(path)
  source.onmessage = event => onFrame(String(event.data))
  source.onerror = () => onError(source.readyState === EventSource.CLOSED)
  return { close: () => source.close() }
}

/** One deadline covers headers and body; callers alone decide whether an intent may retry. */
export function createBrowserRequests() {
  const controllers = new Set<AbortController>()
  let disposed = false
  return {
    async json(path: string, init: BrowserRequestInit | undefined, check: (response: Response) => void) {
      if (disposed) throw new Error(CLOSED)
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), BROWSER_REQUEST_TIMEOUT_MS)
      controllers.add(controller)
      try {
        const headers = { ...init?.headers }
        if (init?.body !== undefined) headers['content-type'] = 'application/json'
        const response = await fetch(path, { ...init, method: init?.method ?? 'GET', headers, signal: controller.signal })
        check(response)
        return [await response.json() as unknown, response.headers] as const
      } catch (error) {
        if (disposed || controller.signal.aborted || error instanceof TypeError
          || (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'))) {
          throw new Error(disposed ? CLOSED : '网络暂时不稳，请稍后重试。')
        }
        throw error
      } finally { clearTimeout(timer); controllers.delete(controller) }
    },
    dispose() { disposed = true; for (const controller of controllers) controller.abort(); controllers.clear() },
  }
}
