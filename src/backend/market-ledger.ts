/** Server-owned cumulative wallet and three sealed pari-mutuel pools. */
import { MARKET_BATCH_HOURS, isMarketRuleVersion, compareMarketRatios, distributeMarketPool, marketBusinessHour, validMarketReference, type MarketRuleVersion } from '../domain/market.ts'
import {
  MARKET_CANDLE_INTERVAL_MS, MARKET_LEGACY_CANDLE_INTERVAL_MS, MARKET_CANDLES_PAGE_MAX, MARKET_HISTORY_PAGE_DEFAULT,
  MARKET_HISTORY_PAGE_MAX, MARKET_RULE_VERSION,
  type DailyMarket, type MarketBatch, type MarketBatchId, type MarketCandlesResponse,
  type MarketHistoryResponse, type MarketPoint, type MarketPositionRequest,
  type MarketPositionResponse, type MarketReceipt, type MarketResult, type MarketSide,
  type MarketState, type MarketWallet, type MarketCandleIntervalMs,
} from '../shared/market-v1.ts'
import { businessDayEndsAt, createBusinessDateProvider } from '../shared/business-date.ts'
import { WireError } from '../shared/wire.ts'
import type { BackendStore, CaseRow, IncenseRow, StatsRow } from './store.ts'
import { BackendConfigError } from './config.ts'

interface WalletRow { installation_id: string, available: number, frozen: number, token_remainder: number, token_per_incense: number, version: number, cumulative_since: number | null, daily_business_date: string }
interface CursorRow { claimed_tokens: number, minted_incense: number }
interface MarketRow { id: string, case_id: string, business_date: string, timezone: string, opens_at: number, closes_at: number, status: DailyMarket['status'], close_point: string | null, created_at: number, settled_at: number | null, version: number, rule_version: string }
interface BatchRow { market_id: string, batch: MarketBatchId, opens_at: number, locks_at: number, reference_at: number, status: MarketBatch['status'], reference_point: string | null, result: MarketResult | null }
interface PositionRow { id: number, market_id: string, batch: MarketBatchId, installation_id: string, side: MarketSide, amount: number, payout: number | null, created_at: number, updated_at: number }

export class MarketLedger {
  private readonly db: BackendStore['database']
  private readonly poolCache = new Map<string, { version: number, pools: Map<number, { long: number, short: number }> }>()
  private readonly batchCache = new Map<string, { version: number, batches: BatchRow[] }>()
  private readonly statements = new Map<string, ReturnType<BackendStore['database']['prepare']>>()
  private readonly stateOwners = new WeakMap<MarketState, string>()
  private cachedRollbackVersion = -1
  constructor(private readonly store: BackendStore, private readonly timezone: string) {
    this.db = store.database
  }

  private prepare(sql: string): ReturnType<BackendStore['database']['prepare']> {
    let statement = this.statements.get(sql)
    if (statement === undefined) {
      statement = this.db.prepare(sql)
      // Queries are internal constants (including the two candle tables).
      // Bound even that cache; it must never grow with users or request IDs.
      if (this.statements.size >= 128) this.statements.delete(this.statements.keys().next().value!)
      this.statements.set(sql, statement)
    }
    return statement
  }

  assertSupportedOpenMarkets(): void {
    const rules = this.prepare("SELECT DISTINCT rule_version FROM liang_market WHERE status='open'")
      .all() as Array<{ rule_version: string }>
    const unknown = rules.find(row => !isMarketRuleVersion(row.rule_version))
    if (unknown !== undefined) throw new BackendConfigError(`unsupported open market rule ${unknown.rule_version}; use a backend supporting the recorded policy`)
  }

  assertTokenThreshold(threshold: number, businessDate: string): void {
    const wallet = this.prepare('SELECT token_per_incense FROM incense_wallet WHERE token_per_incense<>? LIMIT 1')
      .get(threshold) as { token_per_incense: number } | undefined
    const legacy = this.prepare('SELECT token_per_incense FROM daily_incense_state WHERE business_date=? AND token_per_incense<>? LIMIT 1')
      .get(businessDate, threshold) as { token_per_incense: number } | undefined
    const active = this.store.activeCaseFor(businessDate)
    const stored = wallet?.token_per_incense ?? legacy?.token_per_incense
      ?? (active !== undefined && active.token_per_incense !== threshold ? active.token_per_incense : undefined)
    if (stored !== undefined) {
      throw new BackendConfigError(`LIANGXIANG_TOKEN_PER_INCENSE=${threshold} differs from persisted wallet/case threshold ${stored}; an explicit wallet-threshold migration is required`)
    }
  }

