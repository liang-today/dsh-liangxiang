import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CASE_BANK, nextCycledCaseTitle } from '../src/backend/case-bank.ts'

describe('case bank', () => {
  it('matches scripts/case-bank.txt', () => {
    const fromFile = readFileSync(resolve('scripts/case-bank.txt'), 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line !== '' && !line.startsWith('#'))
    expect(fromFile).toEqual([...CASE_BANK])
  })

  it('cycles and wraps', () => {
    expect(nextCycledCaseTitle(undefined)).toBe('DeepSeek Harness 是夯还是拉')
    expect(nextCycledCaseTitle('DeepSeek Harness 是夯还是拉')).toBe(CASE_BANK[1])
    expect(nextCycledCaseTitle(CASE_BANK.at(-1))).toBe(CASE_BANK[0])
  })
})
