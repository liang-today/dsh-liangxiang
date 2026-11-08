/**
 * Signed 12-installation rehearsal against a dedicated LOOPBACK backend.
 * Never deploys, restarts a process, edits SQLite, or changes an HTTP clock.
 *
 * pnpm exec unrun scripts/rehearse-market.ts --mode prepare --url http://127.0.0.1:4195 \
 *   --state-dir /tmp/liangxiang-rehearsal-private --clock-file /tmp/liangxiang-clock.json
 * Restart the dedicated backend, then run the same command with --mode finish.
 * --mode all skips the restart assertion; --mode verify rechecks a completed run.
 * The dedicated backend injects its business clock into the vote token bucket,
 * while request signatures and network deadlines keep using the wall clock.
 * Vote allowance refills in simulated minutes; this is not a wall-time load test.
 * State contains PRIVATE KEYS: use a disposable private directory and delete it
 * after retaining the redacted JSON report. Mid-phase CLI crash recovery is not
 * automatic; do not rerun an incomplete phase against a production database.
 */
import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createBackendClient, BackendClientError, type BackendClient } from '../src/host/backend-client.ts'
import { generateCommunityKeypair, signRequest, type CommunityKeypair } from '../src/host/community-keys.ts'
import { DEVICE_HEADER, INSTALLATION_HEADER, PUBLIC_KEY_HEADER, SIGNATURE_HEADER, TIMESTAMP_HEADER } from '../src/shared/backend-v1.ts'
import { MARKET_RULE_VERSION, type DailyMarket, type MarketBatchId, type MarketPoint, type MarketPositionRequest, type MarketSide, type MarketState, type MarketStreamEvent } from '../src/shared/market-v1.ts'

export type RehearsalMode = 'prepare' | 'finish' | 'all' | 'verify'
export interface RehearsalOptions { url: string, stateDir: string, clockFile: string, mode: RehearsalMode, timeoutMs?: number }
interface Position { client: number, batch: MarketBatchId, side: MarketSide, amount: number, order: number }
interface Actor { key: CommunityKeypair, opening: number, spent: number, extra: number, remainder: number, threshold: number }
interface Check { name: string, passed: boolean }
interface PrivateState {
  version: 1, run: string, phase: 'preparing' | 'prepared' | 'finishing' | 'complete',
  actors: Actor[], market: DailyMarket | null, time: number, epoch: string,
  positions: Position[], references: Array<MarketPoint | null>, close: MarketPoint | null,
  originalIntent: MarketPositionRequest | null, checks: Check[], restartVerified: boolean,
}
export interface RehearsalReport {
  kind: 'liangxiang_signed_market_rehearsal', status: 'passed' | 'failed', mode: RehearsalMode,
  clients: number, soft_trust_synthetic_usage: true, restart_verified: boolean,
  checks: Check[], totals: { opening: number, votes_spent: number, later_gifts_and_mints: number, invested: number, expected_returned: number },
  limitations: string[], failure?: string,
}
class RehearsalFailure extends Error {
  readonly check: string
  constructor(check: string) { super(check); this.check = check }
}
const CLIENTS = 12, MINUTE = 60_000
const pause = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))
const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0)