  /** Eagerly import ONLY the live cutover day, including users currently offline. */
  initializeWallets(businessDate: string, now: number): void {
    this.store.transaction(() => {
      this.expireDailyWallets(businessDate, now)
      const rows = this.prepare('SELECT * FROM daily_incense_state WHERE business_date = ?').all(businessDate) as unknown as IncenseRow[]
      for (const row of rows) this.ensureWallet(row.installation_id, businessDate, row.token_per_incense, now)
    })
  }

  /** Called in the business-date transaction, including on restart/offline days. */
  expireDailyWallets(date: string, now: number): void {
    const rows = this.prepare(`SELECT * FROM incense_wallet
      WHERE cumulative_since IS NULL AND daily_business_date<?`).all(date) as unknown as WalletRow[]
    for (const row of rows) {
      // Never erase an unexpected reservation. Old protocols cannot create
      // one; migrated candidate wallets were marked cumulative by schema 15.
      if (row.frozen !== 0) throw new Error('daily wallet has frozen assets; explicit repair required')
      this.prepare(`UPDATE incense_wallet SET available=0,token_remainder=0,
        daily_business_date=?,version=version+1,updated_at=? WHERE installation_id=?`)
        .run(date, now, row.installation_id)
      if (row.available > 0) this.entry(row.installation_id, `expire:${row.daily_business_date}`,
        'daily_expiry', -row.available, 0, row.daily_business_date, now)
    }
  }

  /** One-way opt-in. It preserves only the live day's actual funds/progress. */
  enableCumulative(installation: string, now: number): void {
    this.prepare('UPDATE incense_wallet SET cumulative_since=? WHERE installation_id=? AND cumulative_since IS NULL')
      .run(now, installation)
  }

  /** Caller owns the transaction. Historical expired days are never summed. */
  ensureWallet(installation: string, date: string, threshold: number, now: number): WalletRow {
    const existing = this.walletRow(installation)
    if (existing !== undefined) return existing
    const old = this.store.incenseFor(installation, date)
    const claimed = old?.claimed_effective_tokens ?? 0
    const earned = Math.floor(claimed / threshold)
    const available = Math.max(0, earned - (old?.used_incense ?? 0))
    this.prepare(`INSERT INTO incense_wallet
      (installation_id,available,frozen,token_remainder,token_per_incense,version,created_at,updated_at,daily_business_date)
      VALUES (?,?,0,?,?,0,?,?,?)`).run(installation, available, claimed % threshold, threshold, now, now, date)
    this.prepare(`INSERT INTO incense_wallet_cursor(installation_id,business_date,claimed_tokens,minted_incense)
      VALUES (?,?,?,?)`).run(installation, date, claimed, earned)
    this.entry(installation, 'opening', 'opening', available, 0, date, now)
    return this.walletRow(installation)!
  }

  syncClaim(row: IncenseRow, now: number, kind = 'incense'): void {
    const wallet = this.ensureWallet(row.installation_id, row.business_date, row.token_per_incense, now)
    this.prepare(`INSERT OR IGNORE INTO incense_wallet_cursor
      (installation_id,business_date,claimed_tokens,minted_incense) VALUES (?,?,0,0)`).run(row.installation_id, row.business_date)
    const cursor = this.cursor(row.installation_id, row.business_date)!
    const delta = row.claimed_effective_tokens - cursor.claimed_tokens
    if (delta <= 0) return
    // A changed threshold must not reinterpret an existing fractional credit.
    if (wallet.token_per_incense !== row.token_per_incense) throw new Error('wallet token threshold changed without migration')
    const total = wallet.token_remainder + delta
    if (!Number.isSafeInteger(total)) throw new Error('wallet token amount exceeds safe integer range')
    const minted = Math.floor(total / wallet.token_per_incense)
    const credited = this.prepare(`UPDATE incense_wallet SET available=available+?, token_remainder=?, version=version+1,updated_at=?
      WHERE installation_id=? AND available+frozen+?<=9007199254740991`).run(minted, total % wallet.token_per_incense, now, row.installation_id, minted)
    if (Number(credited.changes) !== 1) throw new WireError('claim', 'wallet capacity exceeded')
    this.prepare(`UPDATE incense_wallet_cursor SET claimed_tokens=?,minted_incense=minted_incense+?
      WHERE installation_id=? AND business_date=?`).run(row.claimed_effective_tokens, minted, row.installation_id, row.business_date)
    // Fractional progress is durable in the wallet/cursor above. The money
    // journal records only an actual mint, not every sub-stick usage sample.
    if (minted > 0) this.entry(row.installation_id, `claim:${row.business_date}:${row.claimed_effective_tokens}`, kind, minted, 0, row.business_date, now)
  }

