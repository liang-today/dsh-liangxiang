/**
 * Operator CLI — 梁案 publish/queue and identity unbind talk to SQLite
 * in-process. These actions are deliberately NOT on the HTTP surface so the
 * community backend does not have to expose an operator port.
 *
 * Usage (on the VPS, after `pnpm run build`):
 *   node lib/backend-cli.js status
 *   node lib/backend-cli.js case publish "新题是夯还是拉"
 *   node lib/backend-cli.js case queue list
 *   node lib/backend-cli.js case queue add [--on YYYY-MM-DD] "明日题是夯还是拉"
 *   node lib/backend-cli.js identity unbind lk_...
 */
import { resolveBackendConfig, BackendConfigError } from './config.ts'
import { readFileSync } from 'node:fs'
import { formatLiangPosition, isBusinessDate } from '../domain/index.ts'
import { LiangxiangBackendService } from './service.ts'
import { openBackendStore, type QueueRow } from './store.ts'
import { parseInstallationId, parseV1PublishCaseRequest } from '../shared/backend-v1.ts'
import { WireError } from '../shared/wire.ts'

export interface OperatorCliIo {
  log: (message: string) => void
  error: (message: string) => void
}

const usage = `usage:
  node lib/backend-cli.js status
  node lib/backend-cli.js case publish "<标题是夯还是拉>"
  node lib/backend-cli.js case queue list
  node lib/backend-cli.js case queue add [--on YYYY-MM-DD] "<标题是夯还是拉>"
  node lib/backend-cli.js case queue seed --start YYYY-MM-DD [--limit N] <题库文件>
  node lib/backend-cli.js identity unbind <installation_id>`

function stripExec(argv: string[]): string[] {
  let start = 0
  const first = argv[0]
  // Rocky/NodeSource may expose the executable as `/usr/bin/node-22`; macOS
  // and most distributions use `node`. Accept both argv[0] forms.
  if (first !== undefined && (first === 'node' || /(?:^|[/\\])node(?:-\d+)?(?:\.exe)?$/i.test(first))) {
    start = 1
  }
  const exec = argv[start]
  if (exec !== undefined && (exec.includes('backend-cli') || exec.endsWith('cli.ts'))) {
    start += 1
  }
  return argv.slice(start)
}

