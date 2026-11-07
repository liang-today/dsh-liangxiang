/**
 * Day-file persistence for 走势 (K 线).
 *
 * The chart series is *derived* data: it is rebuilt from observations and is
 * never a source of authority for votes, incense or archives. That is why it is
 * allowed to live outside the DSH storage domain as one JSON file per business
 * date — the domain format is a single `<name>.json`, and 365 tiny files beat
 * one ever-growing file here.
 *
 * Rules that keep it safe:
 * - exactly one writer (the Host recorder); browsers never write
 * - a day is written whole, through a temp file and a rename, so a crash
 *   leaves either the previous version or the new one, never half of each
 * - a corrupt or unreadable day is reported and skipped; it never fails voting
 */
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync, openSync, fsyncSync, closeSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { BarsDay } from '../shared/bars-v1.ts'
import { BARS_SCHEMA_VERSION } from '../shared/bars-v1.ts'

export const BARS_DIR_NAME = 'liangxiang-bars'
export const BARS_DAY_FILE_PATTERN = /^(\d{4}-\d{2}-\d{2})\.json$/

/**
 * Resolve the chart directory the same way the Host resolves its log path:
 * `$DSH_HOME` when set, otherwise `~/.dsh`.
 * @param env - process environment (already narrowed by the caller).
 * @param home - fallback home directory.
 */
export function resolveBarsRoot(env: NodeJS.ProcessEnv, home: string): string {
  const override = env.LIANGXIANG_BARS_DIR?.trim()
  if (override !== undefined && override.length > 0) return override
  const dshHome = env.DSH_HOME?.trim()
  const root = dshHome !== undefined && dshHome.length > 0 ? dshHome : join(home, '.dsh')
  return join(root, 'storages', BARS_DIR_NAME)
}

export function barsDayPath(root: string, businessDate: string): string {
  return join(root, 'days', `${businessDate}.json`)
}

/**
 * Write one business date atomically.
 * @param root - chart directory root.
 * @param day - the completed or in-progress day record.
 */
export function writeBarsDay(root: string, day: BarsDay): void {
  const dir = join(root, 'days')
  mkdirSync(dir, { recursive: true })
  const target = barsDayPath(root, day.businessDate)
  const temp = `${target}.tmp`
  const payload = `${JSON.stringify({ schemaVersion: BARS_SCHEMA_VERSION, ...day })}\n`
  writeFileSync(temp, payload, 'utf8')
  const fd = openSync(temp, 'r+')
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(temp, target)
}

export interface BarsDayFile {
  businessDate: string
  day: BarsDay
}

/**
 * List the business dates that have a day file, ascending.
 * @param root - chart directory root.
 */
export function listBarsDayDates(root: string): string[] {
  const dir = join(root, 'days')
  if (!existsSync(dir)) return []
  const dates: string[] = []
  for (const entry of readdirSync(dir)) {
    const match = BARS_DAY_FILE_PATTERN.exec(entry)
    if (match === null) continue
    dates.push(match[1] as string)
  }
  return dates.toSorted()
}

/**
 * Read one day. Returns `null` when the file is missing or unreadable; the
 * caller treats that as "no history for the date", never as a hard failure.
 * @param root - chart directory root.
 * @param businessDate - `YYYY-MM-DD` in the business timezone.
 * @param warn - sink for a single diagnostic line.
 */
export function readBarsDay(root: string, businessDate: string, warn: (message: string) => void): BarsDay | null {
  const path = barsDayPath(root, businessDate)
  if (!existsSync(path)) return null
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<BarsDay> & { schemaVersion?: number }
    if (parsed.schemaVersion !== BARS_SCHEMA_VERSION) {
      warn(`bars day ${businessDate} has unsupported schema ${String(parsed.schemaVersion)}; skipped`)
      return null
    }
    if (parsed.businessDate !== businessDate) {
      warn(`bars day ${businessDate} contains a different date; skipped`)
      return null
    }
    if (!Array.isArray(parsed.buckets) || !Array.isArray(parsed.gaps)) {
      warn(`bars day ${businessDate} is malformed; skipped`)
      return null
    }
    return parsed as BarsDay
  } catch (error) {
    warn(`bars day ${businessDate} unreadable: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}