  mintedToday(installation: string, date: string): number {
    return this.cursor(installation, date)?.minted_incense ?? 0
  }

  wallet(installation: string): MarketWallet {
    const row = this.walletRow(installation)
    if (row === undefined) throw new Error('wallet missing')
    return { available_incense: row.available, frozen_incense: row.frozen,
      total_incense: row.available + row.frozen, token_remainder: row.token_remainder,
      token_per_incense: row.token_per_incense, version: row.version }
  }

  walletVersion(installation: string): number { return this.walletRow(installation)?.version ?? -1 }
  streamRevision(): string {
    const row = this.prepare('SELECT id,version FROM liang_market ORDER BY business_date DESC LIMIT 1')
      .get() as { id: string, version: number } | undefined
    return row === undefined ? 'none' : `${row.id}:${row.version}`
  }
  hasVoteReceipt(installation: string, requestId: string): boolean {
    return this.prepare('SELECT 1 FROM incense_wallet_entry WHERE installation_id=? AND reference=?')
      .get(installation, `vote:${requestId}`) !== undefined
  }

  spend(installation: string, date: string, amount: number, requestId: string, now: number): boolean {
    const changed = this.prepare(`UPDATE incense_wallet SET available=available-?,version=version+1,updated_at=?
      WHERE installation_id=? AND available>=?`).run(amount, now, installation, amount)
    if (Number(changed.changes) !== 1) return false
    this.prepare(`UPDATE daily_incense_state SET used_incense=used_incense+?,version=version+1,updated_at=?
      WHERE installation_id=? AND business_date=?`).run(amount, now, installation, date)
    this.entry(installation, `vote:${requestId}`, 'vote', -amount, 0, date, now)
    return true
  }

  ensureMarket(caseRow: CaseRow, now: number): void {
    // A same-day operator replacement ends the one daily game, never starts a second.
    if (this.prepare('SELECT 1 FROM liang_market WHERE business_date=?').get(caseRow.business_date) !== undefined) return
    const date = caseRow.business_date
    const opens = marketBusinessHour(date, this.timezone, MARKET_BATCH_HOURS[0][0])
    const dates = createBusinessDateProvider(this.timezone)
    const closes = businessDayEndsAt(dates, marketBusinessHour(date, this.timezone, 12))
    const id = `market-${caseRow.id}`
    this.prepare(`INSERT INTO liang_market(id,case_id,business_date,timezone,opens_at,closes_at,status,created_at,rule_version)
      VALUES (?,?,?,?,?,?,'open',?,?)`).run(id, caseRow.id, date, this.timezone, opens, closes, now, MARKET_RULE_VERSION)
    const hours = MARKET_BATCH_HOURS
    for (let i = 0; i < hours.length; i += 1) {
      const [open, lock, reference] = hours[i]!
      // Installing after a cutoff must not invent a historical reference.
      const referenceAt = marketBusinessHour(date, this.timezone, reference)
      const missed = now >= referenceAt
      this.prepare(`INSERT INTO liang_market_batch
        (market_id,batch,opens_at,locks_at,reference_at,status,result)
        VALUES (?,?,?,?,?,?,?)`).run(id, i + 1, marketBusinessHour(date, this.timezone, open),
          marketBusinessHour(date, this.timezone, lock), referenceAt, missed ? 'void' : 'pending', missed ? 'void' : null)
    }
    this.touch(id)
  }

