/** Additive machine-readable error envelope; retain legacy error strings. */
export function apiErrorDetail(payload: unknown, status: number): { code: string, message: string } | null {
  if (typeof payload !== 'object' || payload === null || !('error' in payload)) return null
  const error = payload.error
  const fallback = status === 429 ? 'rate_limited' : status >= 500 ? 'authority_unavailable' : 'invalid_request'
  if (typeof error === 'string') return { code: fallback, message: error }
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return { code: 'code' in error && typeof error.code === 'string' ? error.code : fallback, message: error.message }
  }
  return { code: fallback, message: '梁相暂时无法完成请求' }
}
