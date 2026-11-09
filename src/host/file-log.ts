/**
 * Host-side file log. DSH terminals stay quiet after start; operators pull
 * `$DSH_HOME/logs/liangxiang.log` only when diagnosing a problem.
 */
import { appendFileSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { PLUGIN_VERSION } from '../shared/index.ts'
import { findDshProfileRoot } from './profile-npm-float.ts'

export const DEFAULT_HOST_LOG_MAX_BYTES = 5 * 1024 * 1024

interface HostLogRuntime {
  argv?: readonly string[]
  cwd?: string
  pid?: number
}

function entryPackage(entry: string | undefined): { entry: string, root: string, name: string, bin: unknown } | undefined {
  if (!entry) return undefined
  try { entry = realpathSync(entry) } catch { return undefined }
  let root = dirname(entry)
  for (let i = 0; i < 12; i++) {
    try {
      const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { name?: unknown, bin?: unknown }
      if (typeof manifest.name === 'string') return { entry, root, name: manifest.name, bin: manifest.bin }
    } catch { /* Missing/unreadable metadata is an unknown source, never a loggable path. */ }
    const parent = dirname(root)
    if (parent === root) break
    root = parent
  }
  return undefined
}

function hostLogSource(runtime: HostLogRuntime): string {
  const pid = runtime.pid ?? process.pid
  const host = Number.isSafeInteger(pid) && pid > 0 ? `h${pid.toString(36)}` : 'unknown'
  let kind = 'Host', profile: string | undefined
  try {
    const argv = runtime.argv ?? process.argv
    const pkg = entryPackage(argv[1])
    const bin = typeof pkg?.bin === 'string' ? pkg.bin
      : pkg?.bin && typeof pkg.bin === 'object' && 'dsh' in pkg.bin && typeof pkg.bin.dsh === 'string' ? pkg.bin.dsh : undefined
    const cli = pkg?.name === '@deepseek-ai/dsh' && bin !== undefined && resolve(pkg.root, bin) === pkg.entry
    // Official Desktop spawns this exact package entry. A profile named
    // "desktop", Electron alone, and browser UA are not Desktop evidence.
    const desktop = pkg?.name === '@deepseek-ai/dsh-desktop-host' && resolve(pkg.root, 'lib/index.js') === pkg.entry
    const args = argv.slice(2)
    const flag = args.findIndex(arg => arg === '--profile' || arg.startsWith('--profile='))
    if (desktop) kind = 'Desktop'
    if (cli && args[0] === 'web') { kind = 'Web'; profile = 'web' }
    else if (cli && flag >= 0) profile = args[flag] === '--profile' ? args[flag + 1] : args[flag]!.slice('--profile='.length)
    else {
      const root = findDshProfileRoot(desktop ? argv[3] ?? runtime.cwd ?? process.cwd() : runtime.cwd ?? process.cwd())
      if (root) profile = basename(root)
    }
  } catch { /* Logging must still work when runtime metadata cannot be resolved. */ }
  // Always hash profile names: even a valid basename can contain a person's
  // name. No argv, home path, identity or credentials become source labels.
  const label = profile ? `p${createHash('sha256').update(basename(profile)).digest('hex').slice(0, 8)}` : 'unknown'
  return `liangxiang v${PLUGIN_VERSION} ${kind} profile=${label} host=${host}`
}

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
  /** Injectable process context for diagnostics tests, never account identity. */
  runtime?: HostLogRuntime
} = {}): HostFileLog {
  const path = options.path ?? resolveHostLogPath(options.env)
  const maxBytes = options.maxBytes ?? DEFAULT_HOST_LOG_MAX_BYTES
  const source = hostLogSource(options.runtime ?? {})
  const write = (level: 'log' | 'warn', message: string): void => {
    try {
      appendCappedLine(path, `${new Date().toISOString()} [${source}] ${level} ${message}\n`, maxBytes)
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