  /** MUST run before a new vote or daily-case rollover mutates raw counts. */
  advance(now: number): void {
    const markets = this.prepare("SELECT * FROM liang_market WHERE status='open' ORDER BY closes_at").all() as unknown as MarketRow[]
    for (const market of markets) {
      this.assertRule(market.rule_version)
      const caseRow = this.store.caseById(market.case_id)
      if (caseRow === undefined || (caseRow.status === 'closed' && now < market.closes_at)) {
        this.cancel(market.case_id, now)
        continue
      }
      const batches = this.batches(market.id)
      for (const batch of batches) {
        if (batch.status === 'void' || batch.status === 'settled') continue
        if (now >= batch.reference_at && batch.reference_point === null) {
          const point = this.point(market.case_id, batch.reference_at)
          const pools = this.pools(market.id, batch.batch)
          if (!validMarketReference(point) || pools.long === 0 || pools.short === 0) {
            this.settleBatch(market, batch, 'void', null, now)
          } else {
            this.prepare("UPDATE liang_market_batch SET reference_point=?,status='live' WHERE market_id=? AND batch=?")
              .run(JSON.stringify(point), market.id, batch.batch)
            this.touch(market.id)
          }
        } else if (now >= batch.locks_at && batch.status !== 'locked' && batch.status !== 'live') {
          const pools = this.pools(market.id, batch.batch)
          if (pools.long === 0 || pools.short === 0) this.settleBatch(market, batch, 'void', null, now)
          else {
            this.prepare("UPDATE liang_market_batch SET status='locked' WHERE market_id=? AND batch=?").run(market.id, batch.batch)
            this.touch(market.id)
          }
        } else if (now >= batch.opens_at && batch.status === 'pending') {
          this.prepare("UPDATE liang_market_batch SET status='open' WHERE market_id=? AND batch=?").run(market.id, batch.batch)
          this.touch(market.id)
        }
      }
      if (now >= market.closes_at) {
        const close = this.point(market.case_id, market.closes_at)
        for (const batch of this.batches(market.id)) {
          if (batch.status === 'settled' || batch.status === 'void') continue
          const reference = this.parsePoint(batch.reference_point)
          const compared = reference === null ? null : compareMarketRatios(close, reference)
          const result: MarketResult = compared === null ? 'void' : compared === 0 ? 'draw' : compared > 0 ? 'long' : 'short'
          this.settleBatch(market, batch, result, reference, now)
        }
        this.prepare("UPDATE liang_market SET status='closed',close_point=?,settled_at=? WHERE id=? AND status='open'")
          .run(JSON.stringify(close), now, market.id)
        this.writeReceipts({ ...market, status: 'closed', close_point: JSON.stringify(close), settled_at: now }, now)
        this.touch(market.id)
      }
    }
  }

  cancel(caseId: string, now: number): void {
    const market = this.marketForCase(caseId)
    if (market === undefined || market.status !== 'open') return
    this.assertRule(market.rule_version)
    for (const batch of this.batches(market.id)) {
      if (batch.status !== 'void' && batch.status !== 'settled') this.settleBatch(market, batch, 'void', this.parsePoint(batch.reference_point), now)
    }
    this.prepare("UPDATE liang_market SET status='cancelled',settled_at=? WHERE id=?").run(now, market.id)
    this.writeReceipts({ ...market, status: 'cancelled', settled_at: now }, now)
    this.touch(market.id)
  }

  state(installation: string, caseRow: CaseRow, now: number): MarketState {
    return this.streamStateFactory(caseRow, now)(installation)
  }

