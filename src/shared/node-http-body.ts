import type { IncomingMessage } from 'node:http'

export class OversizedBodyError extends Error {}

/** Preserve original UTF-8 bytes across arbitrary TCP chunk boundaries. */
export function readBoundedBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let bytes = 0
    let done = false
    const fail = (error: Error): void => {
      if (done) return
      done = true
      chunks.length = 0
      reject(error)
    }
    req.on('data', (chunk: Buffer | string) => {
      if (done) return
      const buffer = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk
      bytes += buffer.byteLength
      if (bytes > limit) {
        req.pause()
        fail(new OversizedBodyError('request body too large'))
        return
      }
      chunks.push(buffer)
    })
    req.on('end', () => {
      if (done) return
      done = true
      resolve(Buffer.concat(chunks, bytes).toString('utf8'))
    })
    req.on('aborted', () => fail(new Error('request body interrupted')))
    req.on('error', fail)
  })
}
