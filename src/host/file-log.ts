/**
 * Host-side file log. DSH terminals stay quiet after start; operators pull
 * `$DSH_HOME/logs/liangxiang.log` only when diagnosing a problem.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const DEFAULT_HOST_LOG_MAX_BYTES = 5 * 1024 * 1024

export function resolveHostLogPath(
  env: Record<string, string | undefined> = process.env,
  home = homedir(),
): string {
  const explicit = env.LIANGXIANG_HOST_LOG?.trim()
  if (explicit) return explicit
  const root = env.DSH_HOME?.trim() || join(home, '.dsh')
  return join(root, 'logs', 'liangxiang.log')
}

export interface HostFileLog {
  path: string
  maxBytes: number
  log: (message: string) => void
  warn: (message: string) => void
}

export function createHostFileLog(options: {
  path?: string
  maxBytes?: number
  env?: Record<string, string | undefined>
} = {}): HostFileLog {
  const path = options.path ?? resolveHostLogPath(options.env)
  const maxBytes = options.maxBytes ?? DEFAULT_HOST_LOG_MAX_BYTES
  const write = (level: 'log' | 'warn', message: string): void => {
    try {
      appendCappedLine(path, `${new Date().toISOString()} ${level} ${message}\n`, maxBytes)
    } catch {
      // Logging must never take down the plugin.
    }
  }
  return {
    path,
    maxBytes,
    log: (message) => write('log', message),
    warn: (message) => write('warn', message),
  }
}

export function appendCappedLine(path: string, payload: string, maxBytes: number): void {
  mkdirSync(dirname(path), { recursive: true })
  const incoming = Buffer.from(payload)
  if (incoming.length >= maxBytes) {
    writeFileSync(path, incoming.subarray(incoming.length - maxBytes))
    return
  }
  let existing = Buffer.alloc(0)
  try {
    existing = readFileSync(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  if (existing.length + incoming.length > maxBytes) {
    const keep = maxBytes - incoming.length
    existing = existing.subarray(existing.length - keep)
    const newline = existing.indexOf(0x0a)
    if (newline !== -1 && newline + 1 < existing.length) {
      existing = existing.subarray(newline + 1)
    }
    writeFileSync(path, Buffer.concat([existing, incoming]))
    return
  }
  appendFileSync(path, incoming)
}