  /** Capture public data once; private data is always selected by installation. */
  streamStateFactory(caseRow: CaseRow, now: number): (installation: string, previous?: MarketState) => MarketState {
    const row = this.marketForCase(caseRow.id)
    const market = row === undefined ? null : this.view(row, null)
    const candle = this.currentCandle(caseRow.id)
    const common: Omit<MarketState, 'wallet' | 'market'> = { schema_version: 1, server_time: now, soft_trust: true,
      candle_interval_ms: MARKET_CANDLE_INTERVAL_MS, current_point: this.point(caseRow.id, now),
      ...(candle === undefined ? {} : { current_candle: candle }) }
    return (installation, previous) => {
      const wallet = this.wallet(installation)
      // The previous state is private to this subscription. Position changes
      // (including same-amount direction changes) also increment wallet.version.
      const reusable = previous !== undefined && this.stateOwners.get(previous) === installation
        && previous.market?.id === market?.id && previous.wallet.version === wallet.version
      const positions = reusable ? previous?.market?.batches : market === null ? [] :
        (this.prepare('SELECT * FROM liang_market_position WHERE installation_id=? AND market_id=?')
          .all(installation, market.id) as unknown as PositionRow[])
          .filter(p => p.amount > 0).map(p => ({ batch: p.batch, position: { side: p.side, amount: p.amount,
            submitted_at: p.created_at, payout: p.payout } }))
      const state: MarketState = { ...common, wallet, market: market === null ? null : { ...market,
        batches: market.batches.map(b => ({ ...b, position: positions?.find(p => p.batch === b.batch)?.position ?? null })) } }
      this.stateOwners.set(state, installation)
      return state
    }
  }

  setPosition(installation: string, request: MarketPositionRequest, caseRow: CaseRow, now: number): MarketPositionResponse {
    const payload = JSON.stringify([request.market_id, request.batch, request.side, request.amount])
    const old = this.prepare('SELECT payload,accepted,reason FROM liang_market_request WHERE installation_id=? AND request_id=?')
      .get(installation, request.request_id) as { payload: string, accepted: number, reason: string | null } | undefined
    if (old !== undefined) return { accepted: old.payload === payload && old.accepted === 1,
      reason: old.payload === payload ? old.reason : 'idempotency_conflict', request_id: request.request_id,
      state: this.state(installation, caseRow, now) }
    const market = this.marketForCase(caseRow.id)
    if (market !== undefined) this.assertRule(market.rule_version)
    const batch = market === undefined ? undefined : this.batches(market.id).find(b => b.batch === request.batch)
    let reason: string | null = null
    if (market === undefined || market.id !== request.market_id || market.status !== 'open') reason = 'market_not_open'
    else if (batch === undefined || now < batch.opens_at || now >= batch.locks_at || batch.status !== 'open') reason = 'batch_not_open'
    const prior = market === undefined ? undefined : this.position(market.id, request.batch, installation)
    const difference = request.amount - (prior?.amount ?? 0)
    if (reason === null && difference > this.wallet(installation).available_incense) reason = 'insufficient_incense'
    if (reason === null && market !== undefined) {
      if (!this.adjust(installation, -difference, difference, `order:${request.request_id}`, 'position', market.business_date, now)) {
        reason = 'insufficient_incense'
      } else {
        this.prepare(`INSERT INTO liang_market_position(market_id,batch,installation_id,side,amount,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?) ON CONFLICT(market_id,batch,installation_id) DO UPDATE SET
          side=excluded.side,amount=excluded.amount,updated_at=excluded.updated_at`)
          .run(market.id, request.batch, installation, request.side ?? prior?.side ?? 'long', request.amount, now, now)
        this.touch(market.id)
      }
    }
    this.prepare(`INSERT INTO liang_market_request(installation_id,request_id,payload,accepted,reason,created_at)
      VALUES (?,?,?,?,?,?)`).run(installation, request.request_id, payload, reason === null ? 1 : 0, reason, now)
    return { accepted: reason === null, reason, request_id: request.request_id, state: this.state(installation, caseRow, now) }
  }

  history(installation: string, cursor?: string, limit = MARKET_HISTORY_PAGE_DEFAULT): MarketHistoryResponse {
    this.pageLimit(limit, MARKET_HISTORY_PAGE_MAX)
    const before = this.cursorNumber(cursor)
    const rows = this.prepare(`SELECT id,receipt_json FROM liang_market_receipt
      WHERE installation_id=? AND id<? ORDER BY id DESC LIMIT ?`).all(installation, before, limit + 1) as Array<{ id: number, receipt_json: string }>
    const page = rows.slice(0, limit)
    return { schema_version: 1, receipts: page.map(r => JSON.parse(r.receipt_json) as MarketReceipt),
      next_cursor: rows.length > limit ? String(page.at(-1)!.id) : null }
  }