/** Separate integer oracle: no server distribution/comparison helpers imported. */
export function rehearsalPoolOracle(positions: readonly Position[], winner: MarketSide | null): Map<number, number> {
  const out = new Map(positions.map(p => [p.client, 0]))
  const long = positions.filter(p => p.side === 'long'), short = positions.filter(p => p.side === 'short')
  const total = (rows: readonly Position[]): bigint => rows.reduce((n, p) => n + BigInt(p.amount), 0n)
  if (winner === null || total(long) === 0n || total(short) === 0n) {
    for (const p of positions) out.set(p.client, p.amount)
    return out
  }
  const winners = winner === 'long' ? long : short, losers = winner === 'long' ? short : long
  const denominator = total(winners), loss = total(losers)
  let paidProfit = 0n
  const rest = winners.map(p => {
    const product = BigInt(p.amount) * loss, profit = product / denominator
    out.set(p.client, p.amount + Number(profit)); paidProfit += profit
    return { client: p.client, order: p.order, remainder: product % denominator }
  }).sort((a, b) => a.remainder === b.remainder ? a.order - b.order : a.remainder > b.remainder ? -1 : 1)
  for (let i = 0; i < Number(loss - paidProfit); i++) {
    const row = rest[i]
    if (!row) throw new RehearsalFailure('oracle_integer_remainder_bound')
    out.set(row.client, out.get(row.client)! + 1)
  }
  return out
}
function winner(close: MarketPoint, reference: MarketPoint | null): MarketSide | null {
  if (!reference || reference.up_votes === 0 || reference.down_votes === 0) return null
  const delta = BigInt(close.up_votes) * BigInt(reference.up_votes + reference.down_votes)
    - BigInt(reference.up_votes) * BigInt(close.up_votes + close.down_votes)
  return delta === 0n ? null : delta > 0n ? 'long' : 'short'
}
function atomicJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${randomUUID()}.tmp`
  writeFileSync(temporary, JSON.stringify(value), { mode: 0o600, flag: 'wx' })
  renameSync(temporary, path); chmodSync(path, 0o600)
}
function validatedUrl(raw: string): string {
  const url = new URL(raw)
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || url.username || url.password || (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) throw new RehearsalFailure('dedicated_loopback_url_required')
  return url.origin
}

export async function runMarketRehearsal(input: RehearsalOptions): Promise<RehearsalReport> {
  let state: PrivateState | undefined
  const clients: BackendClient[] = []
  const report: RehearsalReport = { kind: 'liangxiang_signed_market_rehearsal', status: 'failed', mode: input.mode,
    clients: CLIENTS, soft_trust_synthetic_usage: true, restart_verified: false, checks: [],
    totals: { opening: 0, votes_spent: 0, later_gifts_and_mints: 0, invested: 0, expected_returned: 0 },
    limitations: ['Synthetic Host Token claims do not verify real DSH usage.', 'This bounded functional run is not a capacity, browser, or network-chaos test.',
      'Vote allowance refills in simulated business minutes; wall-time limits and capacity under load are not measured.',
      'Only a prepare/restart/finish sequence proves a real backend restart.', 'An interrupted CLI phase requires operator review; incomplete phases are not automatically resumed.'] }
  try {
    const url = validatedUrl(input.url), timeout = input.timeoutMs ?? 10_000
    if (!Number.isSafeInteger(timeout) || timeout < 100 || timeout > 60_000) throw new RehearsalFailure('invalid_timeout')
    const stateDir = resolve(input.stateDir), clockFile = resolve(input.clockFile), stateFile = join(stateDir, 'state.json')
    if (stateFile === clockFile) throw new RehearsalFailure('clock_and_private_state_must_differ')
    const fresh = input.mode === 'all' || input.mode === 'prepare'
    if (fresh && existsSync(stateFile)) throw new RehearsalFailure('fresh_private_state_directory_required')
    if (!existsSync(clockFile)) throw new RehearsalFailure('existing_rehearsal_clock_required')
    if (existsSync(stateDir) && (lstatSync(stateDir).isSymbolicLink() || !lstatSync(stateDir).isDirectory()
      || (fresh && readdirSync(stateDir).some(name => name !== '.gitignore' && resolve(stateDir, name) !== clockFile)))) throw new RehearsalFailure('dedicated_private_state_directory_required')
    if (existsSync(stateFile) && (lstatSync(stateFile).isSymbolicLink() || !lstatSync(stateFile).isFile())) throw new RehearsalFailure('regular_private_checkpoint_required')
    if (lstatSync(clockFile).isSymbolicLink() || !lstatSync(clockFile).isFile()) throw new RehearsalFailure('regular_rehearsal_clock_file_required')
    mkdirSync(stateDir, { recursive: true, mode: 0o700 }); chmodSync(stateDir, 0o700)
    writeFileSync(join(stateDir, '.gitignore'), '*\n', { mode: 0o600 })
    const publicClient = createBackendClient({ baseUrl: url, timeoutMs: timeout })
    clients.push(publicClient)
    const save = (): void => { if (state) atomicJson(stateFile, state) }
    const check = (name: string, okay: boolean): void => {
      const item = { name, passed: okay }; report.checks.push(item); state?.checks.push(item)
      if (!okay) throw new RehearsalFailure(name)
    }
    const boundedFetch = async (path: string, init?: RequestInit): Promise<Response> => {
      const deadline = Date.now() + timeout
      const attempt = (): Promise<Response> => fetch(`${url}${path}`, { ...init,
        signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) })
      try { return await attempt() }
      catch (error) {
        // A restarted backend may close a pooled idle socket just before the
        // first read reuses it. Retry one read within the original deadline.
        // This helper must never replay a state-changing request.
        if ((init?.method ?? 'GET') !== 'GET' || Date.now() >= deadline) throw error
        await pause(Math.min(100, Math.max(0, deadline - Date.now())))
        return attempt()
      }
    }
    const health = await boundedFetch('/v1/health')
    const healthBody = await health.json() as { status?: string, authority_mode?: string }
    check('dedicated_backend_soft_trust', health.ok && healthBody.status === 'ok' && healthBody.authority_mode === 'DEV_STAGING_ONLY')
    const clock = JSON.parse(readFileSync(clockFile, 'utf8')) as { epoch_ms?: number, anchor_wall_ms?: number, rate?: number }
    check('clock_file_valid', Number.isSafeInteger(clock.epoch_ms) && Number.isSafeInteger(clock.anchor_wall_ms)
      && typeof clock.rate === 'number' && Number.isFinite(clock.rate) && clock.rate >= 0)
    if (fresh) {
      const now = await publicClient.snapshot()
      state = { version: 1, run: randomUUID(), phase: 'preparing', time: now.server_time, epoch: '', positions: [], references: [null, null, null], close: null,
        originalIntent: null, market: null, checks: [...report.checks], restartVerified: false,
        actors: Array.from({ length: CLIENTS }, (_, index) => ({ key: generateCommunityKeypair(`rehearsal-${randomUUID()}-${index}`), opening: 0, spent: 0, extra: 0, remainder: 0, threshold: 0 })) }
      save()
    } else {
      state = JSON.parse(readFileSync(stateFile, 'utf8')) as PrivateState
      check('private_checkpoint_valid', state.version === 1 && state.actors?.length === CLIENTS && !!state.run && !!state.market)
      report.checks = [...state.checks, ...report.checks]
      if (input.mode === 'finish') check('prepared_checkpoint_required', state.phase === 'prepared')
      else check('complete_checkpoint_required', state.phase === 'complete')
    }
    const run = state
    const actors = run.actors
    const actorClients = actors.map(actor => createBackendClient({ baseUrl: url, timeoutMs: timeout, signer: () => actor.key }))
    clients.push(...actorClients)
    const market = (index = 0): Promise<MarketState> => actorClients[index]!.market!(actors[index]!.key.installationId)
    const intentId = (suffix: string): string => `${run.run}-${suffix}`
    const positionTotal = (index: number): number => sum(run.positions.filter(p => p.client === index).map(p => p.amount))
    const assertWallet = async (index: number, label: string): Promise<void> => {
      const actual = (await market(index)).wallet, actor = actors[index]!, frozen = run.phase === 'complete' ? 0 : positionTotal(index)
      const profit = run.close === null ? 0 : sum(([1, 2, 3] as const).map(batch => {
        const rows = run.positions.filter(p => p.batch === batch)
        return rehearsalPoolOracle(rows, winner(run.close!, run.references[batch - 1]!)).get(index)! - (rows.find(p => p.client === index)?.amount ?? 0)
      }))
      check(`${label}_wallet_${index + 1}`, actual.available_incense === actor.opening - actor.spent - frozen + actor.extra + profit
        && actual.frozen_incense === frozen && actual.total_incense === actual.available_incense + frozen)
    }
    const moveClock = async (epoch: number, requireMinute = true): Promise<void> => {
      const before = await publicClient.snapshot()
      check('clock_moves_forward', Number.isSafeInteger(epoch) && epoch >= before.server_time && epoch >= run.time)
      atomicJson(clockFile, { epoch_ms: epoch, anchor_wall_ms: Date.now(), rate: 0 })
      const deadline = Date.now() + timeout
      let confirmations = 0
      while (Date.now() < deadline) {
        const snap = await publicClient.snapshot()
        if (snap.server_time === epoch) confirmations += 1
        else confirmations = 0
        if (confirmations >= 2) {
          if (!requireMinute || (await market()).current_candle?.at === Math.floor(epoch / MINUTE) * MINUTE) { run.time = epoch; save(); return }
        }
        await pause(25)
      }
      throw new RehearsalFailure('clock_file_or_shared_minute_tick_not_observed')
    }
    const streamFrame = async (index: number): Promise<MarketStreamEvent> => new Promise((resolveFrame, reject) => {
      let stop = (): void => undefined
      const timer = setTimeout(() => { stop(); reject(new RehearsalFailure('signed_stream_timeout')) }, timeout)
      stop = actorClients[index]!.subscribeEvents!(actors[index]!.key.installationId, {
        onStatus: status => { if (status === 'unsupported') { clearTimeout(timer); stop(); reject(new RehearsalFailure('signed_stream_required')) } },
        onEvent: event => { clearTimeout(timer); stop(); resolveFrame(event) },
      })
    })
    const probeStreams = async (label: string): Promise<string> => {
      const frames = await Promise.all(actors.map((_, index) => streamFrame(index)))
      check(`${label}_12_signed_streams`, frames.every(frame => frame.epoch === frames[0]!.epoch))
      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i]!, expected = await market(i), text = JSON.stringify(frame)
        check(`${label}_private_wallet_${i + 1}`, frame.market_state?.wallet.available_incense === expected.wallet.available_incense
          && frame.market_state?.wallet.frozen_incense === expected.wallet.frozen_incense
          && actors.every((actor, index) => index === i || (!text.includes(actor.key.installationId) && !text.includes(actor.key.publicKey)))
          && actors.every(actor => !text.includes(actor.key.privateKeyPem)))
      }
      return frames[0]!.epoch
    }
    const put = async (index: number, batch: MarketBatchId, side: MarketSide | null, amount: number, suffix: string): Promise<MarketPositionRequest> => {
      const intent: MarketPositionRequest = { market_id: run.market!.id, batch, side, amount, request_id: intentId(suffix) }
      const result = await actorClients[index]!.marketPosition!(actors[index]!.key.installationId, intent)
      check(`accepted_${suffix}`, result.accepted)
      const prior = run.positions.find(p => p.client === index && p.batch === batch)
      if (prior) { prior.amount = amount; if (side !== null) prior.side = side }
      else run.positions.push({ client: index, batch, amount, side: side!, order: run.positions.length })
      save(); await assertWallet(index, suffix)
      return intent
    }
    const vote = async (index: number, side: 'up' | 'down', count: number, suffix: string): Promise<void> => {
      const response = await actorClients[index]!.vote(actors[index]!.key.installationId,
        { case_id: run.market!.case_id, vote_type: side, count, request_id: intentId(suffix) })
      check(`vote_${suffix}`, response.result.status === 'accepted' && response.result.accepted_incense === count && !response.result.replayed)
      actors[index]!.spent += count; save()
    }
    const tradeBatch = async (batch: MarketBatchId): Promise<void> => {
      const batchState = run.market!.batches[batch - 1]!
      const current = await market()
      check(`p${batch}_empty_pool_before_rehearsal`, current.market!.batches[batch - 1]!.long_incense === 0 && current.market!.batches[batch - 1]!.short_incense === 0)
      if (current.server_time < batchState.opens_at) await moveClock(batchState.opens_at)
      for (let i = 0; i < CLIENTS; i++) {
        const side = (i + batch) % 2 === 0 ? 'long' : 'short'
        const first = await put(i, batch, side, 10 + 3 * i + batch * 2, `p${batch}-open-${i}`)
        if (batch === 1 && i === 0) run.originalIntent = first
        if (i % 3 === 0) await put(i, batch, side === 'long' ? 'short' : 'long', 15 + 3 * i + batch * 2, `p${batch}-adjust-${i}`)
        if (i % 4 === 3) {
          await put(i, batch, null, 0, `p${batch}-withdraw-${i}`)
          await put(i, batch, side === 'long' ? 'short' : 'long', 20 + 3 * i + batch * 2, `p${batch}-reenter-${i}`)
        }
      }
      const before = (await market()).wallet, original = run.originalIntent!
      if (batch === 1) {
        const retries = await Promise.all(Array.from({ length: 4 }, () => actorClients[0]!.marketPosition!(actors[0]!.key.installationId, original)))
        check('parallel_same_request_id_one_freeze', retries.every(reply => reply.accepted) && JSON.stringify((await market()).wallet) === JSON.stringify(before))
        const conflict = await actorClients[0]!.marketPosition!(actors[0]!.key.installationId, { ...original, amount: original.amount + 1 })
        check('conflicting_request_id_rejected', !conflict.accepted && conflict.reason === 'idempotency_conflict')
        const short = await actorClients[0]!.marketPosition!(actors[0]!.key.installationId, { ...original,
          request_id: intentId('insufficient'), amount: before.total_incense + 1 })
        check('insufficient_available_rejected', !short.accepted && short.reason === 'insufficient_incense')
        await assertWallet(0, 'rejected_requests')
      }
      for (let i = 0; i < CLIENTS; i++) await vote(i, i % 2 === 0 ? 'up' : 'down', 1 + i % 3, `p${batch}-activity-${i}`)
      if (batch === 1) {
        const wallet = (await market()).wallet
        const intent = { case_id: run.market!.case_id, vote_type: 'up' as const, count: 1, request_id: intentId('p1-activity-0') }
        const same = await actorClients[0]!.vote(actors[0]!.key.installationId, intent)
        const conflict = await actorClients[0]!.vote(actors[0]!.key.installationId, { ...intent, count: 2 })
        check('vote_same_retry_and_conflict', same.result.status === 'accepted' && same.result.replayed && same.result.accepted_incense === 1
          && conflict.result.status === 'rejected' && conflict.result.reason === 'idempotency_conflict'
          && JSON.stringify((await market()).wallet) === JSON.stringify(wallet))
      }
      save()
    }

    if (fresh) {
      // Confirm a real external business clock before creating any installation.
      await moveClock(run.time + 1_234, false)
      check('twelve_distinct_keys', new Set(actors.map(actor => actor.key.publicKey)).size === CLIENTS)
      for (let i = 0; i < CLIENTS; i++) {
        const client = actorClients[i]!, actor = actors[i]!, ticket = (await client.admissionTickets()).tickets[0]
        check(`public_admission_ticket_${i + 1}`, ticket !== undefined)
        await client.claimAdmission(actor.key.installationId, ticket!.secret, actor.key.publicKey, actor.key.deviceFingerprint!)
        const boot = await client.bootstrap(actor.key.installationId)
        check(`first_daily_gift_${i + 1}`, boot.authoritative_personal_state.starter_tokens === 10 * boot.token_policy.token_per_incense)
        actor.threshold = boot.token_policy.token_per_incense
        const target = boot.authoritative_personal_state.claimed_effective_tokens + (2_000 + i * 7) * actor.threshold + actor.threshold - 1
        const funded = await client.submitClaim(actor.key.installationId, target, boot.business_date)
        check(`soft_trust_funding_${i + 1}`, funded.claim_applied === true && !funded.authoritative_personal_state.claim_verified && funded.claim_notice === undefined)
        actor.opening = funded.authoritative_personal_state.remaining_incense
        actor.remainder = funded.authoritative_personal_state.token_remainder
        check(`exact_claim_mint_${i + 1}`, actor.opening === boot.authoritative_personal_state.remaining_incense + 2_000 + i * 7)
        check(`fractional_progress_${i + 1}`, actor.remainder === actor.threshold - 1)
        const before = (await market(i)).wallet
        await client.submitClaim(actor.key.installationId, target, boot.business_date)
        await client.bootstrap(actor.key.installationId); await client.bootstrap(actor.key.installationId)
        check(`first_gift_not_duplicated_${i + 1}`, JSON.stringify((await market(i)).wallet) === JSON.stringify(before))
        save()
      }
      run.market = (await market()).market
      check('fresh_v2_market_before_p1_lock', run.market?.rule_version === MARKET_RULE_VERSION && run.time < run.market!.batches[0]!.locks_at)
      await moveClock(Math.max(run.time, run.market!.opens_at + MINUTE))
      const unsigned = await boundedFetch('/v1/market', { headers: { [INSTALLATION_HEADER]: actors[0]!.key.installationId } })
      check('unsigned_rejected', unsigned.status === 401)
      const key = actors[0]!.key, signedPath = '/v1/market/history?limit=1', timestamp = Date.now()
      const signature = signRequest({ privateKeyPem: key.privateKeyPem, method: 'GET', path: signedPath,
        timestamp, body: '', installationId: key.installationId })
      const tampered = await boundedFetch('/v1/market/history?limit=2', { headers: {
        [INSTALLATION_HEADER]: key.installationId, [PUBLIC_KEY_HEADER]: key.publicKey, [TIMESTAMP_HEADER]: String(timestamp),
        [DEVICE_HEADER]: key.deviceFingerprint!, [SIGNATURE_HEADER]: signature,
      } })
      check('signature_binds_query', tampered.status === 401)
      run.epoch = await probeStreams('initial')
      await tradeBatch(1)
      run.phase = 'prepared'; save()
      if (input.mode === 'prepare') { report.status = 'passed'; return report }
    }

    if (input.mode !== 'verify') {
      const epoch = await probeStreams('resume')
      if (input.mode === 'finish') check('backend_restart_epoch_changed', epoch !== run.epoch)
      run.restartVerified = epoch !== run.epoch
      for (let i = 0; i < CLIENTS; i++) await assertWallet(i, 'resume')
      const before = (await market()).wallet
      const retry = await actorClients[0]!.marketPosition!(actors[0]!.key.installationId, run.originalIntent!)
      check('durable_request_replay_after_checkpoint', retry.accepted && JSON.stringify((await market()).wallet) === JSON.stringify(before))
      const voteRetry = await actorClients[0]!.vote(actors[0]!.key.installationId, { case_id: run.market!.case_id,
        vote_type: 'up', count: 1, request_id: intentId('p1-activity-0') })
      check('durable_vote_replay_after_checkpoint', voteRetry.result.status === 'accepted' && voteRetry.result.replayed
        && voteRetry.result.accepted_incense === 1 && JSON.stringify((await market()).wallet) === JSON.stringify(before))
      run.phase = 'finishing'; save()
      for (const batch of [1, 2, 3] as const) {
        if (batch !== 1) await tradeBatch(batch)
        const spec = run.market!.batches[batch - 1]!
        await moveClock(spec.locks_at)
        const beforeLock = (await market()).wallet, prior = run.positions.find(p => p.client === 0 && p.batch === batch)!
        const locked = await actorClients[0]!.marketPosition!(actors[0]!.key.installationId, { market_id: run.market!.id,
          batch, side: prior.side, amount: prior.amount + 1, request_id: intentId(`p${batch}-locked-change`) })
        check(`p${batch}_locked_position_rejected`, !locked.accepted && locked.reason === 'batch_not_open'
          && JSON.stringify((await market()).wallet) === JSON.stringify(beforeLock))
        for (let i = 0; i < 3; i++) await vote(i, batch === 2 ? 'down' : 'up', batch + i + 1, `p${batch}-locked-vote-${i}`)
        const expected = (await market()).current_point!
        await moveClock(spec.reference_at)
        const reference = (await market()).market!.batches[batch - 1]!.reference
        check(`p${batch}_exact_reference`, reference !== null && reference.at === spec.reference_at
          && reference.up_votes === expected.up_votes && reference.down_votes === expected.down_votes)
        run.references[batch - 1] = reference; save()
        await vote(batch, batch === 2 ? 'up' : 'down', 4, `p${batch}-after-reference`)
      }
      await moveClock(run.market!.closes_at - MINUTE)
      for (let i = 0; i < CLIENTS; i++) await vote(i, i % 3 === 0 ? 'down' : 'up', 2, `closing-vote-${i}`)
      const expectedClose = (await market()).current_point!
      await moveClock(run.market!.closes_at)
      // Settle first, then release the independent model's frozen positions.
      run.close = { ...expectedClose, at: run.market!.closes_at }; run.phase = 'complete'
      for (let i = 0; i < CLIENTS; i++) {
        const actor = actors[i]!, daily = await actorClients[i]!.dailyState(actor.key.installationId)
        check(`next_day_statistics_reset_${i + 1}`, daily.business_date !== run.market!.business_date && daily.authoritative_personal_state.used_incense === 0)
        check(`next_day_daily_gift_${i + 1}`, daily.authoritative_personal_state.starter_tokens === 10 * actor.threshold)
        actor.extra += 10
        check(`remainder_carried_${i + 1}`, daily.authoritative_personal_state.token_remainder === actor.remainder)
        const target = daily.authoritative_personal_state.claimed_effective_tokens + 1
        const minted = await actorClients[i]!.submitClaim(actor.key.installationId, target, daily.business_date)
        check(`fractional_cross_day_mint_${i + 1}`, minted.authoritative_personal_state.token_remainder === 0)
        actor.extra += 1
        const afterMint = (await market(i)).wallet
        await actorClients[i]!.submitClaim(actor.key.installationId, target, daily.business_date)
        await actorClients[i]!.bootstrap(actor.key.installationId)
        check(`next_day_claim_and_gift_idempotent_${i + 1}`, JSON.stringify((await market(i)).wallet) === JSON.stringify(afterMint))
      }
      save()
    }

    check('completed_market_required', run.close !== null && run.phase === 'complete')
    for (let i = 0; i < CLIENTS; i++) {
      const receipt = (await actorClients[i]!.marketHistory!(actors[i]!.key.installationId, { limit: 50 })).receipts.find(row => row.market_id === run.market!.id)
      const positions = run.positions.filter(p => p.client === i)
      const returned = sum(([1, 2, 3] as const).map(batch => rehearsalPoolOracle(run.positions.filter(p => p.batch === batch), winner(run.close!, run.references[batch - 1]!)).get(i)!))
      check(`receipt_oracle_${i + 1}`, receipt !== undefined && receipt.rule_version === run.market!.rule_version
        && receipt.invested_incense === sum(positions.map(p => p.amount)) && receipt.returned_incense === returned
        && receipt.pnl_incense === returned - receipt.invested_incense && receipt.batches.length === 3
        && receipt.close_point?.case_id === run.market!.case_id && receipt.close_point.up_votes === run.close!.up_votes
        && receipt.close_point.down_votes === run.close!.down_votes && receipt.close_point.at === run.market!.closes_at)
      for (const position of positions) {
        const actual = receipt!.batches.find(row => row.batch === position.batch)!
        const payout = rehearsalPoolOracle(run.positions.filter(p => p.batch === position.batch), winner(run.close!, run.references[position.batch - 1]!)).get(i)!
        const side = winner(run.close!, run.references[position.batch - 1]!)
        check(`receipt_batch_${position.batch}_${i + 1}`, actual.amount === position.amount && actual.side === position.side && actual.payout === payout
          && actual.result === (side ?? 'draw') && JSON.stringify(actual.reference) === JSON.stringify(run.references[position.batch - 1]))
      }
      await assertWallet(i, 'settled')
    }
    const beforeReplay = (await market()).wallet
    const replay = await actorClients[0]!.marketPosition!(actors[0]!.key.installationId, run.originalIntent!)
    check('old_day_request_retry_preserves_settlement', replay.accepted && JSON.stringify((await market()).wallet) === JSON.stringify(beforeReplay))
    const stale = await actorClients[0]!.vote(actors[0]!.key.installationId, { case_id: run.market!.case_id,
      vote_type: 'up', request_id: intentId('stale-after-midnight') })
    check('old_case_vote_rejected_after_midnight', stale.result.status === 'rejected' && JSON.stringify((await market()).wallet) === JSON.stringify(beforeReplay))
    const actualTotal = sum((await Promise.all(actors.map((_, i) => market(i)))).map(row => row.wallet.total_incense))
    check('twelve_wallets_integer_conservation', actualTotal === sum(actors.map(a => a.opening - a.spent + a.extra)))
    report.status = 'passed'; save()
  } catch (error) {
    report.failure = error instanceof RehearsalFailure ? error.check : error instanceof BackendClientError
      ? `backend_http_${error.status ?? 'transport'}${error.code && /^[a-z_]+$/.test(error.code) ? `_${error.code}` : ''}` : 'unexpected_local_or_response_failure'
  } finally {
    for (const client of clients) client.dispose()
    if (state) {
      report.restart_verified = state.restartVerified
      report.totals = { opening: sum(state.actors.map(a => a.opening)), votes_spent: sum(state.actors.map(a => a.spent)),
        later_gifts_and_mints: sum(state.actors.map(a => a.extra)), invested: sum(state.positions.map(p => p.amount)),
        expected_returned: state.close === null ? 0 : sum(([1, 2, 3] as const).flatMap(batch => [...rehearsalPoolOracle(state!.positions.filter(p => p.batch === batch), winner(state!.close!, state!.references[batch - 1]!)).values()])) }
    }
  }
  return report
}

function cliOptions(args: string[]): RehearsalOptions {
  const values = new Map<string, string>()
  for (let i = 0; i < args.length; i++) {
    const [name, inline] = args[i]!.split('=', 2), value = inline ?? args[++i]
    if (!['--url', '--state-dir', '--clock-file', '--mode', '--timeout-ms'].includes(name!) || !value || values.has(name!)) throw new RehearsalFailure('invalid_cli_arguments')
    values.set(name!, value)
  }
  const mode = values.get('--mode') ?? 'all'
  if (!['all', 'prepare', 'finish', 'verify'].includes(mode) || !values.get('--state-dir') || !values.get('--clock-file')) throw new RehearsalFailure('state_directory_clock_file_and_valid_mode_required')
  return { url: values.get('--url') ?? 'http://127.0.0.1:4195', stateDir: values.get('--state-dir')!, clockFile: values.get('--clock-file')!, mode: mode as RehearsalMode,
    ...(values.has('--timeout-ms') ? { timeoutMs: Number(values.get('--timeout-ms')) } : {}) }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await runMarketRehearsal(cliOptions(process.argv.slice(2)))
    process.stdout.write(`${JSON.stringify(report)}\n`); if (report.status !== 'passed') process.exitCode = 1
  } catch { process.stdout.write(`${JSON.stringify({ kind: 'liangxiang_signed_market_rehearsal', status: 'failed', failure: 'invalid_cli_arguments' })}\n`); process.exitCode = 1 }
}
