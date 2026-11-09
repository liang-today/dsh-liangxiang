import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { activityIntent, type ActivityPolicy } from '../scripts/market-activity-policy.ts'
import { parseMarketActivityArguments, validateMarketActivityOptions } from '../scripts/rehearse-market-activity.ts'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture() {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'liangxiang-rehearsal-')); roots.push(root)
  const directory = join(root, 'rehearsal'); mkdirSync(directory)
  const prior = join(directory, 'previous'); mkdirSync(prior, { mode: 0o700 })
  const clockFile = join(directory, 'clock.json'), priorState = join(prior, 'state.json')
  writeFileSync(clockFile, JSON.stringify({ epoch_ms: Date.UTC(2026, 10, 8), anchor_wall_ms: Date.now(), rate: 0 }), { mode: 0o600 })
  writeFileSync(priorState, '{}', { mode: 0o600 })
  return { root, directory, clockFile, priorState, stateDir: join(directory, 'next'), mode: 'prepare' as const }
}
function policy(): ActivityPolicy { return { random: 0x6d2b79f5, probability: 0.5, target: 0.5, regimeUntil: 0, nextAt: 0, cursor: 0, actorDue: Array(12).fill(0) } }

describe('bounded simulated community activity', () => {
  it('disperses twelve real-wallet budgets without exceeding cadence or integer reserve', () => {
    const source = policy(), replay = policy(), balances = Array<number>(12).fill(4000)
    const times: number[] = [], actors = Array<number>(12).fill(0)
    let up = 0, down = 0
    for (let now = 1; now <= 1_200_000; now += 5) {
      const next = activityIntent(source, now, balances, 0.5)
      expect(activityIntent(replay, now, balances, 0.5)).toEqual(next)
      if (!next) continue
      expect(Number.isInteger(next.count)).toBe(true)
      expect(next.count).toBeGreaterThanOrEqual(1); expect(next.count).toBeLessThanOrEqual(3)
      balances[next.actor] = balances[next.actor]! - next.count
      expect(balances[next.actor]).toBeGreaterThanOrEqual(600)
      actors[next.actor] = actors[next.actor]! + 1
      if (next.vote_type === 'up') up += next.count; else down += next.count
      times.push(now)
    }
    let start = 0, maximum = 0
    for (let i = 0; i < times.length; i++) { while (times[i]! - times[start]! >= 1000) start++; maximum = Math.max(maximum, i - start + 1) }
    expect(maximum).toBeLessThanOrEqual(12)
    expect(Math.max(...actors) - Math.min(...actors)).toBeLessThanOrEqual(1)
    expect(up).toBeGreaterThan(0); expect(down).toBeGreaterThan(0)
  })
  it('stops spending at reserve and never invents available funds', () => {
    const source = policy(), balances = [600, 0, 599, 601]
    const before = [...balances]
    const next = activityIntent(source, 1, balances, null)
    expect(next?.actor).toBe(3); expect(next?.count).toBe(1)
    expect(balances).toEqual(before)
    expect(activityIntent(source, 1000, [600, 0, 599, 600], null)).toBeNull()
  })
  it('permits only explicit distinct private rounds beside the protected rehearsal clock', () => {
    const input = fixture(), before = readFileSync(input.priorState)
    expect(validateMarketActivityOptions(input)).toMatchObject({ stateDir: input.stateDir, maxDays: 10 })
    expect(readFileSync(input.priorState)).toEqual(before)
    expect(() => validateMarketActivityOptions({ ...input, stateDir: input.directory })).toThrow()
    expect(() => validateMarketActivityOptions({ ...input, stateDir: join(input.root, 'outside') })).toThrow()
    expect(() => validateMarketActivityOptions({ ...input, stateDir: join(input.directory, 'previous') })).toThrow()
  })
  it('rejects linked state and invalid clock without contacting a server', () => {
    const input = fixture(), alias = join(input.directory, 'alias')
    symlinkSync(join(input.directory, 'previous'), alias)
    expect(() => validateMarketActivityOptions({ ...input, stateDir: alias })).toThrow()
    rmSync(input.priorState); symlinkSync(input.clockFile, input.priorState)
    expect(() => validateMarketActivityOptions(input)).toThrow()
    rmSync(input.priorState); writeFileSync(input.priorState, '{}')
    writeFileSync(input.clockFile, JSON.stringify({ epoch_ms: Date.now(), anchor_wall_ms: Date.now(), rate: -1 }))
    expect(() => validateMarketActivityOptions(input)).toThrow()
  })
  it.each(['0', '11', 'NaN', '1.5'])('rejects unbounded or invalid day limit %s', value => {
    expect(() => parseMarketActivityArguments(['--state-dir', '/unused/next', '--prior-state', '/unused/previous/state.json', '--clock-file', '/unused/clock.json', '--max-days', value])).toThrow()
  })
  it('has no configurable remote URL or unsigned authentication escape', () => {
    expect(() => parseMarketActivityArguments(['--url', 'https://example.invalid'])).toThrow()
    expect(() => parseMarketActivityArguments(['--allow-unsigned', '1'])).toThrow()
    expect(parseMarketActivityArguments(['--state-dir', '/unused/next', '--prior-state', '/unused/previous/state.json', '--clock-file', '/unused/clock.json', '--max-days', '2'])).toMatchObject({ mode: 'prepare', maxDays: 2 })
  })
})