  candles(caseRow: CaseRow, cursor?: string, limit = MARKET_CANDLES_PAGE_MAX, interval: MarketCandleIntervalMs = MARKET_CANDLE_INTERVAL_MS): MarketCandlesResponse {
    this.pageLimit(limit, MARKET_CANDLES_PAGE_MAX)
    const after = cursor === undefined ? -1 : this.cursorNumber(cursor)
    const table = interval === MARKET_LEGACY_CANDLE_INTERVAL_MS ? 'liang_market_candle' : 'liang_market_minute_candle'
    const rows = this.prepare(`SELECT at,open,high,low,close,up_votes,down_votes,volume FROM ${table}
      WHERE case_id=? AND at>? ORDER BY at LIMIT ?`).all(caseRow.id, after, limit + 1) as unknown as MarketCandlesResponse['candles']
    const page = rows.slice(0, limit)
    return { schema_version: 1, case_id: caseRow.id, business_date: caseRow.business_date,
      interval_ms: interval, candles: page, next_cursor: rows.length > limit ? String(page.at(-1)!.at) : null }
  }

  currentCandle(caseId: string): MarketCandlesResponse['candles'][number] | undefined {
    return this.prepare(`SELECT at,open,high,low,close,up_votes,down_votes,volume FROM liang_market_minute_candle
      WHERE case_id=? ORDER BY at DESC LIMIT 1`).get(caseId) as MarketCandlesResponse['candles'][number] | undefined
  }

  recordCandle(caseRow: CaseRow, now: number, before?: StatsRow, volume = 0): void {
    const stats = this.store.statsFor(caseRow.id)!
    const at = Math.floor(now / MARKET_CANDLE_INTERVAL_MS) * MARKET_CANDLE_INTERVAL_MS
    const total = stats.up_votes + stats.down_votes
    const ratio = total === 0 ? null : stats.up_votes / total
    const oldTotal = before === undefined ? 0 : before.up_votes + before.down_votes
    const opening = before === undefined ? ratio : oldTotal === 0 ? null : before.up_votes / oldTotal
    const values = [opening, ratio].filter((v): v is number => v !== null)
    const high = values.length === 0 ? null : Math.max(...values)
    const low = values.length === 0 ? null : Math.min(...values)
    this.prepare(`INSERT INTO liang_market_minute_candle(case_id,business_date,at,open,high,low,close,up_votes,down_votes,volume)
      VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(case_id,at) DO UPDATE SET
      open=COALESCE(liang_market_minute_candle.open,excluded.open),
      high=CASE WHEN liang_market_minute_candle.high IS NULL THEN excluded.high WHEN excluded.high IS NULL THEN liang_market_minute_candle.high ELSE MAX(liang_market_minute_candle.high,excluded.high) END,
      low=CASE WHEN liang_market_minute_candle.low IS NULL THEN excluded.low WHEN excluded.low IS NULL THEN liang_market_minute_candle.low ELSE MIN(liang_market_minute_candle.low,excluded.low) END,
      close=excluded.close,up_votes=excluded.up_votes,down_votes=excluded.down_votes,volume=liang_market_minute_candle.volume+excluded.volume`)
      .run(caseRow.id, caseRow.business_date, at, opening, high, low, ratio, stats.up_votes, stats.down_votes, volume)
  }

  private settleBatch(market: MarketRow, batch: BatchRow, result: MarketResult, reference: MarketPoint | null, now: number): void {
    const positions = this.positions(market.id, batch.batch).filter(p => p.amount > 0)
    const payouts = distributeMarketPool(positions.map(p => ({ id: p.id, side: p.side, count: p.amount })),
      result === 'long' || result === 'short' ? result : null)
    for (const p of positions) {
      if (p.payout !== null) continue
      const payout = payouts.get(p.id)!
      if (!this.adjust(p.installation_id, payout, -p.amount, `settle:${market.id}:${batch.batch}`, 'settlement', market.business_date, now)) {
        throw new Error('market settlement does not match frozen funds')
      }
      this.prepare('UPDATE liang_market_position SET payout=? WHERE id=? AND payout IS NULL').run(payout, p.id)
    }
    this.prepare(`UPDATE liang_market_batch SET status=?,result=?,reference_point=? WHERE market_id=? AND batch=?`)
      .run(result === 'void' ? 'void' : 'settled', result, reference === null ? batch.reference_point : JSON.stringify(reference), market.id, batch.batch)
    this.touch(market.id)
  }

