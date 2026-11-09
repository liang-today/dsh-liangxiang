/** Pure guard and clock helpers shared by the isolated executable and activity runner. */
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

/** Private sampling cadence, unrelated to the ordinary backend's business clock. */
export function rehearsalTickMs(value: string | undefined): number {
  if (value === undefined) return 200
  if (!/^\d+$/.test(value)) throw new Error('Rehearsal tick must be an integer from 20 to 1000 milliseconds')
  const interval = Number(value)
  if (!Number.isSafeInteger(interval) || interval < 20 || interval > 1_000) {
    throw new Error('Rehearsal tick must be an integer from 20 to 1000 milliseconds')
  }
  return interval
}

export interface RehearsalClockControl { epoch_ms: number; anchor_wall_ms: number; rate: number }

export function parseRehearsalClock(value: unknown): RehearsalClockControl {
  const clock = value as Partial<RehearsalClockControl> | null
  if (!clock || !Number.isSafeInteger(clock.epoch_ms) || !Number.isSafeInteger(clock.anchor_wall_ms)
    || typeof clock.rate !== 'number' || !Number.isFinite(clock.rate) || clock.rate < 0 || clock.rate > 10_000
    || clock.epoch_ms! < Date.UTC(2000, 0, 1) || clock.epoch_ms! >= Date.UTC(2100, 0, 1)) {
    throw new Error('Invalid private rehearsal business clock')
  }
  return clock as RehearsalClockControl
}

export function createRehearsalClock(file: string, wallNow = Date.now): { now(): number } {
  let highWater = 0
  return { now() {
    const control = parseRehearsalClock(JSON.parse(readFileSync(file, 'utf8')))
    const next = Math.floor(control.epoch_ms + Math.max(0, wallNow() - control.anchor_wall_ms) * control.rate)
    if (!Number.isSafeInteger(next) || next >= Date.UTC(2100, 0, 1)) throw new Error('Rehearsal clock out of range')
    // No backwards business dates within a running service, including a wall-clock correction.
    highWater = Math.max(highWater, next)
    return highWater
  } }
}

export function validateRehearsalEnvironment(env: Record<string, string | undefined>): { databasePath: string; clockFile: string; tickMs: number } {
  if (env.LIANGXIANG_REHEARSAL !== '1' || env.LIANGXIANG_BACKEND_HOST !== '127.0.0.1'
    || env.LIANGXIANG_BACKEND_PORT !== '4195' || env.LIANGXIANG_ALLOW_UNSIGNED === '1') {
    throw new Error('Rehearsal requires explicit opt-in, signed authentication and loopback port 4195')
  }
  const databasePath = resolve(env.LIANGXIANG_BACKEND_DB ?? '')
  const clockFile = resolve(env.LIANGXIANG_REHEARSAL_CLOCK_FILE ?? '')
  const directory = dirname(databasePath)
  const temporary = directory.startsWith(join(realpathSync(tmpdir()), 'liangxiang-rehearsal-')) && basename(directory) === 'rehearsal'
  if ((directory !== '/var/lib/liangxiang/rehearsal' && !temporary)
    || basename(databasePath) !== 'liangxiang-rehearsal.sqlite' || clockFile !== join(directory, 'clock.json')
    || realpathSync(directory) !== directory || !lstatSync(clockFile).isFile() || lstatSync(clockFile).nlink !== 1) {
    throw new Error('Rehearsal refuses ordinary backend paths and symbolic links')
  }
  try { if (!lstatSync(databasePath).isFile() || lstatSync(databasePath).nlink !== 1) throw new Error('Rehearsal database must be a separate regular file') }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  return { databasePath, clockFile, tickMs: rehearsalTickMs(env.LIANGXIANG_REHEARSAL_TICK_MS) }
}