export function runOperatorCli(
  argv: string[],
  env: Record<string, string | undefined> = process.env,
  io: OperatorCliIo = { log: console.log, error: console.error },
): number {
  const args = stripExec(argv)
  const topic = args[0]
  const command = args[1]
  if (topic === undefined || (topic !== 'status' && command === undefined)) {
    io.error(usage)
    return 2
  }

  let config
  try {
    config = resolveBackendConfig(env)
  } catch (error) {
    io.error(error instanceof BackendConfigError ? error.message : String(error))
    return 2
  }
  const store = openBackendStore(config.databasePath)
  const service = new LiangxiangBackendService({ store, config })
  try {
    if (topic === 'status') {
      const snapshot = service.snapshotResponse()
      const queue = service.listQueue()
      io.log(JSON.stringify({
        business_date: snapshot.business_date,
        business_timezone: config.timezone,
        active_case: snapshot.active_case,
        global_snapshot: snapshot.global_snapshot,
        archive_version: snapshot.archive_version,
        queue: {
          pending: queue.length,
          next: queue[0] ?? null,
        },
      }, null, 2))
      io.log(
        `[liangxiang-ops] status date=${snapshot.business_date} case=${snapshot.active_case.id} `
        + `梁位=${formatLiangPosition(snapshot.global_snapshot.up_votes, snapshot.global_snapshot.down_votes)} `
        + `queue=${queue.length} next=${queue[0]?.publish_on ?? 'fifo'}`,
      )
      return 0
    }
    if (topic === 'case' && command === 'publish') {
      const title = args.slice(2).join(' ').trim()
      const published = service.publishCase(parseV1PublishCaseRequest({ title }).title)
      io.log(JSON.stringify(published, null, 2))
      io.log(
        `[liangxiang-ops] publish archived=${published.archived_case?.id ?? '-'} `
        + `opened=${published.active_case.id} title=${published.active_case.title}`,
      )
      return 0
    }
    if (topic === 'case' && command === 'queue' && args[2] === 'list') {
      io.log(JSON.stringify({ items: service.listQueue() }, null, 2))
      return 0
    }
    if (topic === 'case' && command === 'queue' && args[2] === 'add') {
      const rest = args.slice(3)
      let publishOn: string | null = null
      if (rest[0] === '--on') {
        publishOn = rest[1] ?? null
        rest.splice(0, 2)
      }
      const title = rest.join(' ').trim()
      const queued = service.enqueueCase(parseV1PublishCaseRequest({ title }).title, publishOn)
      io.log(JSON.stringify(queued, null, 2))
      io.log(`[liangxiang-ops] queue id=${queued.id} on=${queued.publish_on ?? 'fifo'}`)
      return 0
    }
    if (topic === 'case' && command === 'queue' && args[2] === 'seed') {
      if (args[3] !== '--start' || !isBusinessDate(args[4])) {
        throw new WireError('start', 'seed requires --start YYYY-MM-DD')
      }
      const start = args[4]
      if (start <= service.businessDate()) {
        throw new WireError('start', `must be after current business date ${service.businessDate()}`)
      }
      let cursor = 5
      let limit = 10
      if (args[cursor] === '--limit') {
        limit = Number(args[cursor + 1])
        cursor += 2
      }
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 366) {
        throw new WireError('limit', 'expected an integer in [1,366]')
      }
      const path = args[cursor]
      if (path === undefined || args.length !== cursor + 1) {
        throw new WireError('file', 'expected one case-bank file path')
      }
      const titles = readFileSync(path, 'utf8')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line !== '' && !line.startsWith('#'))
      const pending = service.listQueue()
      const occupiedDates = new Set(pending.flatMap(row => row.publish_on === null ? [] : [row.publish_on]))
      const existingTitles = new Set(pending.map(row => row.title))
      const plan: Array<{ title: string, publishOn: string }> = []
      let date = start
      for (const title of titles) {
        if (plan.length >= limit) break
        if (existingTitles.has(title)) continue
        while (occupiedDates.has(date)) date = addUtcDays(date, 1)
        const normalized = parseV1PublishCaseRequest({ title }).title
        plan.push({ title: normalized, publishOn: date })
        existingTitles.add(normalized)
        occupiedDates.add(date)
        date = addUtcDays(date, 1)
      }
      if (plan.length < limit) {
        throw new Error(`case bank only supplied ${plan.length} new unique titles; requested ${limit}`)
      }
      const scheduled: QueueRow[] = plan.map(item => service.enqueueCase(item.title, item.publishOn))
      io.log(JSON.stringify({ added: scheduled.length, items: scheduled }, null, 2))
      io.log(`[liangxiang-ops] queue seeded=${scheduled.length} first=${scheduled[0]?.publish_on} last=${scheduled.at(-1)?.publish_on}`)
      return 0
    }
    if (topic === 'identity' && command === 'unbind') {
      const installationId = parseInstallationId(args[2])
      const response = service.unbindIdentity(installationId)
      io.log(JSON.stringify(response, null, 2))
      io.log(`[liangxiang-ops] unbind ${installationId} unbound=${String(response.unbound)}`)
      return 0
    }
    io.error(usage)
    return 2
  } catch (error) {
    const message = error instanceof WireError || error instanceof Error ? error.message : String(error)
    io.error(`[liangxiang-ops] ${message}`)
    return 1
  } finally {
    store.close()
  }
}

function addUtcDays(date: string, amount: number): string {
  const instant = new Date(`${date}T00:00:00.000Z`)
  instant.setUTCDate(instant.getUTCDate() + amount)
  return instant.toISOString().slice(0, 10)
}

const invokedDirectly = process.argv[1] !== undefined
  && (process.argv[1].endsWith('backend-cli.js') || process.argv[1].endsWith('cli.ts'))

if (invokedDirectly) {
  process.exitCode = runOperatorCli(process.argv, process.env)
}
