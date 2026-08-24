/**
 * Local-only incense ledger: this installation's 夯/拉 sticks, never sent
 * to the community. Today resets with the business date; lifetime does not.
 * Contribution to 梁位 is the share of 三界香火, not a verified vote weight.
 */
import { formatRatioPercents, WAITING_PERCENT_TEXT } from './presentation.ts'

export interface LocalIncenseLedger {
  lifetimeUp: number
  lifetimeDown: number
  todayUp: number
  todayDown: number
}

export const EMPTY_LOCAL_INCENSE: LocalIncenseLedger = {
  lifetimeUp: 0,
  lifetimeDown: 0,
  todayUp: 0,
  todayDown: 0,
}

export interface LocalIncenseSide {
  up: number
  down: number
  total: number
  /** Truncated 夯 percent, or `--` when this side has no sticks. */
  upShare: string
}

export interface LocalIncenseStats {
  today: LocalIncenseSide
  lifetime: LocalIncenseSide
}

function sideOf(up: number, down: number): LocalIncenseSide {
  const safeUp = Number.isFinite(up) ? Math.max(0, Math.floor(up)) : 0
  const safeDown = Number.isFinite(down) ? Math.max(0, Math.floor(down)) : 0
  return {
    up: safeUp,
    down: safeDown,
    total: safeUp + safeDown,
    upShare: formatRatioPercents(safeUp, safeDown).up,
  }
}

export function deriveLocalIncenseStats(ledger: LocalIncenseLedger): LocalIncenseStats {
  return {
    today: sideOf(ledger.todayUp, ledger.todayDown),
    lifetime: sideOf(ledger.lifetimeUp, ledger.lifetimeDown),
  }
}

export function recordLocalIncenseVote(
  ledger: LocalIncenseLedger,
  voteType: 'up' | 'down',
  spent: number,
): LocalIncenseLedger {
  const add = Number.isFinite(spent) ? Math.max(0, Math.floor(spent)) : 0
  if (add === 0) return ledger
  if (voteType === 'up') {
    return {
      lifetimeUp: ledger.lifetimeUp + add,
      lifetimeDown: ledger.lifetimeDown,
      todayUp: ledger.todayUp + add,
      todayDown: ledger.todayDown,
    }
  }
  return {
    lifetimeUp: ledger.lifetimeUp,
    lifetimeDown: ledger.lifetimeDown + add,
    todayUp: ledger.todayUp,
    todayDown: ledger.todayDown + add,
  }
}

/**
 * Drop today's slice when the business date moved. Lifetime is already
 * accumulated on each accepted vote, so yesterday is not added again.
 */
export function rollLocalIncenseDay(ledger: LocalIncenseLedger): LocalIncenseLedger {
  if (ledger.todayUp === 0 && ledger.todayDown === 0) return ledger
  return { ...ledger, todayUp: 0, todayDown: 0 }
}

/**
 * Share of a community pile. `--` when the world has no incense; never
 * claims a 梁位 percentage-point movement.
 */
export function formatIncenseShare(mine: number, world: number): string {
  const safeMine = Number.isFinite(mine) ? Math.max(0, Math.floor(mine)) : 0
  const safeWorld = Number.isFinite(world) ? Math.max(0, Math.floor(world)) : 0
  if (safeWorld <= 0) return WAITING_PERCENT_TEXT
  const ratio = safeMine / safeWorld
  if (ratio <= 0) return '0%'
  if (ratio < 0.0001) return '<0.01%'
  if (ratio < 0.01) return `${(Math.floor(ratio * 10_000) / 100).toFixed(2)}%`
  if (ratio < 0.1) return `${(Math.floor(ratio * 1_000) / 10).toFixed(1)}%`
  return `${Math.floor(ratio * 100)}%`
}
