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
 *   node lib/backend-cli.js case queue replace --start YYYY-MM-DD <题库文件>
 *   node lib/backend-cli.js identity unbind lk_...
 *   node lib/backend-cli.js admission status|list|issue|revoke
  node lib/backend-cli.js archive clear --yes
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
  node lib/backend-cli.js case queue replace --start YYYY-MM-DD [--limit N] <题库文件>
  node lib/backend-cli.js identity unbind <installation_id>
  node lib/backend-cli.js admission status
  node lib/backend-cli.js admission list [--limit N]
  node lib/backend-cli.js admission issue <数量> [--claims N] [--ttl-hours N]
  node lib/backend-cli.js admission revoke <ticket_id>
  node lib/backend-cli.js admission replace --yes --count N [--claims N] [--ttl-hours N]
  node lib/backend-cli.js archive clear --yes
  node lib/backend-cli.js case reset --yes`

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
      const admission = service.admissionInventory()
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
        admission: {
          active_tickets: admission.activeTickets,
          remaining_claims: admission.remainingClaims,
          exhausted_tickets: admission.exhaustedTickets,
          expired_tickets: admission.expiredTickets,
          revoked_tickets: admission.revokedTickets,
          total_tickets: admission.totalTickets,
        },
      }, null, 2))
      io.log(
        `[liangxiang-ops] status date=${snapshot.business_date} case=${snapshot.active_case.id} `
        + `梁位=${formatLiangPosition(snapshot.global_snapshot.up_votes, snapshot.global_snapshot.down_votes)} `
        + `queue=${queue.length} next=${queue[0]?.publish_on ?? 'fifo'}`,
      )
      io.log(`[liangxiang-ops] 入梁券 active=${admission.activeTickets} remaining=${admission.remainingClaims}`)
      return 0
    }
    if (topic === 'case' && command === 'reset') {
      if (args[2] !== '--yes') {
        io.error('清空今日统计会删除今天的票、快照和同日已结旧案，梁子回到待开梁。身份、入梁券和已声明 Token 保留。确认请加 --yes。')
        return 2
      }
      const reset = service.resetTodayCase()
      io.log(JSON.stringify(reset, null, 2))
      io.log(
        `[liangxiang-ops] case reset date=${reset.business_date} case=${reset.case_id ?? '-'} `
        + `votes=${reset.votes} 梁位=--`,
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
    if (topic === 'case' && command === 'queue' && args[2] === 'replace') {
      if (args[3] !== '--start' || !isBusinessDate(args[4])) {
        throw new WireError('start', 'replace requires --start YYYY-MM-DD')
      }
      const start = args[4]
      let cursor = 5
      let limit: number | null = null
      if (args[cursor] === '--limit') {
        limit = Number(args[cursor + 1])
        cursor += 2
      }
      if (limit !== null && (!Number.isSafeInteger(limit) || limit < 1 || limit > 366)) {
        throw new WireError('limit', 'expected an integer in [1,366]')
      }
      const path = args[cursor]
      if (path === undefined || args.length !== cursor + 1) {
        throw new WireError('file', 'expected one case-bank file path')
      }
      const titles = readCaseBank(path)
      const selected = limit === null ? titles : titles.slice(0, limit)
      if (selected.length === 0 || (limit !== null && selected.length < limit)) {
        throw new Error(`case bank supplied ${selected.length} titles${limit === null ? '' : `; requested ${limit}`}`)
      }
      const plan = selected.map((title, index) => ({ title, publishOn: addUtcDays(start, index) }))
      const replaced = service.replaceQueue(plan)
      io.log(JSON.stringify(replaced, null, 2))
      io.log(
        `[liangxiang-ops] queue replaced cleared=${replaced.cleared} added=${replaced.items.length} `
        + `first=${replaced.items[0]?.publish_on} last=${replaced.items.at(-1)?.publish_on}`,
      )
      return 0
    }
    if (topic === 'identity' && command === 'unbind') {
      const installationId = parseInstallationId(args[2])
      const response = service.unbindIdentity(installationId)
      io.log(JSON.stringify(response, null, 2))
      io.log(`[liangxiang-ops] unbind ${installationId} unbound=${String(response.unbound)}`)
      return 0
    }
    if (topic === 'admission' && command === 'status') {
      const inventory = service.admissionInventory()
      io.log(JSON.stringify({
        active_tickets: inventory.activeTickets,
        remaining_claims: inventory.remainingClaims,
        exhausted_tickets: inventory.exhaustedTickets,
        expired_tickets: inventory.expiredTickets,
        revoked_tickets: inventory.revokedTickets,
        total_tickets: inventory.totalTickets,
      }, null, 2))
      io.log(`[liangxiang-ops] 入梁券 active=${inventory.activeTickets} remaining=${inventory.remainingClaims}`)
      return 0
    }
    if (topic === 'admission' && command === 'list') {
      if (args[2] !== undefined && args[2] !== '--limit') throw new WireError('limit', 'expected --limit N')
      const limit = args[2] === '--limit' ? Number(args[3]) : 100
      const items = service.listAdmissionTickets(limit)
      io.log(JSON.stringify({ items }, null, 2))
      io.log(`[liangxiang-ops] 入梁券 listed=${items.length}`)
      return 0
    }
    if (topic === 'admission' && command === 'issue') {
      const count = Number(args[2])
      let claims = config.admissionTicketMaxClaims
      let ttlHours = config.admissionTicketTtlHours
      for (let cursor = 3; cursor < args.length; cursor += 2) {
        const flag = args[cursor]
        const value = Number(args[cursor + 1])
        if (flag === '--claims') claims = value
        else if (flag === '--ttl-hours') ttlHours = value
        else throw new WireError('options', `unknown admission issue option ${String(flag)}`)
      }
      const issued = service.issueAdmissionTickets(count, claims, ttlHours)
      io.log(JSON.stringify({
        issued: issued.length,
        max_claims: claims,
        ttl_hours: ttlHours,
        expires_at: issued[0]?.expires_at ?? null,
      }, null, 2))
      io.log(`[liangxiang-ops] 入梁券 issued=${issued.length} claims=${claims} ttl=${ttlHours}h`)
      return 0
    }
    if (topic === 'archive' && command === 'clear') {
      if (args[2] !== '--yes') {
        io.error('清空历史梁祠会删除昨日及更早的日/周/月档和对应旧案。今日梁案、身份、入梁券和香火账保留。确认请加 --yes。已打开的 WebUI 需重启后才会看到空梁祠。')
        return 2
      }
      const cleared = service.clearHistoryArchives()
      io.log(JSON.stringify(cleared, null, 2))
      io.log(
        `[liangxiang-ops] archive cleared days=${cleared.days} weeks=${cleared.weeks} `
        + `months=${cleared.months} closed_cases=${cleared.closed_cases} keep=${cleared.business_date}`,
      )
      return 0
    }
    if (topic === 'admission' && command === 'replace') {
      if (!args.includes('--yes')) {
        io.error('会作废当前全部可用入梁券，再发一批新券。确认请加 --yes。')
        return 2
      }
      let count = 1000
      let claims = 1
      let ttlHours = config.admissionTicketTtlHours
      for (let cursor = 2; cursor < args.length; cursor += 1) {
        const flag = args[cursor]
        if (flag === '--yes') continue
        const value = Number(args[cursor + 1])
        if (flag === '--count') { count = value; cursor += 1 }
        else if (flag === '--claims') { claims = value; cursor += 1 }
        else if (flag === '--ttl-hours') { ttlHours = value; cursor += 1 }
        else throw new WireError('options', `unknown admission replace option ${String(flag)}`)
      }
      const replaced = service.replaceAdmissionTickets(count, claims, ttlHours)
      io.log(JSON.stringify(replaced, null, 2))
      io.log(
        `[liangxiang-ops] 入梁券 replaced revoked=${replaced.revoked} issued=${replaced.issued} `
        + `claims=${replaced.max_claims} ttl=${replaced.ttl_hours}h remaining=${replaced.inventory.remainingClaims}`,
      )
      return 0
    }
    if (topic === 'admission' && command === 'revoke') {
      const ticketId = args[2]
      if (ticketId === undefined || args.length !== 3) throw new WireError('ticket_id', 'expected one ticket id')
      const revoked = service.revokeAdmissionTicket(ticketId)
      io.log(JSON.stringify({ ticket_id: ticketId, revoked }, null, 2))
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

function readCaseBank(path: string): string[] {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line !== '' && !line.startsWith('#'))
    .map(title => parseV1PublishCaseRequest({ title }).title)
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
