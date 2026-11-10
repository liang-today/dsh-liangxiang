import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'
import { measureNtpOffsetMs } from '../src/backend/ntp.ts'

vi.mock('node:dgram', () => ({ createSocket: () => new TestSocket() }))
let attempts = 0
class TestSocket extends EventEmitter {
  close(): void {}
  send(_packet: Buffer, _port: number, _host: string, sent: (error: Error | null) => void): void {
    attempts++
    sent(null)
    if (attempts < 3) return
    const midpoint = Date.now() + 5
    const response = Buffer.alloc(48)
    response.writeUInt32BE(Math.floor(midpoint / 1000) + 2208988800, 40)
    response.writeUInt32BE(Math.floor((midpoint % 1000) / 1000 * 2 ** 32), 44)
    setTimeout(() => this.emit('message', response), 10)
  }
}
afterEach(() => vi.useRealTimers())

it('does not charge previous NTP host timeouts to OS clock skew', async () => {
  vi.useFakeTimers(); vi.setSystemTime(Date.UTC(2026, 10, 9)); attempts = 0
  const result = measureNtpOffsetMs()
  await vi.advanceTimersByTimeAsync(3010)
  expect(attempts).toBe(3)
  expect(Math.abs((await result)!)).toBeLessThanOrEqual(1)
})
