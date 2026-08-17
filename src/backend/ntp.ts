/**
 * Best-effort NTP offset check at boot. The backend clock (Date.now) remains
 * the authority for incense drip and signatures; this only warns if the VPS
 * clock is drifting. Hardcoded public NTP hosts — never the Host's word.
 */
import { createSocket } from 'node:dgram'

export const NTP_SERVERS = [
  'ntp.aliyun.com',
  'time.apple.com',
  'time.google.com',
  'pool.ntp.org',
] as const

const NTP_PORT = 123
const NTP_TIMEOUT_MS = 1_500
const WARN_OFFSET_MS = 2_500

function ntpToUnixMs(msg: Buffer): number {
  const seconds = msg.readUInt32BE(40)
  const fraction = msg.readUInt32BE(44)
  return (seconds - 2_208_988_800) * 1_000 + Math.round((fraction / 2 ** 32) * 1_000)
}

function queryOne(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const packet = Buffer.alloc(48)
    packet[0] = 0x1b
    const socket = createSocket('udp4')
    const timer = setTimeout(() => {
      socket.close()
      reject(new Error(`ntp timeout ${host}`))
    }, NTP_TIMEOUT_MS)
    socket.once('error', (error) => {
      clearTimeout(timer)
      socket.close()
      reject(error)
    })
    socket.once('message', (msg) => {
      clearTimeout(timer)
      socket.close()
      if (msg.length < 48) {
        reject(new Error(`ntp short packet from ${host}`))
        return
      }
      resolve(ntpToUnixMs(msg))
    })
    socket.send(packet, NTP_PORT, host, (error) => {
      if (error !== null) {
        clearTimeout(timer)
        socket.close()
        reject(error)
      }
    })
  })
}

/** Query hardcoded NTP servers; resolve with offset (ntp - local), or null. */
export async function measureNtpOffsetMs(now = Date.now()): Promise<number | null> {
  for (const host of NTP_SERVERS) {
    try {
      const ntp = await queryOne(host)
      return ntp - now
    } catch {
      // try the next hardcoded host
    }
  }
  return null
}

export async function warnIfClockSkewed(
  warn: (message: string) => void = (message) => console.warn(message),
): Promise<void> {
  const offset = await measureNtpOffsetMs()
  if (offset === null) {
    warn('[liangxiang-backend] NTP unreachable; relying on OS clock. Enable systemd-timesyncd/chrony on the VPS.')
    return
  }
  if (Math.abs(offset) >= WARN_OFFSET_MS) {
    warn(`[liangxiang-backend] OS clock is ${offset}ms off NTP; incense drip and signatures use this clock.`)
    return
  }
  warn(`[liangxiang-backend] NTP offset ${offset}ms (ok)`)
}