  private writeReceipts(market: MarketRow, now: number): void {
    const positions = this.prepare('SELECT * FROM liang_market_position WHERE market_id=? AND amount>0 ORDER BY id').all(market.id) as unknown as PositionRow[]
    const owners = new Map<string, PositionRow[]>()
    for (const position of positions) {
      const own = owners.get(position.installation_id)
      if (own === undefined) owners.set(position.installation_id, [position])
      else own.push(position)
    }
    const batches = this.batches(market.id)
    for (const [installation, own] of owners) {
      const invested = own.reduce((n, p) => n + p.amount, 0)
      const returned = own.reduce((n, p) => n + (p.payout ?? 0), 0)
      const receipt: MarketReceipt = { id: `${market.id}:receipt:${own[0]!.id}`, market_id: market.id,
        rule_version: market.rule_version,
        business_date: market.business_date, settled_at: now, invested_incense: invested,
        returned_incense: returned, pnl_incense: returned - invested,
        close_point: this.parsePoint(market.close_point), batches: own.map(p => {
          const batch = batches.find(b => b.batch === p.batch)!
          return { batch: p.batch, side: p.side, amount: p.amount, payout: p.payout ?? 0,
            result: batch.result ?? 'void', reference: this.parsePoint(batch.reference_point) }
        }) }
      this.prepare(`INSERT OR IGNORE INTO liang_market_receipt(installation_id,market_id,receipt_json,settled_at)
        VALUES (?,?,?,?)`).run(installation, market.id, JSON.stringify(receipt), now)
    }
  }

  private adjust(installation: string, available: number, frozen: number, reference: string, kind: string, date: string, now: number): boolean {
    const changed = this.prepare(`UPDATE incense_wallet SET available=available+?,frozen=frozen+?,version=version+1,updated_at=?
      WHERE installation_id=? AND available+?>=0 AND frozen+?>=0
      AND available+frozen+?+?<=9007199254740991`).run(available, frozen, now, installation, available, frozen, available, frozen)
    if (Number(changed.changes) !== 1) return false
    this.entry(installation, reference, kind, available, frozen, date, now)
    return true
  }

  private touch(marketId: string): void {
    this.prepare('UPDATE liang_market SET version=version+1 WHERE id=?').run(marketId)
  }

  private entry(installation: string, reference: string, kind: string, available: number, frozen: number, date: string, now: number): void {
    this.prepare(`INSERT INTO incense_wallet_entry
      (installation_id,reference,kind,available_delta,frozen_delta,business_date,created_at) VALUES (?,?,?,?,?,?,?)`)
      .run(installation, reference, kind, available, frozen, date, now)
  }

  private view(market: MarketRow, installation: string | null): DailyMarket {
    this.invalidateRolledBackReads()
    this.assertRule(market.rule_version)
    let shared = this.batchCache.get(market.id)
    if (shared === undefined || shared.version !== market.version) {
      shared = { version: market.version, batches: this.batches(market.id) }
      if (this.batchCache.size >= 8) this.batchCache.delete(this.batchCache.keys().next().value!)
      this.batchCache.set(market.id, shared)
    }
    const ownRows = installation === null ? [] : this.prepare('SELECT * FROM liang_market_position WHERE installation_id=? AND market_id=?')
      .all(installation, market.id) as unknown as PositionRow[]
    return { id: market.id, case_id: market.case_id, business_date: market.business_date, timezone: market.timezone,
      rule_version: market.rule_version, opens_at: market.opens_at, closes_at: market.closes_at,
      status: market.status, close_point: this.parsePoint(market.close_point), batches: shared.batches.map(batch => {
        const pools = this.pools(market.id, batch.batch, market.version)
        const own = ownRows.find(p => p.batch === batch.batch)
        return { batch: batch.batch, opens_at: batch.opens_at, locks_at: batch.locks_at,
          reference_at: batch.reference_at, status: batch.status, reference: this.parsePoint(batch.reference_point),
          result: batch.result, long_incense: pools.long, short_incense: pools.short,
          position: own === undefined || own.amount === 0 ? null : { side: own.side, amount: own.amount,
            submitted_at: own.created_at, payout: own.payout } }
      }) }
  }

