import { describe, expect, it } from 'vitest'
import {
  ARCHIVE_DAY_DETAIL_COLUMNS,
  ArchiveDayFactsRow,
  ArchiveFacts,
  buildArchiveFacts,
  calendarDates,
  isCompactLiangciMonth,
} from '../src/client/LiangciModal.tsx'
import { VOTER_STAT_LABEL } from '../src/shared/index.ts'
import { findByAttr, renderDeep, styleOf, textContent } from './helpers/render.ts'

describe('梁祠 month grid', () => {
  it('uses only the calendar rows the month actually needs', () => {
    expect(calendarDates('2021-02')).toHaveLength(28) // Monday-start, 4 weeks
    expect(calendarDates('2026-08')).toHaveLength(42) // Saturday-start, 6 weeks
    expect(calendarDates('2026-09')).toHaveLength(35) // Tuesday-start, 5 weeks
  })

  it('still returns complete Monday-to-Sunday rows', () => {
    for (const month of ['2021-02', '2026-08', '2026-09']) {
      const dates = calendarDates(month)
      expect(dates.length % 7).toBe(0)
      expect(dates.some(date => date.startsWith(month))).toBe(true)
    }
  })

  it('compacts six-row artwork without changing the dialog height', () => {
    expect(isCompactLiangciMonth(calendarDates('2026-08').length / 7)).toBe(true)
    expect(isCompactLiangciMonth(calendarDates('2026-09').length / 7)).toBe(false)
  })

  it('keeps 五行香客 on the same fact as its count, never the coverage cell', () => {
    const facts = buildArchiveFacts(250, 7124, 13, '1 案')
    expect(facts.map(fact => fact.key)).toEqual(['position', 'incense', 'voters', 'split', 'covered'])
    expect(facts.find(fact => fact.label === VOTER_STAT_LABEL)).toEqual({
      key: 'voters',
      label: '五行香客',
      value: '13',
    })
    expect(facts.find(fact => fact.key === 'covered')?.value).toBe('1 案')
    expect(facts.find(fact => fact.label === VOTER_STAT_LABEL)?.value).not.toBe('1 案')
  })

  it('shows all five day facts without a horizontal scroller and lets 当日梁案 take leftover space', () => {
    const tree = renderDeep(ArchiveFacts({
      up: 1367,
      down: 4600,
      voters: 10,
      covered: '1 案',
    }))
    const facts = findByAttr(tree, 'data-liangci-facts')[0]
    expect(styleOf(facts).overflow).toBe('visible')
    expect(styleOf(facts).overflowX).toBeUndefined()
    expect(styleOf(facts).gridTemplateColumns).toBe('repeat(5, max-content)')
    expect(ARCHIVE_DAY_DETAIL_COLUMNS).toBe('max-content minmax(140px, 1fr)')
    const day = renderDeep(ArchiveDayFactsRow({
      archive: {
        businessDate: '2026-08-28',
        upVotes: 1367,
        downVotes: 4600,
        uniqueVoters: 10,
        totalIncense: 5967,
        upRatio: 0.22909334,
        downRatio: 0.77090666,
        liangziState: 'liang_gong',
        caseCount: 1,
        caseTitles: ['今天还要加班是夯还是拉'],
        finalizedAt: 1,
        archiveVersion: 1,
        aggregationPolicyVersion: 'liang-archive-v1-weighted-counts',
        liangziPolicyVersion: 'v1',
      },
    }))
    const detail = findByAttr(day, 'data-liangci-day-detail')[0]
    expect(styleOf(detail).gridTemplateColumns).toBe(ARCHIVE_DAY_DETAIL_COLUMNS)
    expect(textContent(day)).toContain('当日梁案')
    expect(textContent(day)).toContain('今天还要加班是夯还是拉')
    expect(textContent(day)).toContain('五行香客')
    expect(textContent(day)).toContain('5,967')
  })
})
