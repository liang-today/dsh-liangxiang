/**
 * Operator CLI — 梁案 publish/queue and identity unbind talk to SQLite
 * in-process. These actions are deliberately NOT on the HTTP surface so the
 * community backend does not have to expose an operator port.
 *
 * Usage (on the VPS, after `pnpm run build`):
 *   node lib/backend-cli.js case publish "新题是夯还是拉"
 *   node lib/backend-cli.js case queue list
 *   node lib/backend-cli.js case queue add [--on YYYY-MM-DD] "明日题是夯还是拉"
 *   node lib/backend-cli.js identity unbind lk_...
 */
import { resolveBackendConfig, BackendConfigError } from './config.ts'
import { LiangbiaoBackendService } from './service.ts'
import { openBackendStore } from './store.ts'
import { parseInstallationId, parseV1PublishCaseRequest } from '../shared/backend-v1.ts'
import { WireError } from '../shared/wire.ts'

export interface OperatorCliIo {
  log: (message: string) => void
  error: (message: string) => void
}

const usage = `usage:
  node lib/backend-cli.js case publish "<标题是夯还是拉>"
  node lib/backend-cli.js case queue list
  node lib/backend-cli.js case queue add [--on YYYY-MM-DD] "<标题是夯还是拉>"
  node lib/backend-cli.js identity unbind <installation_id>`

function stripExec(argv: string[]): string[] {
  let start = 0
  const first = argv[0]
  if (first !== undefined && (first === 'node' || /(?:^|[/\\])node(?:\.exe)?$/i.test(first))) {
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
  if (topic === undefined || command === undefined) {
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
  const service = new LiangbiaoBackendService({ store, config })
  try {
    if (topic === 'case' && command === 'publish') {
      const title = args.slice(2).join(' ').trim()
      const published = service.publishCase(parseV1PublishCaseRequest({ title }).title)
      io.log(JSON.stringify(published, null, 2))
      io.log(
        `[liangbiao-ops] publish archived=${published.archived_case?.id ?? '-'} `
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
      io.log(`[liangbiao-ops] queue id=${queued.id} on=${queued.publish_on ?? 'fifo'}`)
      return 0
    }
    if (topic === 'identity' && command === 'unbind') {
      const installationId = parseInstallationId(args[2])
      const response = service.unbindIdentity(installationId)
      io.log(JSON.stringify(response, null, 2))
      io.log(`[liangbiao-ops] unbind ${installationId} unbound=${String(response.unbound)}`)
      return 0
    }
    io.error(usage)
    return 2
  } catch (error) {
    const message = error instanceof WireError || error instanceof Error ? error.message : String(error)
    io.error(`[liangbiao-ops] ${message}`)
    return 1
  } finally {
    store.close()
  }
}

const invokedDirectly = process.argv[1] !== undefined
  && (process.argv[1].endsWith('backend-cli.js') || process.argv[1].endsWith('cli.ts'))

if (invokedDirectly) {
  process.exitCode = runOperatorCli(process.argv, process.env)
}