  private point(caseId: string, at: number): MarketPoint {
    const stats = this.store.statsFor(caseId)
    return { case_id: caseId, at, up_votes: stats?.up_votes ?? 0, down_votes: stats?.down_votes ?? 0, sequence: stats?.version ?? 0 }
  }
  private assertRule(rule: string): asserts rule is MarketRuleVersion {
    if (!isMarketRuleVersion(rule)) throw new WireError('market.rule_version', 'unsupported recorded market rule; funds remain unchanged')
  }
  private walletRow(id: string): WalletRow | undefined { return this.prepare('SELECT * FROM incense_wallet WHERE installation_id=?').get(id) as unknown as WalletRow | undefined }
  private cursor(id: string, date: string): CursorRow | undefined { return this.prepare('SELECT * FROM incense_wallet_cursor WHERE installation_id=? AND business_date=?').get(id, date) as CursorRow | undefined }
  private marketForCase(caseId: string): MarketRow | undefined { return this.prepare('SELECT * FROM liang_market WHERE case_id=?').get(caseId) as unknown as MarketRow | undefined }
  private batches(id: string): BatchRow[] { return this.prepare('SELECT * FROM liang_market_batch WHERE market_id=? ORDER BY batch').all(id) as unknown as BatchRow[] }
  private positions(id: string, batch: number): PositionRow[] { return this.prepare('SELECT * FROM liang_market_position WHERE market_id=? AND batch=? ORDER BY id').all(id, batch) as unknown as PositionRow[] }
  private position(id: string, batch: number, installation: string): PositionRow | undefined { return this.prepare('SELECT * FROM liang_market_position WHERE market_id=? AND batch=? AND installation_id=?').get(id, batch, installation) as unknown as PositionRow | undefined }
  private pools(id: string, batch: number, knownVersion?: number): { long: number, short: number } {
    this.invalidateRolledBackReads()
    const version = knownVersion ?? (this.prepare('SELECT version FROM liang_market WHERE id=?').get(id) as { version: number }).version
    let cached = this.poolCache.get(id)
    if (cached === undefined || cached.version !== version) {
      const rows = this.prepare('SELECT batch,side,SUM(amount) AS amount FROM liang_market_position WHERE market_id=? GROUP BY batch,side')
        .all(id) as Array<{ batch: number, side: MarketSide, amount: number }>
      const pools = new Map<number, { long: number, short: number }>()
      for (const row of rows) {
        const pool = pools.get(row.batch) ?? { long: 0, short: 0 }
        pool[row.side] = row.amount
        pools.set(row.batch, pool)
      }
      cached = { version, pools }
      if (this.poolCache.size >= 8) this.poolCache.delete(this.poolCache.keys().next().value!)
      this.poolCache.set(id, cached)
    }
    return cached.pools.get(batch) ?? { long: 0, short: 0 }
  }
  private invalidateRolledBackReads(): void {
    if (this.cachedRollbackVersion === this.store.rollbackVersion) return
    // A rolled-back market version can be reused by a different committed
    // order. The version alone must never validate an uncommitted projection.
    this.poolCache.clear()
    this.batchCache.clear()
    this.cachedRollbackVersion = this.store.rollbackVersion
  }
  private parsePoint(raw: string | null): MarketPoint | null { return raw === null ? null : JSON.parse(raw) as MarketPoint }
  private cursorNumber(value: string | undefined): number {
    if (value === undefined) return Number.MAX_SAFE_INTEGER
    if (!/^\d{1,16}$/.test(value) || !Number.isSafeInteger(Number(value))) throw new WireError('cursor', 'expected a non-negative integer cursor')
    return Number(value)
  }
  private pageLimit(value: number, max: number): void {
    if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new WireError('limit', `expected an integer in [1,${max}]`)
  }
}
